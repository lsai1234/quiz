# Stripe integration — architecture scan & phased plan

Status: **scan complete, plan proposed.** No application code has been changed by this
document.

- **Rev 2** — rebased onto `master` @ `a3051e5`, after the P1–P8 product-changes /
  consent / notifications track landed. Baseline: **66 suites / 899 tests passing**.
- Rev 1 — scanned at `a4c1154` (49 suites / 643 tests).

> **What changed since Rev 1.** The product-changes track (`src/lib/changes/*`,
> `src/lib/legal/*`, `src/lib/notify/*`, ~11k LOC) landed and it moved the needle on
> billing: **`updateSubscriptionAmount` now exists and a live subscription's recurring
> amount is re-priced in Stripe** when a supplier-driven change resolves. That closes half
> of Rev 1's F-4 and settles decision D-2. It also added a **consent gate on the
> subscription checkout** and a **daily cron** that can change what members are billed.
>
> **What did not change:** every P0 in Rev 1 is still open, re-verified against current
> `master`. One-off Stripe checkout is still unreachable (F-1), subscription sessions
> still collect no delivery address (F-2), and the member-driven half of the lifecycle
> still never reaches Stripe (F-4b) — which now sits awkwardly beside a changes domain
> that does it properly.

---

## 1. Architecture scan

### 1.1 Money-flow map (current)

```
  ENTRY POINTS                    SERVER                          MONEY              LEDGER
  ───────────                     ──────                          ─────              ──────

  /shop  ShopShell
    └─ useShopCheckout ──┐
                         ├──► POST /api/cart ──► getPaymentSource()
  / (quiz) StackReview   │         │                  ├─ stripe ─► createCheckoutSession   ─┐
    └─ useStackCheckout ─┘         │                  │            (mode: payment)          │
       (one-off)                   │                  └─ mock ───► '#mock-checkout'         │
                                   └─ prices re-resolved from catalogue                     │
                                                                                            │
  / (quiz) StackReview      POST /api/checkout/finalize ──► finalizeCheckout()               │
    └─ useStackCheckout      POST /api/checkout/pending   ├─ validateConsent  ◄── NEW (P2)   │
       (subscription)        GET  /api/checkout/continue  │   └─ CheckoutRejected on miss    │
       AccountGate                                        ├─ recordConsent (evidence row)    │
       + CheckoutConsent ◄── NEW                          ├─ saveSubscription + policy       │
       + ChangePolicyChoice ◄── NEW                       ├─ claimIntroDiscount              │
                                                          ├─ recordIntroClaim (ledger)       │
                                                          └─ createSubscriptionSession ─────┤
                                                             (mode: subscription            │
                                                              + one-cycle coupon)           │
                                                                                            ▼
                                                                          Stripe hosted Checkout
                                                                                            │
                                                                                            ▼
                                            POST /api/webhooks/stripe  (constructWebhookEvent)
                                                            │
                        ┌───────────────────────────────────┼────────────────────────────────┐
                        ▼                                   ▼                                ▼
          checkout.session.completed              invoice.paid              customer.subscription.deleted
                        │                                   │                                │
                        └───────────────┬───────────────────┘                                │
                                        ▼                                                    │
                          Orders domain  src/lib/orders/*  ──► PowerBody dropship (mock)      │
                                                                                             │
  ── THE SECOND WRITER (new) ────────────────────────────────────────────────────────────────┤
                                                                                             │
  Vercel Cron 06:00 ──► GET /api/cron/daily ──► runDailyJob()                                 │
                          (CRON_SECRET)          ├─ detect supplier changes                   │
                                                 ├─ applyChangeEvent()                        │
                                                 │    ├─ applyResolution (pure)               │
                                                 │    ├─ syncBilling ──► updateSubscription-  ┘
                                                 │    │                  Amount()  ◄── NEW
                                                 │    │   (Stripe FIRST; on failure the
                                                 │    │    local plan is left untouched)
                                                 │    └─ saveSubscription
                                                 └─ queueMemberNotification ──► outbox ──► Resend
                                                                                  (manual default)

  ── THE THIRD WRITER (unsynced) ────────────────────────────────────────────────────────────
                                                                                    ✗ Stripe
  /hub  hub-store ──► PUT /api/hub/subscription ──► saveSubscription()  ────────────► never told
        (add / remove / swap / usage / pause / snooze / cancel)
```

