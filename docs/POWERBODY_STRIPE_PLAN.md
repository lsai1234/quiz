# PowerBody + Stripe integration plan

Status: **proposal / not yet built.** No application code changes have been made yet —
this document is the plan.

## Goal

Move the app off Shopify and onto **PowerBody (dropship supplier) + Stripe (payments)**,
built **mock-first** so we can ship the wiring now and swap in real credentials later with
almost no app-code changes. Four connected pieces:

1. **PowerBody supplier integration** — pull their whole catalogue in, read **live stock
   levels, prices and product info**, and **place orders** for dropship fulfilment.
2. **Our curated catalogue + a "scan PowerBody" page** — a Founders-Hub page that lists
   every PowerBody product so we can **add the ones we want** into *our* catalogue. Our
   catalogue is the curated subset; customers only ever see what we've added.
3. **Subscriptions with per-product substitution consent + a stock-exception journey** —
   for each product in a subscription the customer chooses **"allow a same-category swap if
   it goes out of stock"** or **not**. A **daily stock check** flags live subscriptions whose
   product has gone out of stock at PowerBody, and a Founders-Hub journey lets us resolve each
   one the easy way (swap the future deliveries) or send a different product.
4. **Stripe checkout everywhere** — shop, quiz and subscriptions, with **guest checkout**
   allowed on the shop.

We do **not** have PowerBody API access yet, so PowerBody sits behind a provider interface
with a **mock implementation** first — the same approach the codebase already uses for the
data source (mock ↔ Shopify) and subscriptions (`recharge/mock.ts`).

**Decision locked:** Shopify is **decoupled** — PowerBody is the catalogue/stock source and
Stripe is the payment source, as two independent axes. Shopify drops out of the critical path
(the `shopify/*` modules stay in the tree for now but are no longer read once the flags flip;
they can be deleted in a later cleanup).

---

## How the codebase works today (the parts this touches)

- **Data-source resolver** — `src/lib/data-source.ts` is the single "mock vs live" decision
  point, with a portal-persisted runtime override (`src/lib/portal/store.ts` →
  `syncPortalRuntime()`). The new supplier/payments resolvers copy this shape exactly.
- **Catalogue** — `src/lib/shopify/catalogue.ts` maps a source (Shopify or `MOCK_PRODUCTS`)
  into the app's `CatalogueProduct` shape. `CatalogueProduct` already carries `stackSlots`,
  `swapGroup`, dietary tags, variants, etc.
- **Checkout** — three entry points, all ending today at a Shopify cart URL (or the
  `#mock-checkout` placeholder): shop one-off (`useShopCheckout` → `/api/cart`), quiz stack
  (`useStackCheckout` → `/api/cart` or `/api/checkout/finalize`), subscriptions
  (`/api/subscribe`). The hooks already redirect unless the URL starts with `#`.
- **Subscriptions** — `src/lib/recharge/*` are **pure** functions over a `MemberSubscription`
  JSON document in the `subscriptions` DB table. Crucially, `MemberSubscriptionLine` already
  has **`stackSlot`** and **`swapGroup`** ("used to offer same-slot swap alternatives"), and
  `MemberSubscription.deliveryOverrides` already supports **per-delivery skip / remove line /
  add item** — exactly the primitive we need to adjust future boxes.
- **Founders Hub** — `/portal` (Home, Dashboard, Products, Bundles, Backlog, Import, Pricing,
  Coverage, Readiness, Settings). Products can be CSV-imported and edited via founder
  overrides; there's already a stubbed **"Supplier sync"** button.
- **DB** — engine abstraction (SQLite local / Postgres prod), repositories, `migrations.ts`;
  the `subscriptions` table stores a JSON doc per user.

**Design principles this plan follows:**
- **One resolver per concern** (supplier, payments) — env var → portal DB override → mock
  default, identical to `data-source.ts`.
- **Provider interface + mock impl + live stub** — the live adapter is the only file that
  changes when real credentials arrive.
