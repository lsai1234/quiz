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

### F. Catalogue attribute gap — AI autopopulate

PowerBody only gives us commerce basics (name, description, brand, category, price, stock,
barcode, ingredients, images). Our `CatalogueProduct` needs a lot more that PowerBody will
never send: `stackSlots`, `swapGroup`, `goalTags`, dietary tags, `hasStimulants`,
`isReadyToDrink` / drinkable flags, consumption cadence, effect onset, beginner-friendly,
claim-safe `safeWording`, accent colour, ratings. These have to be **populated by us** as part
of adding a product.

The app already has the pieces: an `AiSuggestPanel` + `/api/portal/ai-classify` route and the
`openai` dependency. Plan:

- **`src/lib/supplier/autopopulate.ts`** — takes a mapped supplier product and returns the
  missing CHRGD attributes. Two modes, same interface (mirrors mock-first everywhere else):
  - **mock** — deterministic keyword rules (e.g. "whey"/"isolate" → `protein` slot +
    `muscle`/`recovery` goals; "pre-workout"/"caffeine" → `energy` slot + `hasStimulants`;
    "RTD"/"ready to drink"/"can" → `isReadyToDrink`). Works with no API key.
  - **live** — OpenAI, prompted with the supplier name/description/ingredients, returning the
    same typed shape.
- **Claim safety is hard-gated:** any AI-suggested wording is constrained to
  `stack-blueprint/approved-claims` — the model may only *select/paraphrase within* approved
  claims, never invent health claims. Anything unmatched is dropped and flagged.