That third writer is the shape of the remaining problem. See F-4b.

### 1.2 The resolvers — now three axes

All three share one deliberate shape (env → optional runtime override → mock-first default),
which is a genuine strength of this codebase.

| Axis | Module | Env | Default | Portal toggle |
|---|---|---|---|---|
| Payments | `lib/payments/index.ts` | `PAYMENTS_SOURCE` | `mock` | ✅ Settings |
| Supplier | `lib/supplier/index.ts` | `SUPPLIER_SOURCE` | `mock` | ✅ Settings |
| **Notifications** *(new)* | `lib/notify/index.ts` | `NOTIFY_SOURCE` | `manual` | — |
| *(legacy)* Data source | `lib/data-source.ts` | `NEXT_PUBLIC_DATA_SOURCE` | `mock` | ✅ Settings — **retire** |

`getPaymentSource()` downgrades `stripe` → `mock` when `STRIPE_SECRET_KEY` is absent, so a
misconfigured environment fails safe. Keep as-is.

**Critical property, unchanged:** the payments resolver is **server-only**, and `/api/config`
still exposes only `dataSourceMode` and `pricingOverrides` — not the payments mode. This
remains the root cause of F-1.

### 1.3 The three checkout entry points

| # | Path | Hook | Route | Stripe mode | Guest? | Reachable in Stripe mode? |
|---|---|---|---|---|---|---|
| 1 | `/shop` basket | `useShopCheckout` | `POST /api/cart` | `payment` | ✅ | ❌ **blocked by F-1** |
| 2 | Quiz one-off | `useStackCheckout` | `POST /api/cart` | `payment` | ✅ | ❌ **blocked by F-1** |
| 3 | Quiz subscription | `useStackCheckout` | `POST /api/checkout/finalize` | `subscription` | ❌ account + consent | ✅ works |
| — | *Legacy* `/api/subscribe` | *none* | — | Shopify cart | — | ☠️ dead code |
| — | *Legacy* `Act5Bundle` | `useShopifyCart` | Shopify Storefront | — | — | ☠️ unreachable |

**New in P2/P3:** path 3 now hard-rejects a checkout with missing or stale consent
(`CheckoutRejected` → 400), and carries the member's `ChangePolicy` (`auto-swap | remove`)
plus a `SafetyConstraints` snapshot into the stored plan. Both are re-derived server-side
in `finalize.ts` rather than trusted from the browser — consistent with how the intro
discount is handled, and correct.

### 1.4 The discount engine

Unchanged in substance. Six mechanisms, all in `stack-blueprint/pricing.ts`, all
portal-overridable as data:

| # | Mechanism | Config key | Default | Reaches Stripe as |
|---|---|---|---|---|
| 1 | One-off bundle tiers | `bundleTiers` | 10% @ £50, 15% @ £90, 20% @ £120 | baked into `unit_amount` |
| 2 | Subscribe & save per level | `levelSubscriptionDiscount` | 15 / 20 / 25% | baked into `monthlyTotal` |
| 3 | Subscription volume tiers | `subscriptionTiers` | `[]` unused | baked into `monthlyTotal` |
| 4 | First-month intro (scratch) | `introOffer.scratchReveal` | 50%/w1, 25%/w10, 10%/w10 | ✅ real coupon, `duration: 'once'` |
| 5 | Margin floor *(limiter)* | `marginFloorPct` | 15% over cost | caps 1–3 |
| 6 | Budget caps *(constraint)* | `budgetCaps` | £30/£50/£80/∞ | n/a |

**New knobs from P1/P7**, which now also move money and belong in this inventory:

| Key | Default | Effect |
|---|---|---|
| `substitutionPriceTolerancePct` | 0.15 | how far a replacement's price may sit from the original — a swap never raises the monthly, so this bounds what **we absorb** |
| `priceChangeThresholdPct` | 0.02 | supplier move that raises a price-change event |
| `priceChangeNoticeDays` | 30 | notice before an increase may bill (UK subscription rules) |
| `founderReviewHours` | 24 | override window before the member's own policy applies anyway |
| `defaultChangePolicy` | `auto-swap` | pre-selected option at checkout |
| `discontinuedAfterMissedSyncs` | 3 | OOS vs discontinued |

The architectural decision stands: every discount except the intro offer is computed in
our engine and handed to Stripe as one pre-discounted `unit_amount` via inline `price_data`.
`updateSubscriptionAmount` follows the same convention and — notably — **reuses the existing
Stripe Product** so a member's price history stays readable in the dashboard. That is a
thoughtful detail and should be preserved.

### 1.5 The subscription model

`MemberSubscription` (JSON doc in `subscriptions`, keyed by user id) is the source of truth
for contents; Stripe holds the schedule and payment method. One flat monthly recurring
price = `flatMonthly`.

| Concept | Ours | In Stripe | Rev 1 → Rev 2 |
|---|---|---|---|
| Recurring price | `flatMonthly` | `price_data.unit_amount`, monthly | — |
| First month | `firstMonth` | one-cycle coupon | — |
| Contents | `lines[]` | not represented | — |
| Re-price **from a product change** | `flatMonthly` | ✅ `updateSubscriptionAmount` | ❌ → ✅ **fixed** |
| Re-price **from a hub edit** | `flatMonthly` | ❌ not synced | ❌ still open |
| Cancel / pause / snooze | `status` | ❌ not synced | ❌ still open |
| Change policy | `defaultChangePolicy`, `line.changePolicy` | n/a | new |
| Consent | `subscription_consents` (v4) | n/a | new |
| Minimum term | `minMonths` (default 1) | ❌ not enforced | — |
| Skip credit | `pendingCredit` | ❌ not applied | — |
| Card on file | `paymentMethod` | ❌ hardcoded `Visa 4242` | ❌ still open |
| ID mapping | `stripe_sub:<id>` → userId | ✅ `subscription-link.ts` | — |

`src/lib/stock/*` has been **deleted** and superseded by `src/lib/changes/*`, which models
out-of-stock, discontinued and price moves as one event type. The design rule — *an event
always resolves on its own; nothing waits on a human* — is well enforced (there's a property
test over every input combination in `changes/__tests__/policy.test.ts`).

### 1.6 Webhook coverage — unchanged since Rev 1

| Event | Handled | Notes |
|---|---|---|
| `checkout.session.completed` (payment) | ✅ | `markOrderPaid`, idempotent |
| `checkout.session.completed` (subscription) | ✅ | links ids, activates bundle |
| `invoice.paid` | ✅ | fulfilment order, first box + renewals |
| `customer.subscription.deleted` | ✅ | marks cancelled |
| `invoice.payment_failed` | ❌ | **dunning invisible** (F-3) |
| `customer.subscription.updated` | ❌ | `past_due` / paused never reflected (F-3) |
| `checkout.session.expired` | ❌ | abandoned rows accumulate (F-8) |
| `charge.refunded` / `charge.dispute.created` | ❌ | money moved in Stripe doesn't reach us |

This gap matters more than it did in Rev 1: the notification outbox can now email a member
about their plan, but nothing can email them about a **failed payment**, because we never
learn about one.

---

## 2. What works today

- All three mock-first resolvers and the payments fail-safe downgrade.
- Server-side price re-resolution on `/api/cart` — client numbers never trusted.
- The subscription checkout path end-to-end: scratch-card intro as a real Stripe coupon,
  server-side revalidation, allocation ledger that only spends at checkout.
- **New:** versioned consent captured with evidence before anything is stored or charged.
- **New:** the product-changes → Stripe re-price path, ordered **Stripe-first** so a
  rejected amount leaves the local plan untouched rather than producing a plan that
  disagrees with the card charge. This is the correct ordering and the best new code here.
- **New:** 30-day notice scheduling on price increases, with the notice email sent at
  decision time rather than application time.
- Webhook signature verification and idempotent order creation.
- The orders domain, state machine, and `/portal/orders` actions.
- Full refunds on **one-off** orders.

---

