# PowerBody API integration

The live PowerBody dropshipping integration: pulling products in, keeping them up to
date, and placing orders. Written against their **Dropshipping API guide (June 2026)**.

`POWERBODY_STRIPE_PLAN.md` is the original plan; this document describes what is now
built and how to switch it on.

---

## The three switches

The single most important thing to understand: **reading the supplier, selling the
products, and placing orders are three separate settings.**

| | Setting | Values | Default | Controls |
|---|---|---|---|---|
| **Shop** | `NEXT_PUBLIC_DATA_SOURCE` | `mock` · `real` | `mock` | Which catalogue customers see |
| **Read** | `SUPPLIER_SOURCE` | `mock` · `auto` · `powerbody` | `mock` | Where supplier products, stock and prices come from |
| **Write** | `SUPPLIER_ORDERING` | `simulate` · `live` | `simulate` | Whether "Send" in the fulfilment queue really places an order |

They are deliberately independent, which gives you a safe path in:

1. Point **Read** at live PowerBody and pull real products in by SKU, while the shop
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

- **Never detailing in bulk.** The expensive call is only made for the SKUs actually being
  imported (see below), so the request count follows what you are doing rather than the
  size of the feed.
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

### There is no browse list — products come in by SKU

The hub used to try to pull PowerBody's whole catalogue through into a browsable
list. That was the wrong shape for the API underneath, and no amount of caching
fixed it: the cheap call carries no names, and the call that does is one
throttled request per product. So a browsable list was either a page of bare
supplier codes, or thousands of requests to make it readable. Neither is a way
to choose what to sell.

**Products → PowerBody** is now a SKU box. Paste the codes — off their site, a
spreadsheet, an email — and each one comes back whole: picture, name, brand,
category, live stock, their RRP, what we pay, what we would charge and what we
would keep. Then **Add**, which sends it to Review.

The cost of that is exactly the products you asked about: a few paged calls to
map SKU → product id, then one `getProductInfo` each. `getProductsBySku()` is the
only thing in the adapter that calls it. Detail is cached durably for 7 days, and
the SKU → row index for 10 minutes, so looking a product up and then adding it
does not read the feed twice.

**The money column does not depend on PowerBody's RRP.** We price from cost
(`pricing/list-price.ts`: cost × 2 → .99, and explicit that RRP plays no part),
so what a founder decides on is what we pay → what we would charge → what we
would keep. The margin is the real one from `unitEconomics` (net of VAT, dropship
delivery, card fees and returns), not price minus cost. Their RRP is carried as
the was-price it is. What is deliberately *not* done is fall back to the list
feed's `price_tax` as an RRP: it is wholesale-including-VAT, so it would render
as a ~17% margin — a number that looks like a fact and isn't.

`POWERBODY_BUILD_DEADLINE_MS` (default 20s) bounds a lookup end to end and must
stay under the route's `maxDuration` (60s): a single wire call can otherwise run
for over two minutes on its own (30s per attempt, retried four times), and a
request that outlives its own timeout is delivered to nobody.

**Where do you get a SKU from?** Off their site, a spreadsheet, an email — or
**Show me some SKUs** on the page, which reads one page of the cheap feed and
lists the codes in it. Codes only: no detail is fetched and nothing is named,
because that is what makes it cheap. It exists because a sandbox account's
products exist only in the API, so without it there is nowhere to find a code to
try. `sampleSkus()` on the provider, `GET /api/portal/supplier/skus?limit=n`.

### If a lookup comes back without a name

The reason reaches the screen in PowerBody's own words rather than being
swallowed, so the message is the diagnosis:

| What it says | What it means |
|---|---|
| *Resource path is not callable* / *Access denied* | `getProductInfo` is not enabled on this API account. New accounts start in PowerBody's **DEMO/sandbox** — placeholder products (`P64`, uniform prices, stock 10/100), no detail, orders auto-fail. Ask your account manager to enable API access and permissions. |
| *…with no product detail in it — they sent a record with only: x, y* | Both argument shapes were answered, neither with a product in it. The named keys are the clue: an echo of the request means the method is refusing rather than failing. |
| *…did not answer within 20s* | Their feed is slow or rate-limiting; try again. |
| *…sent these products without a product id* | The list feed changed shape. `product_id` is what `getProductInfo` is keyed on. |

`getProductInfo` is asked with a named argument (`{product_id}`) first, matching
`getProductList`'s `{page}`, and retried with a bare id if that comes back empty —
their guide reads both ways and which one an account answers to is not something
the code can settle in advance. The second call only happens when the first shape
is wrong.

