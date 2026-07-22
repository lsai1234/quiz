# PowerBody + Stripe integration plan

Status: **proposal / not yet built.** No application code changes have been made.
This document is the plan only.

## Goal

Three connected pieces of work, all built **mock-first** so we can ship the wiring
now and swap in real credentials later with (almost) no app-code changes:

1. **PowerBody supplier integration** — import their catalogue into our system and
   read **live stock levels, prices and product info** (mirrors the "API Integrations"
   bullet on their site).
2. **Order placement + an Orders section in the Founders Hub** — when a customer pays,
   raise an order, submit it to PowerBody for dropship fulfilment, and manage the whole
   lifecycle from `/portal`.
3. **Stripe checkout everywhere** — shop, quiz and subscriptions all take payment through
   Stripe instead of the current Shopify-checkout redirect.

We do **not** have PowerBody API access yet, so PowerBody is built behind a provider
interface with a **mock implementation** first. Same approach the codebase already uses
for the data source (mock ↔ Shopify) and for subscriptions (`recharge/mock.ts`).

---

## How the codebase works today (the parts this touches)

- **Data-source resolver** — `src/lib/data-source.ts` is the single decision point for
  "mock vs live". `getDataSource()` / `isShopifyLive()`; the Founders Hub can persist a
  runtime override in the DB (`src/lib/portal/store.ts` → `syncPortalRuntime()`).
- **Catalogue** — `src/lib/shopify/catalogue.ts` reads from Shopify **or** `MOCK_PRODUCTS`
  and maps into the app's `CatalogueProduct` shape (goal tags, slots, dietary tags…).
- **Checkout** — three entry points, all today ending at a Shopify cart URL (or the
  `#mock-checkout` placeholder in mock mode):
  - Shop one-off → `useShopCheckout` → `POST /api/cart` → `createCart` → redirect.
  - Quiz stack → `useStackCheckout` → one-off via `/api/cart`; subscription via
    `POST /api/checkout/finalize` → `finalizeCheckout()`.
  - Subscriptions → `POST /api/subscribe` (Shopify selling plans / Recharge).
- **Subscriptions** — `src/lib/recharge/*` are **pure** functions over a
  `MemberSubscription` JSON document persisted in the `subscriptions` DB table. Recharge is
  the intended live provider; the shapes are already aligned to swap it in.
- **Founders Hub** — `/portal` with nav: Home, Dashboard, Products, Bundles, Backlog,
  Import, Pricing, Coverage, Readiness, Settings. Products can be imported by CSV; there's
  already a stubbed **"Supplier sync"** button ("not built yet").
- **DB** — engine abstraction (SQLite locally, Postgres in prod) in `src/lib/db/`, with
  repositories and a `migrations.ts`. The `subscriptions` table stores a JSON doc per user.

**Two design principles this plan follows:**
- **One resolver per concern.** PowerBody and Stripe each get their own resolver that looks
  exactly like `data-source.ts` (env var → portal DB override → mock default), so nothing
  is scattered and everything can be flipped per-environment without a redeploy.
- **Provider interface + mock impl + live stub.** Every external service is an interface
  with a mock now and a live adapter stub that reads real credentials later.

---

## Decision points (recommended defaults chosen — override if you disagree)

1. **Decouple from Shopify.** Today "live" means Shopify for both catalogue *and* checkout.
   Recommendation: make **PowerBody the catalogue/stock source** and **Stripe the payment
   source**, as two independent axes. Shopify drops out of the critical path (kept only as a
   legacy toggle if you still want it). This is the cleanest target and what the phases below
   assume.
2. **Subscription billing model in Stripe.** Our subscriptions are custom bundles of many
   products at an amortised monthly price with an intro discount — not one Stripe Price per
   SKU. Recommendation: bill a **single monthly recurring price = the bundle's monthly total**
   (built inline with `price_data`), keeping the `MemberSubscription` document as the source of
   truth for what's in the bundle. Simpler, matches the existing pricing engine, and swaps/pauses
   just update the Stripe subscription amount.
3. **Guest vs account checkout for the shop.** The quiz **subscription** path is already
   account-gated. Recommendation: allow **guest** one-off shop checkout (email captured at
   Stripe), attach to an account if one is signed in.