## 3. Findings

Severity: **P0** blocks go-live · **P1** correctness/money-affecting · **P2** hardening ·
**P3** debt/hygiene. Status re-verified against `master` @ `a3051e5`.

---

**F-1 · P0 · OPEN · One-off Stripe checkout is unreachable — gated on the wrong flag.**

`src/hooks/useShopCheckout.ts:36` and `src/hooks/useStackCheckout.ts:85` still short-circuit
to `#mock-checkout` when `isShopifyLive()` is false. Under the shipping default
(`NEXT_PUBLIC_DATA_SOURCE=mock`) that is always false, so `PAYMENTS_SOURCE=stripe` changes
nothing for the shop basket or the quiz one-off — the browser never calls `/api/cart` and
the working Stripe branch inside it is dead.

The subscription path works because `finalizeCheckout` consults `getPaymentSource()`
server-side. The one-off paths never ask the server at all.

Fix is a deletion: remove the client gate, always POST to `/api/cart`, let the server's
`{ checkoutUrl, mock }` decide. The hooks' contract is unchanged.

*The `/shop` checkout button is currently a no-op-with-success-UI in every default
deployment.*

---

**F-2 · P0 · OPEN · Subscription Checkout Sessions collect no delivery address.**

`createSubscriptionSession` (`src/lib/payments/stripe.ts:137`) still omits
`shipping_address_collection` — present on the one-off session at line 56. Every
subscription order therefore reaches `submitOrderToSupplier` with `shippingAddress: null`
and falls through to the placeholder at `src/lib/orders/service.ts:150`:
`{ line1: '', city: '', postcode: '', country: 'GB' }`.

**Every subscription box would be dropshipped to a blank address.** Still the
highest-consequence bug in the tree, and now more so: the changes domain will happily swap
products into a plan whose deliveries have nowhere to go.

---

**F-3 · P1 · OPEN · Failed payments and dunning are invisible.**

No `invoice.payment_failed` or `customer.subscription.updated` handler. A member whose card
fails stays `active` in our DB while Stripe retries and eventually cancels.

Sharper in Rev 2: we now have a **notification outbox** and templates for telling members
their plan changed — but the one message a subscription business must send, *"your payment
failed"*, cannot be triggered, because the event never arrives. The plumbing exists; only
the webhook case and template are missing.

---

**F-4 · P1 · SPLIT — half fixed.**

**F-4a · DONE.** Supplier-driven changes now re-price Stripe.
`lib/changes/service.ts:syncBilling` → `updateSubscriptionAmount`, guarded on payment
source, `stripeSubscriptionId` presence and a >1p delta; Stripe-first ordering with the
local save skipped on failure and the error recorded on the event. `proration_behavior:
'none'`, billing anchor preserved, Stripe Product reused. Nothing to add.

**F-4b · P1 · OPEN.** Member-driven changes still never reach Stripe.
`PUT /api/hub/subscription` (`src/app/api/hub/subscription/route.ts:59`) calls
`saveSubscription` and returns. Every hub mutation in `lib/recharge/mock.ts` — `addLine`,
`removeLine`, `swapProduct`, usage-level change, `pauseSubscription`, `snoozeSubscription`,
`cancelSubscription` — recomputes `flatMonthly` and is written through that route.

In production:
- Member cancels in the hub → **Stripe keeps charging them.**
- Member adds a product → we ship more, bill the same.
- Member removes a line or snoozes → we bill the same. Overcharging.

`grep` confirms exactly one `stripe.subscriptions.update` call site in the tree, inside
`updateSubscriptionAmount`, and **no** cancel or pause call anywhere.

The fix is now mostly *reuse*: `updateSubscriptionAmount` already handles the re-price;
what's needed is `cancelStripeSubscription` / `pauseStripeSubscription` beside it, and a
diff-and-sync step in the hub route that mirrors `syncBilling`'s ordering.

---

**F-4c · P2 · NEW · Two writers, one invariant, one of them unguarded.**

`lib/changes/service.ts` carries the comment *"there is exactly one code path that changes
a member's price."* That is true **within the changes domain** and is a good property. It
is not true of the application: `lib/changes/apply.ts` (Stripe-synced) and
`lib/recharge/mock.ts` via the hub (not synced) both mutate `flatMonthly`.

