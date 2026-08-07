# PowerBody API integration

The live PowerBody dropshipping integration: pulling products in, keeping them up to
date, and placing orders. Written against their **Dropshipping API guide (June 2026)**.

`POWERBODY_STRIPE_PLAN.md` is the original plan; this document describes what is now
built and how to switch it on.

---

## The three switches

The single most important thing to understand: **browsing the supplier, selling the
products, and placing orders are three separate settings.**

| | Setting | Values | Default | Controls |
|---|---|---|---|---|
| **Shop** | `NEXT_PUBLIC_DATA_SOURCE` | `mock` · `real` | `mock` | Which catalogue customers see |
| **Read** | `SUPPLIER_SOURCE` | `mock` · `auto` · `powerbody` | `mock` | Where supplier products, stock and prices come from |
| **Write** | `SUPPLIER_ORDERING` | `simulate` · `live` | `simulate` | Whether "Send" in the fulfilment queue really places an order |

They are deliberately independent, which gives you a safe path in:

1. Point **Read** at live PowerBody and browse the real feed in the hub, while the shop
   still serves the mock catalogue and orders are still pretend.
2. Add the products you want (Hub → Products → PowerBody). They land in *our* catalogue —
   ours is the curated subset; customers only ever see what has been added.
3. Flip **Shop** to `real` when you are happy with what is in it.
4. Flip **Write** to `live` last, once you have worked a day's queue as a dry run.

Only step 4 can ship a parcel.

All three can be flipped at runtime from the Founders Hub (**Settings → Data source**,
**Settings → Supplier**, **Settings → Order sending**) without a redeploy; the portal
choice is persisted in the database and wins over the environment variables.

Two safety properties are enforced in code, not by convention:

- Live ordering additionally requires `SUPPLIER_SOURCE` to resolve to `powerbody`. Mock
  SKUs are fixtures — ordering them for real would buy products that don't exist.
- Anything other than exactly `live` simulates. A typo cannot arm real ordering.

The gate lives in `submitOrderToSupplier()` (`src/lib/orders/service.ts`), not in the API
route, so a cron, a webhook or a future caller cannot bypass it.

---

## Setup

Add to `.env.local` (git-ignored — never commit these):

```bash
SUPPLIER_SOURCE=powerbody
POWERBODY_API_URL=https://www.powerbody.co.uk/api/soap/
POWERBODY_API_USER=<your API username>
POWERBODY_API_KEY=<your API key>

# Leave these alone until you are ready.
SUPPLIER_ORDERING=simulate       # no order reaches PowerBody
NEXT_PUBLIC_DATA_SOURCE=mock     # the shop still serves the sample catalogue

# Rate-limit tuning — only touch these if you see HTTP 429.
POWERBODY_MAX_CONCURRENT=2
POWERBODY_MIN_INTERVAL_MS=150
POWERBODY_BUILD_DEADLINE_MS=20000
```

All three credentials are required: their API authenticates with
`login(username, apiKey)`, so a key on its own opens nothing. `hasPowerBodyCredentials()`
checks for all three, and the resolver falls back to mock when any is missing rather than
failing at request time.

Note from their guide: new API accounts start in a **DEMO/sandbox** with limited stock and
automatic order failures until PowerBody have verified the integration places orders
correctly. Ask your account manager to enable API access and permissions — it is not on by
default.

---

## How it works

### Rate limiting (HTTP 429)

PowerBody answer **429** when asked too fast, and `getProductInfo` is the easiest way to
trip it — one call per product, so detailing a few thousand products would be a few
thousand requests.

Three things deal with it:

- **Never detailing in bulk.** The expensive call is only made for products someone opens
  or adds (see below), so the request count follows what you are actually doing rather
  than the size of the feed.
- **Throttling.** At most `POWERBODY_MAX_CONCURRENT` (default 2) requests in flight, and
  at least `POWERBODY_MIN_INTERVAL_MS` (default 150ms) between starts.
- **Retry with backoff.** 429 and gateway errors are retried up to 4 times, honouring
  their `Retry-After` header when they send one, with jittered exponential backoff when
  they don't. After the budget it fails with a message naming the two knobs to turn.
- **A durable detail cache.** Detail is fetched **once per product** and kept in the
  database for 7 days, so a product you have already looked at costs nothing again.

If you still see 429s: lower `POWERBODY_MAX_CONCURRENT` first, then raise
`POWERBODY_MIN_INTERVAL_MS`. Their actual limit isn't documented.

One subtlety worth knowing: Magento returns **application faults with HTTP 500** — the
same status as a genuine server wobble. The body is therefore read before the status is
judged, so "Invalid product data" surfaces immediately instead of being retried five
times and buried.

### Browsing never pays for detail

Nothing fetches detail in bulk. Browsing reads the cheap list feed only — a few paged
calls whatever the catalogue's size — so the PowerBody page loads in well under a second
on a feed of thousands. `getProductInfo` is called for the products that actually need it:

- **Press Details on a row**, or tick some and press **Get details** (up to 50 a go).
- **Add a product.** Importing always fetches the full record first, so what lands in the
  catalogue is never a half-populated row.