- **Founder review, not blind trust:** the `/portal/supplier` "Add to catalogue" flow shows the
  autopopulated fields pre-filled for the founder to confirm/edit before saving; edits persist
  as overrides via `portal/store`. Products already in the catalogue can be re-run ("AI fill
  gaps") from the Products editor.
- Runs on add and is re-runnable in bulk, so a fresh PowerBody sync of hundreds of products can
  be triaged quickly rather than hand-typed.

### G. CHRGD LQD (drinks) journey redesign

The drinks (`drinksMode`) box is modelled as **two layers**:

```
  ┌─────────────────────────────────────────────────────────────┐
  │  FOUNDATION  — the everyday daily drinks (always present)     │
  │     • how many a day        (dailyDrinks)                     │
  │     • staples or a mix      (drinkVariety)                    │
  ├─────────────────────────────────────────────────────────────┤
  │  + WORKOUT ADD-ONS  — only on the training route             │
  │     • pre-workout / protein / recovery, each an add-on you    │
  │       toggle on; sized one-per-session from training freq     │
  └─────────────────────────────────────────────────────────────┘
```

**G1 — The foundation: daily drinks (always).**
Everyone building a drinks box configures the foundation first — the everyday base. Two
questions, no workout language:
1. **How many a day** — "On a normal day, how many drinks do you reach for?" with concrete
   examples (1 = a single anchor like morning greens; 2 = morning + evening; 3 = morning /
   midday / evening). New answer `dailyDrinks`.
2. **Staples or a mix** — "Same go-to drinks every day, or a mix across the month?" Two cards:
   **My staples** (the same 1–2 drinks daily — simple habit, fewer SKUs × higher count) vs
   **A monthly mix** (a rotating variety that covers more bases over the month — more SKUs ×
   lower count each). New answer `drinkVariety: 'staples' | 'variety'`.

This foundation stands entirely on its own — a non-training customer answers only these two and
gets a foundational box. No workout section is shown.

**G1b — Workout add-ons (training route only).**
If the customer is on the training route, an extra **"Add workout drinks?"** section appears,
where pre-workout / protein / recovery are offered as **separate add-ons you toggle on**, on top
of the foundation. Each add-on is *timed* — one per session — so it's **sized from the existing
training-frequency answer**, not a daily count (the `lqd.ts` model already splits `timed` vs
`anytime`, so this is a presentation layer over sizing we already do). New answer
`workoutAddOns: string[]` (which timed drinks are on). Off the training route this section is
skipped entirely and the answer is empty.

The box maths: `foundation = dailyDrinks × ~30, arranged as staples (few SKUs) or a variety
pool` **+** `workout add-ons = one per session × sessions/month`. The single legacy
`drinksPerDay` is retired (kept as a derived value during migration only).

**G2 — Make the outcome tangible + pick one-off or subscription.**
End the journey on a concrete **"Your month of drinks"** panel with the two layers shown
separately — a **Foundation / every day** block and (when present) a **Workout add-ons /
training days** block — each listing the actual drinks and counts, plus a total, days-of-cover,
and a clear **one-off box vs subscribe monthly** choice (subscription carries the per-line
substitution consent from section E). Right now the customer can't tell what they'll receive;
this shows it before they pay.

**G3 — Entry + copy.**
- The route choice still matters because it gates the workout add-on layer, but it's reframed
  around the **outcome**, not the abstract "everyday vs training + wellness". Recommended: a
  goal-led entry where the drink outcomes the customer picks (Energy, Protein, Greens/gut,
  Hydration, Sleep, Immunity, Focus) determine whether the workout layer is offered, with a
  **live "what's in your box" preview**. The training route simply unlocks the workout add-on
  step; everyone gets the foundation.
- The LQD closing CTA must not say **"Build my stack"** (it's drinks, not a stack). Proposed:
  **"Build my drinks box"** (parallels the stack CTA) or the punchier **"Pour my month"**. The
  non-LQD stack flow keeps "Build my stack".

These are proposals to refine — the plan is the structure; exact option labels/copy get finalised
when we build the phase.

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

Each phase is shippable on its own and, until Phase 6, changes **no live behaviour** (everything
defaults to mock). The drinks phases (3a/3b) have no PowerBody/Stripe dependency and can run in
parallel with the supplier/payments track. Dependencies are noted per phase.

---

### Phase 0 — Decouple + scaffold
*Depends on: nothing. Live impact: none.*
- Retire the Shopify data-source from the shipping path (flag off; `shopify/*` stays in-tree,
  unread).
- `src/lib/supplier/index.ts` + `src/lib/payments/index.ts` resolvers (env → portal override →
  `mock`), mirroring `data-source.ts`.
- `.env.example` keys (`SUPPLIER_SOURCE`, `POWERBODY_*`, `PAYMENTS_SOURCE`, `STRIPE_*`) + two
  Founders-Hub Settings toggles persisted via `portal/store`.
- DB migration: `orders` table; add `allowSubstitution` to `MemberSubscriptionLine`; add
  stock-exception storage.
- **Done when:** app runs unchanged on mock; toggles exist; migration applies clean; resolver
  tests pass.

### Phase 1 — PowerBody catalogue + "scan & add"
*Depends on: 0. Live impact: none (mock supplier).*
- `supplier/types.ts` (`SupplierProvider`), `powerbody/fixtures.ts`, `powerbody/mock.ts`,
  `powerbody/live.ts` (stub), `mapping.ts` (supplier → `CatalogueProduct`).
- New `/portal/supplier` page: browse all PowerBody products; search/filter by category / brand /
  in-stock; show stock, wholesale, RRP, **margin**, and "already in catalogue"; **Add to
  catalogue** (single + bulk) upserting into `portal/store`.
- Shop + quiz read the **curated subset** with supplier-backed stock/price; on-demand stock
  re-check at add-to-basket / checkout.
- **Done when:** a founder can scan the mock PowerBody feed and add products that then appear in
  shop + quiz with live-ish stock/price.

### Phase 1b — AI attribute autopopulate
*Depends on: 1. Live impact: none.*
- `supplier/autopopulate.ts` — mock keyword rules + live OpenAI, returning the CHRGD-only
  attributes (`stackSlots`, `swapGroup`, `goalTags`, dietary, `hasStimulants`, `isReadyToDrink`,
  cadence, onset, etc.).
- Claim-safety gate against `approved-claims`; unmatched wording dropped + flagged.
- Wired into "Add to catalogue" (pre-filled, founder-editable) + a bulk **"AI fill gaps"** action
  in the Products editor.
- **Done when:** adding a mock PowerBody product yields sensible pre-filled CHRGD attributes with
  no hand-typing, and no unapproved claim can be saved.

### Phase 2 — Stripe one-off checkout (shop + quiz), guest allowed
*Depends on: 0 (1 for real prices). Live impact: none (payments mock).*
- Deps `stripe` + `@stripe/stripe-js`; `payments/stripe.ts` `createCheckoutSession` (prices
  resolved server-side from the catalogue; **guest allowed**).
- Swap `/api/cart` (+ quiz one-off) from Shopify `createCart` to the Stripe session, gated on
  `getPaymentMode()`; mock still returns `#mock-checkout`.
- `POST /api/webhooks/stripe` (raw-body signature, idempotent); `checkout.session.completed` →
  create an Order.
- **Done when:** a guest can check out a shop basket via Stripe test mode and an Order row lands
  from the webhook.

### Phase 3 — Orders + fulfilment
*Depends on: 1, 2. Live impact: none (mock supplier orders).*
- `src/lib/orders/*`: order doc + repo, `createOrderFromCheckout()`, `submitOrderToSupplier()` →
  `getSupplier().placeOrder()`, `syncSupplierStatus()`.
- `/portal/orders` list + `/portal/orders/[id]` detail with Submit-to-PowerBody / retry, Sync
  status, Refund (Stripe), Cancel, tracking.
- **Done when:** a paid Order can be submitted to the mock supplier and walked through
  paid → submitted → shipped → delivered from the hub.

### Phase 3a — Drinks intake redesign: foundation + workout add-ons (LQD)
*Depends on: nothing (front-of-funnel). Live impact: changes the drinks quiz UX.*
- Replace `drinksPerDay` with `dailyDrinks` + `drinkVariety` (foundation) and add
  `workoutAddOns: string[]` (training route only).
- Quiz-flow: foundation steps always shown; the **"Add workout drinks?"** step gated to the
  training route; update `lqd.ts` to size foundation (staples vs variety) + timed add-ons
  (per-session from training frequency).
- Copy: LQD CTA "Build my stack" → **"Build my drinks box"**; entry reframed to outcome-led /
  route unlocks the workout layer.
- **Done when:** non-training customers answer only "how many a day" + "staples/mix"; training
  customers additionally toggle workout add-ons; `lqd.test.ts` covers both.

### Phase 3b — "Your month of drinks" outcome + one-off/subscribe
*Depends on: 3a (Stripe from 2/4 for live pay). Live impact: new drinks summary screen.*
- Two-layer outcome panel — **Foundation / every day** and (when present) **Workout add-ons /
  training days** — with counts, total, days-of-cover.
- Clear **one-off box vs subscribe monthly** choice feeding the existing checkout hooks.
- **Done when:** the customer sees exactly what's in their box, split by layer, and can pick
  one-off or subscription.

### Phase 4 — Stripe subscriptions + substitution consent
*Depends on: 2, 3. Live impact: none (payments mock).*
- `payments/stripe.ts` `createSubscriptionSession` (single monthly price = bundle total) +
  `createBillingPortalSession`; wire into `/api/subscribe` + `finalizeCheckout()`.
- Per-line **allow-substitution** consent at subscription checkout and in `/hub`; store on the
  `MemberSubscriptionLine`.
- Webhook: `invoice.paid` → renewal Order; `payment_failed` / `subscription.updated|deleted` →
  status sync.
- **Done when:** a subscription checks out via Stripe test mode, each line carries a substitution
  choice, and a renewal invoice creates a fulfilment Order.

### Phase 5 — Daily stock check + stock-alerts journey
*Depends on: 1, 4. Live impact: none (mock).*
- Daily scan of `getSupplier().getStockLevels()` over active-subscription SKUs (mock = portal
  "Run stock check" button) recording stock exceptions.
- `/portal/stock-alerts` queue: allows-substitution → suggested same-`swapGroup` replacement
  applied to future deliveries via `deliveryOverrides`; no-substitution → skip / pause / notify.
- **Done when:** forcing a mock SKU out of stock surfaces the affected live subscriptions and a
  founder can resolve each per the customer's consent.

### Phase 6 — Go live
*Depends on: all. Live impact: this is the switch.*
- Implement `powerbody/live.ts` against the real API + `mapping.ts` finalised; add real Stripe
  keys; move the daily check and AI autopopulate onto live services.
- Flip `SUPPLIER_SOURCE=powerbody` / `PAYMENTS_SOURCE=stripe` per environment.
- **Done when:** production runs on real PowerBody + Stripe with no other app-code changes.

---

## Testing (Jest, following the existing `__tests__/` layout)

Supplier mock provider + mapping; the supplier/payments resolvers (mirroring
`data-source.test.ts`); AI autopopulate (mock rules produce the right slots/flags, and the
claim-safety gate rejects any unapproved wording); Stripe session builder (mock); webhook handler
(signature + idempotency); order lifecycle transitions + orders repo; substitution — consent
gating, same-`swapGroup` suggestion selection, and the `deliveryOverrides` applied to future
boxes; the daily stock check producing the right exception set; and the redesigned drinks model —
`dailyDrinks` + `drinkVariety` sizing the foundation, `workoutAddOns` appearing only on the
training route and scaling one-per-session with training frequency, and the staples-vs-variety
split (extending the existing `lqd.test.ts`).

---

## What changes when the real PowerBody API + schema arrive

Only `src/lib/supplier/powerbody/live.ts` (map the real request/response onto
`SupplierProvider`) and `mapping.ts`. Flip `SUPPLIER_SOURCE=powerbody`. Everything upstream —
catalogue, the scan-and-add page, shop, quiz, orders, subscriptions, the stock-alerts journey —
already speaks the interface, so nothing else moves.