The asymmetry is visible in the product's own rules. A **supplier** price increase gets 30
days' notice, a scheduled effective date, a notice email and a Stripe re-price. A **member**
adding a product to their box raises their monthly immediately, with no notice, and Stripe
never hears. Once F-4b lands, both writers should funnel through one guarded helper so this
can't drift again.

---

**F-5 · P1 · OPEN · Every member's hub shows a hardcoded "Visa ending 4242".**

`buildMemberSubscription` (`src/lib/recharge/mock.ts:136`) still sets
`paymentMethod: { brand: 'Visa', last4: '4242' }` unconditionally, and is used by the *real*
checkout path in `useStackCheckout`. Populate from the subscription's default payment method
on `checkout.session.completed`, or drop the field and rely on the billing portal.

---

**F-6 · P1 · OPEN · Refunding a subscription order is a silent no-op in Stripe.**

`createSubscriptionOrder` never sets `stripePaymentIntentId`, so the guard at
`src/app/api/portal/orders/[id]/route.ts:53` is false for every subscription order — the row
is marked `refunded` and no money moves. Capture the payment intent / charge from the
invoice on `invoice.paid`. `refundPayment` is also full-refund-only.

---

**F-7 · P2 · OPEN · No Stripe Customer reuse.** Both session builders pass `customer_email`,
never `customer`. Returning members get a fresh Stripe Customer each time, fragmenting
billing history and payment methods.

**F-8 · P2 · OPEN · Abandoned checkouts leak `pending_payment` rows.** No
`checkout.session.expired` handler and no sweeper.

**F-9 · P2 · OPEN · Free-delivery threshold advertised but never charged.**
`freeDeliveryThreshold: 50` drives copy in `PlanReceipt`, `ShopShell`, `BasketDrawer`; no
session sets `shipping_options` and `order.shipping` is hardcoded `0`.

**F-10 · P2 · OPEN · API version unpinned; currency hardcoded.** `new Stripe(key)` with no
`apiVersion` (`stripe.ts:16`) — the webhook already carries defensive shape-juggling for
exactly this. `'gbp'` defaults at four call sites now (`updateSubscriptionAmount` added one)
with no central constant.

**F-11 · P2 · OPEN · No Stripe Tax.** No `automatic_tax` on either session; UK VAT neither
collected nor recorded.

**F-12 · P3 · OPEN · Minimum term not enforced at the billing layer.**
`minSubscriptionMonths` defaults to `1`, so latent — but the billing portal would let a
member cancel regardless if it ever rises.

---

**F-13 · P3 · PARTLY WORSE · Documentation contradicts the shipped code.**

- `docs/POWERBODY_STRIPE_PLAN.md:3` — still *"**not yet built.** No application code changes
  have been made yet"* — now describing work that is eight phases past done.
- `docs/SUBSCRIPTIONS.md` — grew by 161 lines for the product-changes model but **kept its
  Shopify framing**: the title is still "how it will plug into Shopify", §166 still names
  **Recharge** as the billing engine that owns "card vaulting, recurring charges,
  retries/dunning", and it still quotes stale figures (25%/50% at weights 2/1, a 4-month
  minimum; the code has 50/25/10 at weights 1/10/10 and `minSubscriptionMonths: 1`).
  It now describes a Recharge-based billing engine *and* a Stripe-based one in the same file.
- `README.md` still describes a "Mobile-first AI TikTok carousel idea builder" — a different
  product.

`docs/PRODUCT_CHANGES_SPEC.md` and `docs/STRIPE_TESTING.md` are accurate and current; the
rot is confined to the three above.

---

**F-14 · P2 · NEW · The daily cron changes what members are billed; its failure modes are
thin.**

`/api/cron/daily` (Vercel Cron, 06:00 UTC) now detects supplier changes, applies what's due,
re-prices Stripe and queues member email. Guarded by `CRON_SECRET` — open in dev, **closed in
production when unset**, which is the right default. Two gaps:

- A `syncBilling` failure leaves the event open with `e.error` set and the plan untouched
  (correct), but nothing **retries** it or alerts a human. It surfaces only if a founder
  opens the queue. For a job that can silently stop re-pricing, that needs a health signal
  — `lib/changes/health.ts` exists and looks like the right home.
- `maxDuration = 300` with detection walking every active subscription is fine now and will
  not be at volume. Worth a note before it becomes an incident.

---

## 4. Shopify tech-debt inventory

Nothing here is *running* (`NEXT_PUBLIC_DATA_SOURCE=mock` is the default). It is inert
weight that is nonetheless **causing F-1**. The P1–P8 track did not touch it.

### 4.1 Delete outright

| Path | Why |
|---|---|
| `src/lib/shopify/` (5 files, ~1000 LOC) | Storefront + Admin API layer |
| `src/app/api/subscribe/route.ts` | **Zero callers.** Shopify selling-plan cart, superseded by `/api/checkout/finalize` |
| `src/hooks/useShopifyCart.ts` | Only consumer is `Act5Bundle` |
| `src/components/scroll/Act5Bundle.tsx` | **Unreachable** — `Act4Reveal` takes no `onComplete`, so `ScrollExperience` can never reach act 5 |
| `src/app/api/products/route.ts` | Shopify-only, plus a `?debug` branch echoing store domain and a token preview — **mild info-disclosure** |
| `src/hooks/useProducts.ts` | Consumer of `/api/products` |
| `scripts/seed-shopify-tags.mjs` | Seeds `chrgd.*` Shopify metafields |
| `src/lib/mock-products.ts` | Shopify-shaped mock, only the `/api/products` fallback |

### 4.2 Rewrite / narrow

| Path | Change |
|---|---|
| `useShopCheckout.ts`, `useStackCheckout.ts` | Drop `isShopifyLive()` gating — **F-1's fix** |
| `lib/data-source.ts` | Retire once `catalogue/resolve.ts` reads supplier + curated catalogue only |
| `catalogue/resolve.ts:31` | Remove the Shopify branch |
| `stack-blueprint/checkout.ts` | Drop `requireShopifyIds`/`requireSellingPlans`, the two Shopify `ValidationError` variants, `buildCartPermalink`, `gidToNumeric`; rename `merchandiseId` → `variantId` |
| `catalogue/types.ts` | Retire `shopifyProductId`, `shopifyVariantId`, `sellingPlanId` |
| `stack-blueprint/pricing.ts` | Drop `sellingPlanId` from `SubscriptionLine` |
| `checkout/types.ts` | `CheckoutPayload.lines` carries Shopify cart lines and **`finalizeCheckout` never reads it**. Delete |
| `portal/readiness.ts` | Drop the "no selling plan configured" check |
| `api/portal/{products,import,ai-classify}` | Remove `getDataSource() === 'shopify'` write-through branches |
| `portal/settings`, `DataSourceToggle`, `PortalShell`, `PortalSync`, `/api/config`, `/api/portal/data-source` | Retire the Shopify toggle; **`/api/config` should expose the payments mode instead** |
| `src/lib/recharge/` → `src/lib/subscription/` | Pure, well-tested, misleading vendor name. Now **20 files import it**, including all of `lib/changes/*` — rename earlier rather than later |
| `MemberSubscriptionLine.allowSubstitution` | Superseded by `changePolicy`; `policyForLine` already maps the legacy `false` → `remove`. Plan its removal once stored subs are migrated |
| `.env.example` | Remove the four `SHOPIFY_*` blocks |
| `docs/SUBSCRIPTIONS.md`, `docs/POWERBODY_STRIPE_PLAN.md`, `README.md` | Rewrite against Stripe (F-13) |

**Scale:** ~2,000 LOC deleted, ~15 files removed, one module renamed. The 899-test suite is
the safety net.

---

## 5. Phased plan

Phases 1–2 are the go-live blockers. Rev 2 shrinks Phase 2 considerably — the hard part
(re-pricing Stripe safely) is already built and just needs a second caller.

---

### Phase 1 — Unblock Stripe checkout *(P0; ~half a day)*

*Depends on: nothing.*