- **Find by SKU.** Looking a SKU up fetches its detail on the spot.

Detail is cached durably for 7 days, so a product is fetched once however often it is
browsed, and the list gets richer as you work through it. The hub reports `detailed` /
`total` so a list of bare SKUs reads as "not fetched yet" rather than "broken".

**The money column does not depend on any of that.** A browse row shows what we pay, what
we would charge and what we would keep — for every product, with no detail call — because
we price from cost (`pricing/list-price.ts`: cost × 2 → .99, and explicit that RRP plays
no part). The margin is the real one from `unitEconomics` (net of VAT, dropship delivery,
card fees and returns), not price minus cost.

The one thing detail buys you here is **shipping weight**, which sets the delivery band. An
undetailed row assumes it, so its margin renders as `≈32%` rather than `32%` and
`marginEstimated` says why. PowerBody's own RRP is carried when known and null until then —
it is a was-price, and nothing prices off it. `SupplierProduct.detailed` is where the flag
comes from.

What is deliberately *not* done is fall back to the list feed's `price_tax` as an RRP: it
is wholesale-including-VAT, so it would render as a ~17% margin. A number that looks like
a fact and isn't has no business in front of a pricing decision.

Two backstops remain, because a supplier that stops answering must not hang the page.
`POWERBODY_BUILD_DEADLINE_MS` (default 20s) bounds a build end to end, paging included,
and must stay under the route's `maxDuration` (60s) — a single wire call can otherwise
run for over two minutes on its own (30s per attempt, retried four times), which is how
the hub used to end up stuck on "Loading the PowerBody feed…" forever. When the clock is
spent the build returns what has landed; `listComplete: false` says the feed was only
partly paged, and a catalogue cut short is cached for 30 seconds rather than 10 minutes so
the next load carries on. On the client the feed request has its own timeout and fails
loudly rather than spinning, and the **SKU lookup sits above the browse list** so it works
whatever the feed is doing.

### Transport — `powerbody/soap.ts`

PowerBody run Magento's classic SOAP v1 endpoint, whose entire surface is three calls:

```
login(username, apiKey) → sessionId
call(sessionId, 'dropshipping.<method>', jsonArgs) → mixed
endSession(sessionId)
```

Hand-rolled over `fetch` rather than pulling in a `soap` package: we touch exactly three
operations against one known endpoint, and a WSDL fetch-and-parse on every cold start buys
nothing. The client caches the session for 20 minutes, collapses a concurrent login
stampede into one login, and retries once on their "session expired" fault (code `5`) so a
long sync can cross the session lifetime instead of failing halfway through.

### Mapping — `powerbody/wire.ts`

Pure, dependency-free translation between their shapes and ours. Everything arrives as
JSON-decoded PHP, so numbers are usually strings and absences may be `null`, `''` or a
missing key — hence the defensive coercion. Things worth knowing:

- `price` is **our wholesale (dropship) cost**; `detail_price` is their retail price and
  becomes our `rrp`. `trade_price` is deliberately ignored — it is the *non-dropshipping*
  wholesale price, which we cannot pay and which would overstate every margin in the hub.
- `vat_rate` is a percentage; we hold a fraction.
- `weight` is kilograms; we hold grams. Their delivery pricing is weight-banded and
  `createOrder` requires a weight, so this is load-bearing for both margin and fulfilment.
- A product with `status: disabled` or `archival` reads as **out of stock even when
  `qty > 0`** — a disabled product stays visible for 30 days, and selling it takes an order
  nobody can fill.
- `ALREADY_EXISTS` from `createOrder` is treated as **success**, not failure. It means a
  previous attempt got through, so a retry of a timed-out order is safe rather than
  double-shipping.

### Adapter — `powerbody/live.ts`

Implements the same `SupplierProvider` interface as the mock, so nothing outside
`lib/supplier/` knows which is in use.

The critical design point is that **the feed is split in two**:

- `getProductList` — cheap, paged, carries sku/price/qty. Everything a stock-and-price
  refresh needs.
- `getProductInfo` — one call **per product**, and the only source of name, brand, image
  and description.

So `listProducts()` and `getStockLevels()` use the cheap call alone (catalogue cached 10
minutes), and `getProductsBySku()` is the **only** thing that calls `getProductInfo` —
which is what makes the expensive half affordable: it is paid for one product at a time,
for the products being opened or added. Getting this backwards turns a browse or a nightly
stock check into thousands of API calls, which is also why change detection was moved onto
`getStockLevels()`.

`SupplierProduct.detailed` carries the distinction outward, so a caller can tell a
fully-fetched product from a list-feed row instead of guessing from a blank brand.

### Keeping products up to date — `supplier/sync.ts`

Imported products are stored as a snapshot, which is right for curated fields and wrong for
the ones that move on their own. `syncImportedProducts()` refreshes **stock, availability,
cost and supplier RRP** — and nothing else.

It deliberately does **not** touch:

- titles, descriptions, images, stack slots, goals or any CHRGD attribute (founder- and
  AI-curated; a feed refresh silently overwriting them would undo real work);