- **Reuse the subscription primitives** — substitution rides on the existing `swapGroup` /
  `stackSlot` / `deliveryOverrides` machinery and the pure recharge mutation helpers.

---

## Target architecture

```
                         ┌───────────────────────────────┐
  Catalogue / stock /    │  Supplier provider (PowerBody) │  mock now → live adapter later
  price / place order  ← │  src/lib/supplier/*            │
                         └───────────────┬───────────────┘
        scan & add ↑                     │ maps to CatalogueProduct + live stock
   /portal/supplier │                    ▼
     (curate)       │      Our curated catalogue  →  Shop / Quiz / Subscriptions
                                                          │
                                        Checkout  →  Stripe payments  →  webhook
                                        src/lib/payments/*  (mock → live)  │
                                                                           ▼
                                                          Orders domain (src/lib/orders/*)
                                                          + Founders Hub /portal/orders
                                                                           │ placeOrder()
                                                                           ▼
                                                          PowerBody fulfilment (mock now)

  Daily stock check ──► out-of-stock lines on live subs ──► /portal/stock-alerts journey
                                                            (swap future boxes / send alt)
```

### A. PowerBody supplier provider — `src/lib/supplier/`

- `types.ts` — `SupplierProvider` interface: `listProducts()`, `getProduct(sku)`,
  `getStockLevels(skus?)` (live stock + price snapshot), `placeOrder(order)` →
  `{ supplierOrderId, status }`, `getOrder(id)` / `listOrders()`.
- `powerbody/fixtures.ts` — a realistic PowerBody-style catalogue (many products across
  protein / creatine / pre-workout / vitamins… with wholesale price, RRP, stock qty, brand,
  barcode, images).
- `powerbody/mock.ts` — implements the interface from fixtures; `getStockLevels` returns with
  small jitter and can force specific SKUs out of stock (so the daily-check journey is
  demoable); `placeOrder` returns a fake id and advances statuses. **Runs now.**
- `powerbody/live.ts` — same interface against PowerBody's real API (roughly `getProductList`
  / `getProductInfo` / `getStock` / `setOrder` / `getOrderList`), reading `POWERBODY_API_URL` /
  `POWERBODY_API_KEY`. Throws "not configured" until creds exist. **Only this changes at go-live.**
- `mapping.ts` — PowerBody product → `CatalogueProduct` (category → `stackSlots` / `swapGroup`
  / dietary). Founder overrides (existing `portal/store`) keep mapped fields editable.
- `index.ts` — `getSupplier()` resolver: `SUPPLIER_SOURCE` env → portal override → `mock`.

### B. Our curated catalogue + "scan PowerBody" page

- New Founders-Hub page **`/portal/supplier`** (nav: "PowerBody"): lists **all** supplier
  products from `listProducts()` — search/filter by category/brand/in-stock, showing stock,
  wholesale price, RRP and **computed margin**, and whether each is **already in our catalogue**.
- **"Add to catalogue"** per product (and bulk-add) → maps via `mapping.ts` and upserts into
  the imported-products store (`portal/store`), where it's then editable like any product.
- Our **curated catalogue = the added subset**; shop and quiz read only that. This replaces
  the CSV import path as the primary way to build the catalogue (CSV can stay as a fallback).
- Live stock/price on shop + quiz come from `getStockLevels()` (cached — see the daily check),
  with an on-demand re-check at add-to-basket / checkout to avoid overselling.
- `/portal/settings` gains a PowerBody source toggle + connection status.

### C. Stripe payments — `src/lib/payments/`

- Deps: `stripe` (server) + `@stripe/stripe-js` (client).
- `index.ts` — `getPaymentMode()` resolver: `mock | stripe` from `PAYMENTS_SOURCE` → portal
  override → `mock`. Keys: `STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`,
  `STRIPE_WEBHOOK_SECRET`.