1. Delete the `isShopifyLive()` short-circuits in `useShopCheckout` and `useStackCheckout`;
   always POST to `/api/cart`, honour the server's `{ checkoutUrl, mock }`. **(F-1)**
2. Add `shipping_address_collection` + `phone_number_collection` to
   `createSubscriptionSession`, matching the one-off session. **(F-2)**
3. Pin `apiVersion`; add a single `DEFAULT_CURRENCY` used by all four call sites. **(F-10)**
4. Expose `paymentsMode` on `/api/config` so the client renders honest copy without
   importing a payments module.

**Done when:** with `PAYMENTS_SOURCE=stripe` + a test key, a guest completes a `/shop`
basket and a quiz one-off through Stripe Checkout, both orders land `paid` via webhook, and
a subscription checkout captures a real delivery address that appears on the order.

---

### Phase 2 — Close the member-driven half of the lifecycle *(P1; ~1 day — was ~2)*

*Depends on: 1. Live impact: hub actions start moving money.*

5. Add `cancelStripeSubscription` / `pauseStripeSubscription` / `resumeStripeSubscription`
   beside the existing `updateSubscriptionAmount` in `lib/payments/stripe.ts`.
6. Extract `syncBilling`'s guard-and-order logic from `lib/changes/service.ts` into a shared
   helper, and call it from `PUT /api/hub/subscription` on a stored-vs-incoming diff of
   `status` and `flatMonthly`. **Keep the Stripe-first ordering** the changes domain already
   proved out. **(F-4b, F-4c)**
7. Handle `invoice.payment_failed` → `status: 'past_due'` + a **payment-failed notification
   template** (the outbox is already there); and `customer.subscription.updated` → mirror
   status and `cancel_at_period_end`. **(F-3)**
8. Populate `paymentMethod` from the subscription's default payment method on
   `checkout.session.completed`; stop hardcoding it. **(F-5)**

**Done when:** cancelling in the hub cancels in Stripe; adding a line re-prices the Stripe
subscription; a declined test card surfaces as `past_due` and queues an email; the hub shows
the card actually used.

---

### Phase 3 — Money-movement correctness *(P1–P2; ~1 day)*

*Depends on: 1.*

9. Capture the payment intent / charge from `invoice.paid` onto subscription orders so
   `/portal/orders` refunds actually refund; add partial refunds. **(F-6)**
10. Reuse Stripe Customers — persist `stripeCustomerId` on the user, pass `customer` when
    known. **(F-7)**
11. Handle `checkout.session.expired` → `failed`; sweep `pending_payment` rows older than
    24h. **(F-8)**
12. Handle `charge.refunded` and `charge.dispute.created` so money moved in the Stripe
    dashboard reconciles back. **(F-8)**
13. Surface `syncBilling` failures through `lib/changes/health.ts` with a retry, so a
    silently-stalled re-price is visible without opening the queue. **(F-14)**

---

### Phase 4 — Shopify removal, part 1: the dead layer *(P3; ~1 day)*

*Depends on: 1.*

14. Delete everything in §4.1; strip the unused `CheckoutPayload.lines`.
15. Remove `requireShopifyIds` / `requireSellingPlans` and the two Shopify `ValidationError`
    variants; rename `merchandiseId` → `variantId`.
16. Update affected `__tests__/`.

**Done when:** `grep -ri shopify src/` returns only the catalogue-type fields deferred to
Phase 5, suite green.

---

### Phase 5 — Shopify removal, part 2: types, flags & docs *(P3; ~1 day)*

*Depends on: 4.*

17. Retire `shopifyProductId` / `shopifyVariantId` / `sellingPlanId` from `CatalogueProduct`,
    `SubscriptionLine`, `readiness.ts`.
18. Retire `data-source.ts` and the portal data-source toggle; leave `SUPPLIER_SOURCE`,
    `PAYMENTS_SOURCE`, `NOTIFY_SOURCE` as the axes.
19. Rename `lib/recharge/` → `lib/subscription/` (20 importers — do it as one mechanical
    commit). Plan `allowSubstitution`'s removal behind a stored-subscription migration.