- `basePrice`. Retail price is our own decision (cost ×2, rounded to .99) and changes go
  through the review flow in `lib/changes`, which exists precisely so a supplier price rise
  reaches customers through a decision rather than automatically. The sync moves `cost` so
  margin figures stay honest; what to charge stays a choice.

It also moves `defaultVariantId` off a variant that has just gone out of stock, so a
product page never opens preselected on something unbuyable.

Runs nightly as part of the daily cron, and on demand via
`POST /api/portal/supplier-sync`.

---

## Order flow

Nothing reaches the supplier until a founder has confirmed it. An order walks:

```
paid → (review: pending → approved) → submitted_to_supplier → supplier_confirmed → shipped
```

In **simulate** mode the order is placed against the **mock** supplier rather than being
short-circuited, so it can be submitted, synced, tracked and shipped exactly as a real one
— which is the whole reason to run a dry run instead of just not pressing the button.
Nothing leaves the process either way.

Each order records `supplierSimulated` at the moment it was sent, and the status sync reads
that flag from the **order**, not from the current setting. Flipping the switch to live
therefore cannot retarget yesterday's simulations at the real API.

The queue shows which mode it is in, the Send button changes its wording
("Simulate sending 3 approved" vs "Send 3 approved to PowerBody"), and the confirmation
message says which actually happened.

### Going live

1. Confirm the catalogue is on live PowerBody and stock looks right.
2. Work a day's queue in simulate mode end to end.
3. **Settings → Order sending → Send orders to PowerBody** (asks for confirmation).
4. Send one real order and check it appears in the PowerBody portal.

Orders arrive at PowerBody **unpaid**, resting at `holded`. They ship once paid — log in at
powerbody.eu with the same credentials, select the orders and check out (Sage Pay). There
are no credit accounts.

### Delivery exclusions

PowerBody will not dropship to Northern Ireland, Guernsey, Jersey, Switzerland or Norway,
and a UK account can only ship within the UK. The fulfilment queue flags these before you
send (`lib/pricing/zones.ts`) — they look like ordinary UK orders, and nothing else warns
you until the supplier refuses them.

---

## Finding and importing specific SKUs

The browse list is built from the cheap feed, which carries no names — so searching it by
name finds only products already detailed. **Find by SKU** (Products → PowerBody) goes
straight at named SKUs instead: paste them in any format — commas, spaces, newlines — and
it fetches their full records on the spot, shows cost/stock/margin, and imports them.

Every SKU in the list feed is reachable this way, including ones nothing has been fetched
for yet, and paging stops as soon as the requested SKUs have turned up. Running out of
time is reported as an error rather than a silent "not found" — a lookup that quietly
loses a SKU would be worse than one that fails.

## The daily check

`syncImportedProducts()` runs nightly (and on demand via **Check now**) over every product
you have imported, and records what moved:

- **Cost changes**, with the margin impact on our current retail price. We hold retail
  steady on purpose, so a supplier increase comes straight out of margin — anything pushed
  under `marginFloorPct` is flagged as needing a reprice or a delisting.
- **Stock flips** — what went out, what came back.
- **Delistings** — imported SKUs no longer in the feed at all.

This is separate from the change detection in `lib/changes`, which walks *subscriptions*.
That only raises an event when a moved SKU sits in someone's plan, so a cost rise on a shop
product nobody subscribes to would otherwise go unnoticed.

## Not implemented

Available in their API, no caller yet — add when there is a reason:

- `updateOrder` — amend an order before it completes.
- `getRefundOrders` — returns and refunds.
- `insertComment` / `getComments` — message exchange on an order.
- `getShippingMethod` — the transport code list. `createOrder` currently sends an empty
  `transport_code`, letting PowerBody pick; wire this up if you need to choose a service.
- `getPromoProductList` — promotional pricing (needs enabling by your account manager).

---

## Files

| File | Role |
|---|---|
| `src/lib/supplier/types.ts` | The provider contract everything talks to |
| `src/lib/supplier/index.ts` | Mock ↔ live resolver + credential check |
| `src/lib/supplier/ordering.ts` | The simulate ↔ live ordering switch |
| `src/lib/supplier/sync.ts` | Refresh imported products from the feed |
| `src/lib/supplier/powerbody/soap.ts` | SOAP transport, session handling, throttling + 429 retry |
| `src/lib/supplier/powerbody/detail-cache.ts` | Durable per-product detail cache |
| `src/lib/data-source.ts` | Which catalogue the shop serves (mock ↔ real) |
| `src/lib/supplier/powerbody/wire.ts` | Their shapes ↔ ours (pure) |
| `src/lib/supplier/powerbody/live.ts` | The live adapter |
| `src/lib/supplier/powerbody/mock.ts` | The mock, also used as the order simulator |
| `src/lib/supplier/sku-input.ts` | Parsing a pasted list of SKUs |
| `src/lib/orders/service.ts` | Approval gate + the ordering gate |
| `src/app/api/portal/ordering-mode/route.ts` | Read/set the ordering switch |
| `src/app/api/portal/supplier-sync/route.ts` | "Sync now" |