- `stripe.ts` —
  - `createCheckoutSession(lines, { mode:'payment', successUrl, cancelUrl, metadata })` for
    one-off (shop + quiz). **Prices resolved server-side from our catalogue** — never trust the
    client. **Guest allowed** (email captured by Stripe; attached to an account if signed in).
  - `createSubscriptionSession(memberSubscription, …)` — `mode:'subscription'`, a **single
    monthly recurring price = the bundle's monthly total** (built inline with `price_data`),
    with the `MemberSubscription` doc remaining the source of truth for contents.
  - `createBillingPortalSession(customerId)` so customers manage cards from `/hub`.
- **Contract unchanged:** routes still return `{ checkoutUrl, mock }`; mock still returns
  `#mock-checkout` / `#mock-subscription`. So `/api/cart`, `/api/subscribe` and
  `finalizeCheckout()` change **server-side only** — swap the Shopify `createCart` for the
  Stripe session builder gated on `getPaymentMode()`.
- **Webhook** — `POST /api/webhooks/stripe` (raw-body signature verification, idempotent):
  `checkout.session.completed` (one-off → create Order; subscription → activate the
  `MemberSubscription` + first Order); `invoice.paid` (renewal → create a renewal Order);
  `invoice.payment_failed` / `customer.subscription.updated|deleted` (sync status). **This is
  what creates Orders and triggers PowerBody fulfilment.**

### D. Orders domain — `src/lib/orders/` + `/portal/orders`

- **DB migration**: `orders` table, JSON `data` doc + indexed columns (`status`, `email`,
  `channel`, `created_at`, `stripe_session_id`, `supplier_order_id`).
- **Order doc**: customer (userId nullable for guests) + email, `channel`
  (`shop | quiz | subscription`), `status` (`pending_payment → paid → submitted_to_supplier →
  supplier_confirmed → shipped → delivered`, plus `cancelled | refunded | failed`), amounts,
  Stripe ids, supplier order id + status, shipping address, tracking, line items (sku, name,
  qty, unit price, supplier cost).
- **Lifecycle service** (pure + testable): `createOrderFromCheckout()` (from webhook),
  `submitOrderToSupplier()` → `getSupplier().placeOrder()`, `syncSupplierStatus()` →
  `getSupplier().getOrder()`.
- **`/portal/orders`**: list (filter/search, payment + supplier status badges) and detail
  (`/portal/orders/[id]`) with Submit-to-PowerBody / retry, Sync status, Refund (Stripe),
  Cancel, tracking — all working against mocks.

### E. Subscription substitution consent + stock-exception journey

**Customer side — per-line consent**
- Add **`allowSubstitution: boolean`** (default recommended **true**, easy per-line opt-out)
  to `MemberSubscriptionLine`. Substitution is always **within the same category** — enforced
  by matching `stackSlot` / `swapGroup`, which the line already carries.
- A **substitution-preferences step** at subscription checkout and an editable panel in the
  customer `/hub`: each line shows "If this goes out of stock, allow a same-category swap?"
  Yes → we'll pick the closest in-stock alternative in that category. No → we hold/skip that
  line and contact you.

**Daily stock check**
- A once-a-day job scans `getSupplier().getStockLevels()` for every SKU used by **active
  subscriptions** (and the catalogue). Mock now = a portal **"Run stock check"** button; live
  later = a scheduled route/cron. It records **stock exceptions**: active subscription lines
  whose product is now out of stock at PowerBody.

**Founders-Hub journey — `/portal/stock-alerts`**
- A **queue of affected live subscriptions**, each showing the out-of-stock product, the
  customer's substitution preference, and the next delivery date.
- **Line allows substitution** → we suggest the best replacement (in stock, same
  `swapGroup`/category, closest price/size). Founder accepts the suggestion or picks another,
  and we **apply it to future deliveries** — the easy way, using the existing
  `deliveryOverrides` (remove the OOS line, add the replacement) and/or a permanent line swap
  via the existing pure recharge helpers. Billing is unaffected (same category, same price band).