20. Clean `.env.example`. Rewrite `docs/SUBSCRIPTIONS.md` against Stripe and remove its
    Recharge billing-engine section, correct the stale discount figures, mark
    `docs/POWERBODY_STRIPE_PLAN.md` delivered, fix `README.md`. **(F-13)**

---

### Phase 6 — Commercial hardening *(P2; gated on §7)*

21. Shipping: `shipping_options` honouring `freeDeliveryThreshold`, or remove the messaging.
    **(F-9)**
22. `automatic_tax` + address collection for VAT, if adopted. **(F-11)**
23. Minimum-term enforcement, if `minSubscriptionMonths` ever rises. **(F-12)**
24. Idempotency keys on session creation; webhook event-id dedupe table.

---

## 6. Test plan

The 899-test suite covers the changes/consent/notify domains well and is the safety net for
the deletion phases. New coverage needed:

| Area | Tests |
|---|---|
| Checkout gating (F-1) | `/api/cart` is called in mock mode too; the hook honours the server's `mock` flag rather than deciding |
| Subscription session (F-2) | address collection requested; webhook writes a real address onto the order |
| Hub → Stripe sync (F-4b) | cancel → Stripe cancel called; `flatMonthly` change → re-price called; **document write skipped when Stripe rejects**, mirroring `applyChangeEvent` |
| One-writer invariant (F-4c) | both the changes path and the hub path go through the shared guarded helper |
| Dunning (F-3) | `invoice.payment_failed` → `past_due` + queued notification; `customer.subscription.updated` mirrors status |
| Refunds (F-6) | subscription order carries a payment intent and refunds for real; partial-refund arithmetic |
| Customer reuse (F-7) | second checkout passes `customer`, not `customer_email` |
| Expiry (F-8) | `checkout.session.expired` → `failed`; sweeper picks up stale rows |
| Discount regression | after every Shopify deletion, `pricing.test.ts` figures byte-identical — **the discount engine must not move** |

`docs/STRIPE_TESTING.md` stays the manual runbook; extend it with the dunning and hub-cancel
paths, and with a `?dryRun=1` pass over `/api/cron/daily`.

---

## 7. Decisions

**D-1 · Do discounts stay in our engine, or move to Stripe Coupons?**
*Recommendation: stay.* The logic depends on quiz answers, usage levels and per-line margin
floors — not expressible as Stripe Prices. Accept that Stripe reporting shows gross figures
and treat our DB as the ledger of record. Record the decision, because the reflex when
Stripe reporting looks wrong will be to "fix" it here.

**D-2 · Proration on re-price. ✅ RESOLVED.** `updateSubscriptionAmount` ships
`proration_behavior: 'none'` with the billing anchor preserved — effective next cycle, no
backdating. This matches the flat-monthly smoothed-average model and Rev 1's recommendation.
Phase 2's hub-driven sync must use the same policy.

**D-3 · VAT.** Adopt Stripe Tax, or handle out-of-band? Blocks F-11.

**D-4 · Shipping.** Charge below £50, or drop the threshold messaging? Blocks F-9.

**D-5 · Minimum term.** Keep `minSubscriptionMonths: 1`? If it rises, F-12 becomes P1 and
the billing portal must be restricted.

**D-6 · NEW · Notice symmetry on member-driven increases.** A supplier price rise gets 30
days' notice and a free exit; a member adding a product to their own box raises their
monthly immediately. That is defensible — they asked for it — but it should be a stated
position, because F-4b will make both paths write to Stripe and the difference will become
visible in billing.

---

## 8. Sequencing

```
  Phase 1  ██   P0  unblock checkout + address collection        ← go-live blocker
  Phase 2  ██   P1  hub → Stripe sync + dunning                  ← go-live blocker (halved by F-4a)
  Phase 3  ██   P1  refunds, customers, expiry, cron health
  Phase 4  ██   P3  delete the dead Shopify layer
  Phase 5  ██   P3  types, flags, recharge rename, docs
  Phase 6  ??   P2  shipping / tax / term    ← gated on §7
```

Phases 4–5 touch files disjoint from 2–3 and can run in parallel, but sequencing them after
1 avoids deleting the Shopify gate and rewriting the hooks in one commit.