4. **Stock freshness.** Recommendation: a **cached sync** (portal "Sync now" button + optional
   scheduled revalidation) rather than a live call on every product view, with an on-demand
   stock check at add-to-basket / checkout to avoid overselling.

---

## Target architecture

```
                         ┌──────────────────────────────┐
  Catalogue / stock /    │  Supplier provider (PowerBody)│   mock now → live adapter later
  price / place order  ← │  src/lib/supplier/*           │
                         └──────────────┬────────────────┘
                                        │ maps to CatalogueProduct + stock
                                        ▼
   Shop / Quiz / Subs  →  Checkout  →  Stripe payment provider  →  webhook
                         src/lib/payments/*   (mock now → live)      │
                                                                     ▼
                                                        Orders domain (src/lib/orders/*)
                                                        + Founders Hub /portal/orders
                                                                     │ placeOrder()
                                                                     ▼
                                                        PowerBody fulfilment (mock now)
```

Three new concerns, each mock-first and flag-controlled:

### A. PowerBody supplier provider — `src/lib/supplier/`

- `types.ts` — `SupplierProvider` interface:
  - `listProducts()` → supplier products (sku, name, description, brand, category, images,
    wholesale price, RRP, stock qty, in-stock, barcode, weight…).
  - `getProduct(sku)`.
  - `getStockLevels(skus?)` → live stock + price snapshot for sync.
  - `placeOrder(order)` → `{ supplierOrderId, status }`.
  - `getOrder(supplierOrderId)` / `listOrders()` → for status/tracking sync.
- `powerbody/fixtures.ts` — a realistic PowerBody-style product set.
- `powerbody/mock.ts` — implements the interface from fixtures; stock returns with small
  jitter so "live sync" visibly changes; `placeOrder` returns a fake id and advances through
  statuses. **This is what runs now.**
- `powerbody/live.ts` — same interface, reads `POWERBODY_API_URL` / `POWERBODY_API_KEY`,
  talks to PowerBody's real API (their known surface is roughly `getProductList` /
  `getProductInfo` / `getStock` / `setOrder` / `getOrderList`). Throws "not configured" until
  creds exist. **Only this file changes when we go live.**
- `mapping.ts` — supplier product → app `CatalogueProduct` (categories → goal tags/slots/
  dietary). Founder overrides already exist in `portal/store.ts`, so mapped fields stay editable.
- `index.ts` — `getSupplier()` resolver: `SUPPLIER_SOURCE` env → portal DB override → `mock`
  default (copies `data-source.ts` exactly).

**Wiring:**
- Turn the existing `/portal/import` "Supplier sync" stub into a real **"Sync from PowerBody"**
  action → `POST /api/portal/supplier/sync` pulling `listProducts()` and upserting into the
  imported-products store.
- Live stock/price surfaced through a `getStockLevels()`-backed read that the shop
  `StockChip` and product sheets consume; on-demand re-check at checkout.
- `/portal/settings` gets a PowerBody source toggle + connection-status indicator, alongside
  the existing data-source toggle.

### B. Stripe payments — `src/lib/payments/`

- Deps: `stripe` (server) + `@stripe/stripe-js` (client).
- `index.ts` — `getPaymentMode()` resolver: `mock | stripe` from `PAYMENTS_SOURCE` env →
  portal override → `mock` default. Keys: `STRIPE_SECRET_KEY`,
  `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`.