- **Line does not allow substitution** → options are **skip that line next delivery** (banks
  a credit, existing behaviour), **pause the line**, or **notify the customer to choose** —
  founder decides per case.
- Every action reuses the pure `recharge/*` mutation helpers, so it's testable and the
  `subscriptions` row stays the single source of truth. Resolved exceptions clear from the queue.

---

## Config (all default to mock)

Add to `.env.example`:

```
# ── Supplier (PowerBody dropship) ─────────────────────────────
SUPPLIER_SOURCE=mock            # mock | powerbody
POWERBODY_API_URL=
POWERBODY_API_KEY=

# ── Payments (Stripe) ─────────────────────────────────────────
PAYMENTS_SOURCE=mock            # mock | stripe
STRIPE_SECRET_KEY=
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=
STRIPE_WEBHOOK_SECRET=
```

Both also get Founders-Hub Settings toggles persisted through `portal/store` +
`syncPortalRuntime()`, so they flip per environment without a redeploy. The Shopify data-source
toggle is retired from the shipping path.

---

## Phased rollout

Each phase is shippable on its own and, until the final phase, changes **no live behaviour**
(everything stays on mock by default).

- **Phase 0 — Decouple + scaffold.**
  Add the `supplier` and `payments` resolvers, env keys and portal toggles; retire the Shopify
  data-source from the shipping path (flag off). Add the `orders` migration, the
  `allowSubstitution` field on subscription lines, and stock-exception storage. All mock; zero
  live-behaviour change.

- **Phase 1 — PowerBody catalogue + "scan & add".**
  Mock supplier provider + `mapping.ts`. New `/portal/supplier` page: browse all PowerBody
  products, see stock / wholesale / RRP / margin, **Add to catalogue**. Shop + quiz read the
  curated subset with supplier-backed stock/price.

- **Phase 2 — Stripe one-off checkout (shop + quiz), guest allowed.**
  Swap the shop and quiz one-off checkout to Stripe sessions (server-side); add the Stripe
  webhook; `checkout.session.completed` → create an Order. Payments still mock by default.

- **Phase 3 — Orders + fulfilment.**
  Orders domain + `/portal/orders`; submit-to-PowerBody (mock) and supplier status sync.

- **Phase 4 — Stripe subscriptions + substitution consent.**
  Subscription checkout via Stripe (single monthly price) + billing portal; add the per-line
  **allow-substitution** preferences at checkout and in `/hub`; recurring `invoice.paid` →
  renewal Orders.

- **Phase 5 — Daily stock check + stock-alerts journey.**
  Daily supplier stock scan over active subscriptions; the `/portal/stock-alerts` queue;
  same-category substitution applied to future deliveries, or hold/skip/notify for no-sub lines.

- **Phase 6 — Go live.**
  Implement `powerbody/live.ts` against the real API, add real Stripe keys, flip
  `SUPPLIER_SOURCE=powerbody` / `PAYMENTS_SOURCE=stripe` per environment, and move the daily
  check onto a real schedule. No other app-code changes.

---

## Testing (Jest, following the existing `__tests__/` layout)

Supplier mock provider + mapping; the supplier/payments resolvers (mirroring
`data-source.test.ts`); Stripe session builder (mock); webhook handler (signature +
idempotency); order lifecycle transitions + orders repo; substitution — consent gating,
same-`swapGroup` suggestion selection, and the `deliveryOverrides` applied to future boxes;
the daily stock check producing the right exception set.

---

## What changes when the real PowerBody API + schema arrive

Only `src/lib/supplier/powerbody/live.ts` (map the real request/response onto
`SupplierProvider`) and `mapping.ts`. Flip `SUPPLIER_SOURCE=powerbody`. Everything upstream —
catalogue, the scan-and-add page, shop, quiz, orders, subscriptions, the stock-alerts journey —
already speaks the interface, so nothing else moves.
