# PowerBody API integration

The live PowerBody dropshipping integration: pulling products in, keeping them up to
date, and placing orders. Written against their **Dropshipping API guide (June 2026)**.

`POWERBODY_STRIPE_PLAN.md` is the original plan; this document describes what is now
built and how to switch it on.

---

## The two switches

The single most important thing to understand: **reading and writing are separate
settings.**

| | Setting | Values | Default | Controls |
|---|---|---|---|---|
| **Read** | `SUPPLIER_SOURCE` | `mock` · `auto` · `powerbody` | `mock` | Where the catalogue, stock and prices come from |
| **Write** | `SUPPLIER_ORDERING` | `simulate` · `live` | `simulate` | Whether "Send" in the fulfilment queue really places an order |

They are deliberately independent so you can run the **catalogue fully live** — real
products, real stock, refreshed daily — while **every order is still pretend**. That is
the state to sit in while the integration is being proven, and it is where the app lands
by default the moment you add credentials.

Both can be flipped at runtime from the Founders Hub (**Settings → Supplier** and
**Settings → Order sending**) without a redeploy; the portal choice is persisted in the
database and wins over the environment variables.

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

# Leave this alone until you are ready to ship real parcels.
SUPPLIER_ORDERING=simulate
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

So `getStockLevels()` uses the cheap call alone and `listProducts()` is the only thing that
pays for detail (bounded to 6 concurrent, catalogue cached 10 minutes). Getting this
backwards turns a nightly stock check into thousands of API calls — which is also why
change detection was moved onto `getStockLevels()`.

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
| `src/lib/supplier/powerbody/soap.ts` | SOAP transport + session handling |
| `src/lib/supplier/powerbody/wire.ts` | Their shapes ↔ ours (pure) |
| `src/lib/supplier/powerbody/live.ts` | The live adapter |
| `src/lib/supplier/powerbody/mock.ts` | The mock, also used as the order simulator |
| `src/lib/orders/service.ts` | Approval gate + the ordering gate |
| `src/app/api/portal/ordering-mode/route.ts` | Read/set the ordering switch |
| `src/app/api/portal/supplier-sync/route.ts` | "Sync now" |