A reply only counts as detail if it actually carries one of `name`,
`manufacturer`, `category`, `detail_price`, `description_en` or `image`. An echo
of the request, an empty record and an error envelope are all *objects*, and
accepting one as detail is what silently blocked the fallback and left products
named after their codes. The same test is applied to the durable cache on read,
so entries written by a bad run are treated as absent and re-fetched rather than
sitting there for their full 7 days.

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

So `getStockLevels()` uses the cheap call alone, and `getProductsBySku()` is the **only**
thing that calls `getProductInfo` — which is what makes the expensive half affordable: it
is paid for one product at a time, for the products actually being imported. There is
deliberately no "list the whole catalogue" call; getting this backwards turns a nightly
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

**Products → PowerBody** takes SKUs in any format — commas, spaces, newlines — fetches
their full records on the spot, shows what each one is and what it would make us, and
imports the ones you pick.

Every SKU in the list feed is reachable this way, including ones nothing has been fetched
for yet, and paging stops as soon as the requested SKUs have turned up. Running out of
time is reported as an error rather than a silent "not found" — a lookup that quietly
loses a SKU would be worse than one that fails.

## Import review — nothing is on sale until someone has looked

Adding a product from PowerBody does **not** put it in the shop. It lands in
**Products → Review** as `pending`, and `getResolvedCatalogue` filters pending
products out, so the shop, the quiz and every recommendation are blind to it
until a founder approves it.

The reason is what an imported product actually is: three kinds of information
wearing the same clothes.

| Source | Fields | Trust |
|---|---|---|
| **PowerBody** | title, description, image, category, cost, weight, VAT, servings, variants | Facts. Shown for context, nothing to confirm. |
| **Our rules** | list price (cost × 2 → .99), id, handle | Deterministic, but a price is worth a glance. |
| **AI / keyword classifier** | stack slots, goals, dietary tags, formats, swap group, stimulants, card copy, warnings | Guesses. Confirm or correct each one. |

The third row is the point. `autopopulate` gates copy against `APPROVED_CLAIMS`
so a model cannot invent a health claim — but the model also picks the **stack
slots, goals and dietary tags**, and none of that is claim-gated. Those fields
decide *who gets recommended the product*: a wrong dietary tag sells someone
something they cannot take, and a wrong stack slot puts a pre-workout in front
of someone who asked for sleep. So they are the fields a human has to sign off.

Supplier fields are deliberately **not** in the checklist. Putting eleven
faithful copies between a founder and the two fields a model wrote is how a
review becomes a rubber stamp.

Provenance is recorded per field at import time (`review.sources`) and the
screen labels every field with it, so "what did a machine decide here?" is
answerable at a glance rather than by memory.

One thing this fixed on the way in: the classifier supplies a `cost` estimated
from the shelf price for products that arrive without one, and the import used
to spread that over the real wholesale price — a £20.00 cost silently became
£21.99, and every margin in the hub was then computed from a number PowerBody
never sent. `withoutSupplierOwned` drops anything from the enrichment patch that
the supplier already answered.

## Flavours and sizes — one product, many SKUs

PowerBody have no concept of a variant: **every flavour and every size is its own
SKU**, with its own name. Imported one at a time, "Whey 1kg Chocolate" and "Whey
1kg Vanilla" become two unrelated products, and a customer is offered the same
tub twice instead of one product with a flavour picker.

Everything downstream was already built for the grouped shape — order lines take
`variant.sku`, the daily sync applies stock per variant and rolls availability up
to the product, and both the shop sheet and the Pour Plan render a flavour/size
picker. The only missing step was saying "these SKUs are one product". There are
two places to say it:

- **At import.** Look several SKUs up, then **Add as ONE product** instead of
  *Add all separately*.
- **After the fact.** Tick them in **Products → Review** and **Combine into one
  product** — for when they were added separately, or arrived days apart.

Either way each variant keeps its own supplier SKU, which is what keeps it
orderable and separately stock-tracked. The combined product is named after what
the titles share ("Whey Protein 1kg"), and each variant is labelled with what is
left ("Chocolate", "Vanilla").

### Why sizes are refused

`CatalogueVariant` carries a price and a SKU, and nothing else commercial: cost,
servings and shipped weight live on the **product**. That is right for flavours
of one tub, which share all three. It is wrong for sizes — a 2.27kg tub costs
more, holds more servings and ships in a heavier band.

So `canMerge` refuses when cost, servings or weight differ, and says which:

> These cost different amounts (£20.00 vs £38.50), so they are different sizes
> rather than flavours. […] Keep them as separate products.

Half-supporting it would silently attach the first size's economics to every
other size, and their margins, subscription quantities and delivery estimates
would all be wrong. Grouping sizes needs per-variant cost/servings/weight first.

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