- `stripe.ts` —
  - `createCheckoutSession(lines, { mode:'payment', successUrl, cancelUrl, metadata })` for
    one-off (shop + quiz one-off). **Prices resolved server-side from the catalogue** — never
    trust client amounts.
  - `createSubscriptionSession(memberSubscription, …)` for `mode:'subscription'` (single
    monthly recurring price = bundle total, per decision #2).
  - `createBillingPortalSession(customerId)` so customers manage cards from `/hub`.
- **Contract stays identical:** routes still return `{ checkoutUrl, mock }`; the hooks already
  redirect unless the URL starts with `#`, and mock keeps returning `#mock-checkout` /
  `#mock-subscription`. So `/api/cart`, `/api/subscribe`, `finalizeCheckout()` change on the
  **server side only** — swap `createCart` (Shopify) for the Stripe session builder gated on
  `getPaymentMode()`.
- **Webhook** — `POST /api/webhooks/stripe` (raw-body signature verification, idempotent):
  - `checkout.session.completed` — one-off → create Order; subscription → activate the
    `MemberSubscription` + create the first Order.
  - `invoice.paid` — recurring renewal → create a renewal Order for fulfilment.
  - `invoice.payment_failed` / `customer.subscription.updated|deleted` — sync status onto the
    `subscriptions` row.
  - **This webhook is what creates Orders and triggers PowerBody fulfilment.**
- Store `stripeCustomerId` / `stripeSubscriptionId` on the user + subscription doc.

### C. Orders domain — `src/lib/orders/` + Founders Hub

- **DB migration** — new `orders` table following the repo's JSON-doc convention: a `data`
  JSON column for the full order document plus indexed columns (`status`, `email`,
  `channel`, `created_at`, `stripe_session_id`, `supplier_order_id`) for querying.
- **Order document** — id, customer (userId nullable for guests) + email, `channel`
  (`shop | quiz | subscription`), `status`
  (`pending_payment → paid → submitted_to_supplier → supplier_confirmed → shipped →
  delivered`, plus `cancelled | refunded | failed`), amounts (subtotal/shipping/total/
  currency), Stripe ids, supplier order id + supplier status, shipping address, tracking,
  and line items (sku, name, qty, unit price, supplier cost).
- **Lifecycle service** (pure + testable, like `recharge/`):
  - `createOrderFromCheckout()` — from the Stripe webhook.
  - `submitOrderToSupplier()` — calls `getSupplier().placeOrder()` (mock now); stores supplier
    id + status; handles retry/errors.
  - `syncSupplierStatus()` — polls `getSupplier().getOrder()` for shipped/tracking (portal
    button now; scheduled later).
  - Guarded status transitions.
- **Founders Hub `/portal/orders`** — new nav item:
  - **List**: filter by status/channel/date, search by email/order id, payment + supplier
    status badges.
  - **Detail** `/portal/orders/[id]`: customer, items, amounts, Stripe links, supplier state,
    and actions — **Submit to PowerBody** (manual/retry), **Sync status**, **Refund** (Stripe),
    **Cancel**, tracking entry. All work end-to-end against mocks now.
  - API under `/api/portal/orders/*`.
- **Customer view (later)**: order history/status in the customer `/hub`.

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

Both also get a Founders-Hub Settings toggle persisted through the existing
`portal/store` + `syncPortalRuntime()` mechanism, so they can be flipped per environment
without a redeploy.

---

## Phasing

- **Phase 0 — scaffolding.** Interfaces, resolvers, env keys, portal toggles, `orders`
  migration. All mock; zero behaviour change to any live path.
- **Phase 1 — PowerBody catalogue + stock.** Mock provider + mapping; "Sync from PowerBody"
  in the hub; live stock/price on shop + quiz.
- **Phase 2 — Stripe one-off checkout.** Shop + quiz one-off via Stripe session; webhook →
  create Order. (Payments still mock by default.)
- **Phase 3 — Orders + fulfilment.** Orders domain + `/portal/orders`; submit-to-PowerBody
  (mock) and status sync.
- **Phase 4 — Stripe subscriptions.** Subscription checkout + billing portal; recurring
  `invoice.paid` → renewal Orders; hub billing management.
- **Phase 5 — Go live.** Implement `powerbody/live.ts` against the real API, add real Stripe
  keys, flip `SUPPLIER_SOURCE` / `PAYMENTS_SOURCE` per environment. No other app-code changes.

---

## Testing (Jest, following existing `__tests__/` layout)

Supplier mock provider + mapping; Stripe session builder (mock); webhook handler (signature +
idempotency); order lifecycle transitions; orders repository; and a data-source/payments/
supplier resolver test mirroring `data-source.test.ts`.

---

## What changes when the real PowerBody API + schema arrive

Only `src/lib/supplier/powerbody/live.ts` (map the real request/response to the
`SupplierProvider` interface) and the `mapping.ts` field mapping. Flip `SUPPLIER_SOURCE=powerbody`.
Everything upstream (catalogue, shop, quiz, orders, hub) already speaks the interface, so no
other code moves.
