# Stripe integration — architecture scan & phased plan

Status: **scan complete, plan proposed.** No application code has been changed by this
document. Baseline at time of writing: 49 test suites / 643 tests passing.

> **Headline finding.** Stripe is not a greenfield integration — roughly 70% of it is
> already in the tree and working (`src/lib/payments/*`, `/api/webhooks/stripe`,
> `/api/cart`, `finalizeCheckout`, the orders domain, the portal payments toggle).
> The work that remains is **not "add Stripe"**, it is:
> 1. **unblocking** the two one-off checkout paths, which are gated behind a *Shopify*
>    flag and therefore unreachable in Stripe mode (§3, F-1);
> 2. **closing the subscription lifecycle**, which is currently one-way — the hub can
>    cancel, pause and re-price a subscription and Stripe never hears about it (F-4);
> 3. **deleting the Shopify layer** that is causing (1) and is now pure dead weight (§4).

---

## 1. Architecture scan

### 1.1 Money-flow map (as it exists today)

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
                                      (client numbers never trusted)                        │
                                                                                            │
  / (quiz) StackReview                                                                      │
    └─ useStackCheckout ────► POST /api/checkout/finalize ──► finalizeCheckout()             │
       (subscription)          POST /api/checkout/pending  ├─ saveSubscription (DB)          │
       AccountGate ───────────► GET  /api/checkout/continue├─ claimIntroDiscount             │
       (OAuth round-trip)                                  ├─ recordIntroClaim (ledger)      │
                                                           └─ createSubscriptionSession ────┤
                                                              (mode: subscription           │
                                                               + one-cycle coupon)          │
                                                                                            ▼
                                                                          Stripe hosted Checkout
                                                                                            │
                                                                                            ▼
                                            POST /api/webhooks/stripe  (constructWebhookEvent)
                                                            │
                        ┌───────────────────────────────────┼────────────────────────────────┐
                        ▼                                   ▼                                ▼
          checkout.session.completed              invoice.paid              customer.subscription.deleted
             mode=payment  → markOrderPaid          → createSubscriptionOrder    → sub.status='cancelled'
             mode=subscription → link ids,             (id: ord_inv_<invoiceId>)
                                 status='active'
                        │                                   │
                        └───────────────┬───────────────────┘
                                        ▼
                          Orders domain  src/lib/orders/*
                                        │  submitOrderToSupplier()
                                        ▼
                          PowerBody dropship (mock) + /portal/orders
```

### 1.2 The payments resolver

`src/lib/payments/index.ts` — a deliberate twin of `src/lib/data-source.ts`.

| Priority | Source | Values |
|---|---|---|
| 1 | Portal runtime override (DB, via `syncPortalRuntime()`) | `auto \| mock \| stripe` |
| 2 | `PAYMENTS_SOURCE` env | `auto \| mock \| stripe` |
| 3 | Default | `mock` |

`getPaymentSource()` downgrades `stripe` → `mock` when `STRIPE_SECRET_KEY` is absent, so
a misconfigured environment fails safe rather than dead-ending a customer. This design is
sound and should be kept as-is.

**Critical property:** this resolver is **server-only**. There is no client mirror. The
public `/api/config` route exposes `dataSourceMode` and `pricingOverrides` — *not* the
payments mode. This is the root cause of F-1 below.

### 1.3 The three checkout entry points

| # | Path | Hook | Route | Stripe mode | Guest? | Reachable in Stripe mode? |
|---|---|---|---|---|---|---|
| 1 | `/shop` basket | `useShopCheckout` | `POST /api/cart` | `payment` | ✅ | ❌ **blocked by F-1** |
| 2 | Quiz one-off | `useStackCheckout` | `POST /api/cart` | `payment` | ✅ | ❌ **blocked by F-1** |
| 3 | Quiz subscription | `useStackCheckout` | `POST /api/checkout/finalize` | `subscription` | ❌ (account-gated) | ✅ works |
| — | *Legacy* `/api/subscribe` | *none* | — | Shopify cart | — | ☠️ dead code |
| — | *Legacy* `Act5Bundle` | `useShopifyCart` | Shopify Storefront | — | — | ☠️ unreachable |

### 1.4 The discount engine — complete inventory

All pricing lives in `src/lib/stack-blueprint/pricing.ts` (977 lines), written as **data,
not logic**, and overridable at runtime from the Founders Hub (`PricingOverrides` →
`setPricingOverrides` → `getPricingConfig`). Six distinct discount mechanisms:

| # | Mechanism | Config key | Default | Applied where | Reaches Stripe as |
|---|---|---|---|---|---|
| 1 | **One-off bundle tiers** (best-qualifying wins) | `bundleTiers` | 10% @ £50, 15% @ £90, 20% @ £120 | `calculatePricing` → `oneOffTotal` | baked into `unit_amount` |
| 2 | **Subscribe & save, per bundle level** | `levelSubscriptionDiscount` | essentials 15%, performance 20%, complete 25% | `buildSubscriptionPlan` | baked into `monthlyTotal` |
| 3 | **Subscription volume tiers** (beat #2 if better) | `subscriptionTiers` | `[]` (unused) | `resolveSubscriptionRate` | baked into `monthlyTotal` |
| 4 | **First-month intro (scratch-to-reveal)** | `introOffer.scratchReveal` | 50%/w1, 25%/w10, 10%/w10 | `resolveIntroDiscount` | ✅ **real Stripe coupon**, `duration: 'once'` |
| 5 | **Margin floor** (a discount *limiter*) | `marginFloorPct` | 15% over cost | `discountWithFloor`, per line | caps 1–3 |
| 6 | **Budget caps** (a selection constraint) | `budgetCaps` | £30 / £50 / £80 / ∞ | product selection + AI personaliser | n/a |

Plus `freeDeliveryThreshold: 50` — **advertised in the UI but never charged against**
(see F-9), and `minSubscriptionMonthly: 25` / `minSubscriptionMonths: 1` as guardrails.

**The architectural decision embedded here:** every discount except the intro offer is
computed in our engine and handed to Stripe as a single pre-discounted `unit_amount` via
inline `price_data`. Stripe holds **no** Product or Price catalogue, no coupons for
bundle/subscribe-&-save, and therefore no discount analytics.

This is defensible — the discount logic is genuinely too dynamic for Stripe Prices (it
depends on quiz answers, usage levels, per-line margin floors and consumption cadence) —
but it should be a **recorded, deliberate decision**, because it has consequences:
Stripe Dashboard revenue reporting shows gross-of-discount figures only, and Stripe Tax
and Stripe's own reconciliation tooling see one opaque line item. See §7, D-1.

The **intro discount is the one exception**, and it is done well:
`getOrCreateFirstMonthCoupon` lazily creates a deterministic, reusable coupon per whole
percent (`chrgd-first-month-50`), `duration: 'once'` so it applies to the first invoice
only. The rate is re-validated server-side against the live configured outcomes in
`claimIntroDiscount` before it ever reaches Stripe — a browser-supplied rate is never
trusted. The allocation ledger (`intro-allocation.ts`) spends the giveaway budget **only
at checkout**, so browsers who scratch and leave cost nothing. This is the strongest part
of the payment layer.

### 1.5 The subscription model

`MemberSubscription` (a JSON document in the `subscriptions` table, keyed by user id) is
the **source of truth for contents**; Stripe holds only the billing schedule and payment
method. One flat monthly recurring price = `flatMonthly` (the smoothed long-run average
across lines with different ship cadences).

`src/lib/recharge/*` — despite the name — are **pure functions** over that document
(swap, add, remove, pause, snooze, cancel, skip, per-delivery overrides). Every mutation
recomputes `flatMonthly` via `flatMonthlyOf(lines)`. The hub writes the result through
`PUT /api/hub/subscription`.

**And that is where the money stops.** `PUT /api/hub/subscription` persists the document
and nothing else. See F-4 — this is the most serious functional gap in the system.

Mapping to Stripe today:

| Concept | Ours | In Stripe |
|---|---|---|
| Recurring price | `flatMonthly` | `price_data.unit_amount`, monthly |
| First month | `firstMonth` | one-cycle coupon |
| Contents | `lines[]` | not represented |
| Cancel / pause / snooze | `status` | ❌ **not synced** |
| Re-price after edit | `flatMonthly` | ❌ **not synced** |
| Minimum term | `minMonths` (default 1) | ❌ not enforced |
| Skip credit | `pendingCredit` on line | ❌ not applied as invoice credit |
| Card on file | `paymentMethod` | ❌ **hardcoded `Visa 4242`** (F-5) |
| ID mapping | `stripe_sub:<id>` → userId in kv | `subscription-link.ts` ✅ |

### 1.6 Orders & fulfilment

`src/lib/orders/*` is well-built: a typed document, indexed columns, an audit event on
every transition, guarded state machine (`pending_payment → paid → submitted_to_supplier
→ supplier_confirmed → shipped → delivered`, with `cancelled | refunded | failed` as
side-exits), and idempotency by stable id (`ord_inv_<invoiceId>` for renewals). No
changes needed here beyond F-6 and F-7.

### 1.7 Webhook coverage

| Event | Handled | Notes |
|---|---|---|
| `checkout.session.completed` (payment) | ✅ | `markOrderPaid`, idempotent via status guard |
| `checkout.session.completed` (subscription) | ✅ | links ids, activates bundle |
| `invoice.paid` | ✅ | raises the fulfilment order, first box + renewals |
| `customer.subscription.deleted` | ✅ | marks cancelled |
| `invoice.payment_failed` | ❌ | **dunning invisible** (F-3) |
| `customer.subscription.updated` | ❌ | past_due / paused never reflected (F-3) |
| `checkout.session.expired` | ❌ | abandoned `pending_payment` rows accumulate (F-8) |
| `charge.refunded` / `charge.dispute.created` | ❌ | refunds/chargebacks made *in Stripe* don't reach us |

Signature verification (`constructWebhookEvent`) and raw-body handling
(`req.text()` + `force-dynamic`) are correct.

---

## 2. What works today

Stated plainly, so the plan is not read as "everything is broken":

- The payments resolver, its fail-safe downgrade, and the portal runtime toggle.
- Server-side price re-resolution on `/api/cart` — the client's numbers are never trusted.
- The subscription checkout path end-to-end, including the scratch-card intro discount as
  a real Stripe coupon, and its tamper-revalidation and allocation ledger.
- Webhook signature verification and idempotent order creation.
- The orders domain, its state machine, and the `/portal/orders` actions.
- Stripe billing portal wiring for members who have a `stripeCustomerId`.
- Full refunds on one-off orders (real Stripe refunds via `refundPayment`).

---

## 3. Findings

Severity: **P0** blocks go-live · **P1** correctness/money-affecting · **P2** hardening ·
**P3** debt/hygiene.

---

**F-1 · P0 · One-off Stripe checkout is unreachable — gated on the wrong flag.**

`src/hooks/useShopCheckout.ts:36` and `src/hooks/useStackCheckout.ts:111` both
short-circuit to `#mock-checkout` when `isShopifyLive()` is false. With the shipping
default (`NEXT_PUBLIC_DATA_SOURCE=mock`), that is *always* false — so setting
`PAYMENTS_SOURCE=stripe` changes nothing for the shop basket or the quiz one-off plan.
The browser never calls `/api/cart`, and the perfectly good Stripe branch inside it is
dead. Only the subscription path works, because `finalizeCheckout` correctly consults
`getPaymentSource()` server-side.

The fix is a deletion, not an addition: **remove the client-side gate entirely** and
always POST to `/api/cart`. The server already returns `#mock-checkout` in mock mode, so
the contract the hooks consume is unchanged. This also severs the last reason for the
client to know about the data source at all.

*Note this makes the `/shop` "checkout" button currently a no-op-with-success-UI in every
default deployment — worth knowing before anyone demos it.*

---

**F-2 · P0 · Subscription Checkout Sessions collect no delivery address.**

`createSubscriptionSession` (`src/lib/payments/stripe.ts:137`) omits
`shipping_address_collection` — present on the one-off session at line 56, missing here.
Consequently every subscription order reaches `submitOrderToSupplier` with
`shippingAddress: null` and falls through to the placeholder at
`src/lib/orders/service.ts:150`: `{ line1: '', city: '', postcode: '', country: 'GB' }`.

**Every subscription box would be dropshipped to a blank address.** This is the single
highest-consequence bug found.

---

**F-3 · P1 · Failed payments and dunning are invisible.**

No `invoice.payment_failed` or `customer.subscription.updated` handler. A member whose
card fails stays `active` in our DB while Stripe retries and eventually cancels; the hub
shows a healthy subscription, and we keep raising fulfilment orders on `invoice.paid`
only — so the failure is silent until `customer.subscription.deleted` finally lands.

---

**F-4 · P1 · The subscription lifecycle is one-way — hub changes never reach Stripe.**

Every hub mutation (`src/lib/recharge/mock.ts`: `addLine`, `removeLine`, `swapProduct`,
usage-level change, `pauseSubscription`, `snoozeSubscription`, `cancelSubscription`)
recomputes `flatMonthly` and writes the document via `PUT /api/hub/subscription`
(`src/lib/hub-store.tsx:53`). That route calls `saveSubscription` and returns. Stripe is
never told.

Concretely, in production:
- A member cancels in the hub → **Stripe keeps charging them every month.**
- A member adds a product → we ship more, bill the same. Margin loss.
- A member removes a product or snoozes → we bill the same. Overcharging.

This needs a `syncSubscriptionToStripe(userId)` reconciliation step invoked from the
mutation route. Cancel/pause map to `stripe.subscriptions.update/cancel`; a `flatMonthly`
change means swapping the subscription item onto a new inline price (with an explicit
proration policy — see D-2).

---

**F-5 · P1 · Every member's hub shows a hardcoded "Visa ending 4242".**

`buildMemberSubscription` (`src/lib/recharge/mock.ts:107`) sets
`paymentMethod: { brand: 'Visa', last4: '4242' }` unconditionally — and it is used by the
*real* checkout path in `useStackCheckout`, not only by the demo seed. Members who paid
with any other card see a card that is not theirs. Populate from the Stripe subscription's
default payment method on `checkout.session.completed`, or drop the field and rely on the
billing portal.

---

**F-6 · P1 · Refunding a subscription order is a silent no-op in Stripe.**

`createSubscriptionOrder` never sets `stripePaymentIntentId`, so the guard at
`src/app/api/portal/orders/[id]/route.ts:53` is false for every subscription order: the
row is marked `refunded` in our DB and **no money moves**. Capture the payment intent (or
charge id) from the invoice on `invoice.paid`, and refund via the invoice/charge.

Related: `refundPayment` supports full refunds only — no partial refunds.

---

**F-7 · P2 · No Stripe Customer reuse.**

Both session builders pass `customer_email` and never `customer`. A returning member gets
a fresh Stripe Customer on each checkout, fragmenting billing history and payment methods.
Store `stripeCustomerId` on the user record and pass it when known.

---

**F-8 · P2 · Abandoned checkouts leak `pending_payment` rows.**

`/api/cart` pre-creates the order before redirecting. Abandoned sessions leave the row
forever — no `checkout.session.expired` handler and no sweeper. Pollutes `/portal/orders`
and any conversion metric built on it.

---

**F-9 · P2 · Free-delivery threshold is advertised but delivery is never charged.**

`freeDeliveryThreshold: 50` drives copy in `PlanReceipt`, `ShopShell` and `BasketDrawer`,
but no Checkout Session sets `shipping_options` and `order.shipping` is hardcoded `0`
(`src/lib/orders/service.ts:37`). Delivery is free at every basket size. Either charge
shipping below the threshold or remove the messaging — today the promise is real but
meaningless, which is the harmless direction, but it is not what the config says.

---

**F-10 · P2 · Stripe API version unpinned; currency hardcoded.**

`new Stripe(key)` with no `apiVersion` (`src/lib/payments/stripe.ts:16`) means Stripe's
account-default version applies and can shift under us — the webhook already carries
defensive shape-juggling for exactly this (`addressFromSession`, `idOf`). Pin it. Currency
defaults to `'gbp'` at three call sites with no central constant.

---

**F-11 · P2 · No Stripe Tax.**

No `automatic_tax` on either session. UK VAT is neither collected nor recorded. A business
decision as much as a technical one, but it must be a decision.

---

**F-12 · P3 · Minimum term is not enforced at the billing layer.**

`minSubscriptionMonths` defaults to `1` (no commitment), so this is currently latent — but
if it is ever raised, `canCancel`/`monthsRemainingOnTerm` guard only *our* UI. The Stripe
billing portal would let a member cancel regardless.

---

**F-13 · P3 · Documentation contradicts the shipped code.**

- `docs/POWERBODY_STRIPE_PLAN.md:3` — "**not yet built.** No application code changes have
  been made yet" — but Phases 0–5 are substantially built.
- `docs/SUBSCRIPTIONS.md` — written entirely against **Shopify + Recharge**, describes
  selling plans and Recharge minimum cycles as the billing engine, and quotes stale
  numbers (25%/50% at weights 2/1 and a 4-month minimum; the code has 50/25/10 at weights
  1/10/10 and `minSubscriptionMonths: 1`).
- `README.md` describes a "Mobile-first AI TikTok carousel idea builder" and an 8-stage
  content pipeline — a different product entirely.

Anyone onboarding is actively misled about how billing works.

---

## 4. Shopify tech-debt inventory

Shopify is already decoupled by design (payments and catalogue are independent axes), and
`NEXT_PUBLIC_DATA_SOURCE=mock` is the default — so nothing here is *running*. It is
inert weight that is nonetheless **causing F-1** and confusing every reader.

### 4.1 Delete outright

| Path | Why |
|---|---|
| `src/lib/shopify/` (client, operations, catalogue, admin, types — 5 files, ~1000 LOC) | Storefront + Admin API layer, unreachable once the two consumers below go |
| `src/app/api/subscribe/route.ts` | **Zero callers.** Builds a Shopify selling-plan cart; superseded by `/api/checkout/finalize` |
| `src/hooks/useShopifyCart.ts` | Only consumer is `Act5Bundle` |
| `src/components/scroll/Act5Bundle.tsx` | **Unreachable** — `Act4Reveal` takes no `onComplete`, so `ScrollExperience` can never advance to act 5. A whole legacy checkout screen, dead |
| `src/app/api/products/route.ts` | Shopify-only (`fetchCatalogue`) + a `?debug` branch that echoes store domain and a token preview. Superseded by `/api/catalogue`; **also mild info-disclosure** |
| `src/hooks/useProducts.ts` | Consumer of `/api/products` |
| `scripts/seed-shopify-tags.mjs` | Seeds `chrgd.*` Shopify metafields |
| `src/lib/mock-products.ts` | Shopify-shaped mock, only used as `/api/products` fallback |

### 4.2 Rewrite / narrow

| Path | Change |
|---|---|
| `src/hooks/useShopCheckout.ts`, `src/hooks/useStackCheckout.ts` | Drop `isShopifyLive()` gating — **this is F-1's fix**. Always call the server |
| `src/lib/data-source.ts` | Collapse `mock \| shopify` → the supplier axis, or retire entirely once `catalogue/resolve.ts` reads only supplier + curated catalogue |
| `src/lib/catalogue/resolve.ts:31` | Remove the Shopify branch |
| `src/lib/stack-blueprint/checkout.ts` | Drop `requireShopifyIds`/`requireSellingPlans`, the `no-shopify-id`/`no-selling-plan` error variants, `buildCartPermalink`, `gidToNumeric`. Rename `merchandiseId` → `variantId` |
| `src/lib/catalogue/types.ts` | Retire `shopifyProductId`, `shopifyVariantId`, `sellingPlanId` |
| `src/lib/stack-blueprint/pricing.ts:520–523,709–710` | Drop `sellingPlanId` from `SubscriptionLine` |
| `src/lib/checkout/types.ts` | `CheckoutPayload.lines` exists solely to carry Shopify cart lines — **`finalizeCheckout` never reads it**. Delete the field |
| `src/lib/portal/readiness.ts:70` | Drop the "no selling plan configured" check |
| `src/app/api/portal/{products,import,ai-classify}` | Remove `getDataSource() === 'shopify'` write-through branches |
| `src/app/portal/settings`, `DataSourceToggle`, `PortalShell`, `PortalSync`, `/api/config`, `/api/portal/data-source` | Retire the Shopify data-source toggle; **`/api/config` should expose the payments mode instead** |
| `src/lib/recharge/` | Rename → `src/lib/subscription/`. Pure, well-tested logic with a misleading vendor name; `MemberSubscription.id` is still documented as "Recharge subscription/contract id" |
| `.env.example` | Remove the four `SHOPIFY_*` blocks and the `NEXT_PUBLIC_DATA_SOURCE` Shopify framing |
| `docs/SUBSCRIPTIONS.md`, `docs/POWERBODY_STRIPE_PLAN.md`, `README.md` | Rewrite against Stripe (F-13) |

**Rough scale:** ~2,000 LOC deleted, ~15 files removed, one module renamed. Every affected
`__tests__/` file needs its Shopify assertions stripped — the 643-test suite is the safety
net for all of it.

---

## 5. Phased plan

Each phase is independently shippable and leaves the suite green. Phases 1–2 are the
go-live blockers; 3–4 are the correctness work; 5–6 are hygiene.

---

### Phase 1 — Unblock Stripe checkout *(P0; ~half a day)*

*Depends on: nothing. Live impact: one-off Stripe checkout becomes reachable.*

1. Delete the `isShopifyLive()` short-circuits in `useShopCheckout` and `useStackCheckout`;
   always POST to `/api/cart` and honour the server's `{ checkoutUrl, mock }`. **(F-1)**
2. Add `shipping_address_collection` + `phone_number_collection` to
   `createSubscriptionSession`, matching the one-off session. **(F-2)**
3. Pin `apiVersion` in `getStripeClient()`; introduce a single `DEFAULT_CURRENCY`. **(F-10)**
4. Expose `paymentsMode` on `/api/config` so the client can render honest copy
   ("Demo checkout" vs "Checkout") without importing a payments module.

**Done when:** with `PAYMENTS_SOURCE=stripe` + a test key, a guest completes a `/shop`
basket and a quiz one-off through Stripe Checkout, both orders land `paid` via webhook,
and a subscription checkout captures a real delivery address that appears on the order.

---

### Phase 2 — Close the subscription lifecycle *(P1; ~2 days)*

*Depends on: 1. Live impact: hub actions start moving money.*

5. New `src/lib/payments/subscription-sync.ts`:
   `cancelStripeSubscription`, `pauseStripeSubscription`, `resumeStripeSubscription`,
   `updateStripeSubscriptionPrice(subId, newMonthly, proration)`.
6. Invoke it from `PUT /api/hub/subscription` by diffing stored vs incoming
   (`status`, `flatMonthly`), guarded on `getPaymentSource() === 'stripe'` and the presence
   of `stripeSubscriptionId`. Failures must not lose the document write — persist first,
   sync second, log and surface reconciliation failures to `/portal`. **(F-4)**
7. Handle `invoice.payment_failed` → `status: 'past_due'` + hub banner; and
   `customer.subscription.updated` → mirror status/`cancel_at_period_end`. **(F-3)**
8. Populate `paymentMethod` from the subscription's default payment method on
   `checkout.session.completed`; stop hardcoding it in `buildMemberSubscription`. **(F-5)**

**Done when:** cancelling in the hub cancels in Stripe; adding a line re-prices the
Stripe subscription on the next invoice; a declined test card surfaces as `past_due` in
the hub; and the hub shows the card actually used.

---

### Phase 3 — Money-movement correctness *(P1–P2; ~1 day)*

*Depends on: 1.*

9. Capture the payment intent / charge from `invoice.paid` onto subscription orders so
   `/portal/orders` refunds actually refund; add partial-refund support. **(F-6)**
10. Reuse Stripe Customers — persist `stripeCustomerId` on the user, pass `customer` when
    known. **(F-7)**
11. Handle `checkout.session.expired` → mark the order `failed`; add a sweeper for
    `pending_payment` rows older than 24h. **(F-8)**
12. Handle `charge.refunded` and `charge.dispute.created` so money moved *in the Stripe
    dashboard* reconciles back into our ledger.

**Done when:** refunding any order type (including subscription) moves real money; a
returning member has one Stripe Customer; abandoned checkouts self-clean.

---

### Phase 4 — Shopify removal, part 1: the dead layer *(P3; ~1 day)*

*Depends on: 1 (which removes the last live consumer). Live impact: none.*

13. Delete everything in §4.1. Strip the now-unused `CheckoutPayload.lines`.
14. Remove `requireShopifyIds` / `requireSellingPlans` and the two Shopify `ValidationError`
    variants from `stack-blueprint/checkout.ts`; rename `merchandiseId` → `variantId`.
15. Update the affected `__tests__/` files.

**Done when:** `grep -ri shopify src/` returns only the catalogue-type fields deferred to
Phase 5, and the suite is green.

---

### Phase 5 — Shopify removal, part 2: types, flags & docs *(P3; ~1 day)*

*Depends on: 4.*

16. Retire `shopifyProductId` / `shopifyVariantId` / `sellingPlanId` from
    `CatalogueProduct`, `SubscriptionLine` and `readiness.ts`.
17. Collapse or retire `data-source.ts` and the portal data-source toggle; leave
    `SUPPLIER_SOURCE` and `PAYMENTS_SOURCE` as the only two axes.
18. Rename `src/lib/recharge/` → `src/lib/subscription/`; re-word the vendor-named comments.
19. Clean `.env.example`. Rewrite `docs/SUBSCRIPTIONS.md` against Stripe, correct the stale
    discount figures, mark `docs/POWERBODY_STRIPE_PLAN.md` as delivered, fix `README.md`.
    **(F-13)**

**Done when:** `grep -ri "shopify\|recharge" src/ docs/ .env.example` is empty apart from
deliberate historical notes.

---

### Phase 6 — Commercial hardening *(P2; scope depends on decisions)*

*Depends on: 1–3. Requires the §7 decisions first.*

20. Shipping: either `shipping_options` on the Checkout Session honouring
    `freeDeliveryThreshold`, or remove the messaging. **(F-9)**
21. `automatic_tax` + customer address collection for VAT, if adopted. **(F-11)**
22. Minimum-term enforcement in Stripe, if `minSubscriptionMonths` is ever raised. **(F-12)**
23. Idempotency keys on session creation; a webhook event-id dedupe table (belt-and-braces
    over the existing id-based idempotency).

---

## 6. Test plan

The existing 643 tests are the safety net for the deletion phases. New coverage needed:

| Area | Tests |
|---|---|
| Checkout gating (F-1) | `/api/cart` is called in mock mode too; the hook honours the server's `mock` flag rather than deciding for itself |
| Subscription session (F-2) | address collection requested; the webhook writes a real address onto the order |
| Lifecycle sync (F-4) | cancel → Stripe cancel called; `flatMonthly` change → price update called; **document write survives a Stripe failure** |
| Dunning (F-3) | `invoice.payment_failed` → `past_due`; `customer.subscription.updated` mirrors status |
| Refunds (F-6) | subscription order carries a payment intent and refunds for real; partial refund arithmetic |
| Customer reuse (F-7) | second checkout passes `customer`, not `customer_email` |
| Expiry (F-8) | `checkout.session.expired` → `failed`; sweeper picks up stale rows |
| Discount regression | after every Shopify deletion, `pricing.test.ts` figures are byte-identical — **the discount engine must not move** |

Manual verification stays as `docs/STRIPE_TESTING.md` (which is accurate and current —
the best-maintained doc in the repo), extended with the dunning and hub-cancel paths.

---

## 7. Decisions needed before Phase 6

**D-1 · Do discounts stay in our engine, or move to Stripe Coupons?**
*Recommendation: stay.* The logic depends on quiz answers, usage levels and per-line
margin floors — not expressible as Stripe Prices. Accept that Stripe reporting shows
gross figures and treat our DB as the revenue ledger of record. But **record the decision**,
because the reflex when Stripe reporting looks wrong will be to "fix" it here.

**D-2 · Proration policy when a hub edit changes `flatMonthly`.**
Options: `create_prorations` (fair, complex invoices), `none` (simple, next cycle — matches
the "flat monthly, smoothed average" story), or `always_invoice` (immediate). *Recommendation:
`none`* — the flat-monthly model already smooths, and mid-cycle prorations undercut it.

**D-3 · VAT.** Adopt Stripe Tax, or handle it out-of-band? Blocks F-11.

**D-4 · Shipping.** Charge below £50, or drop the threshold messaging? Blocks F-9.

**D-5 · Minimum term.** Keep `minSubscriptionMonths: 1`? If it ever rises, F-12 becomes P1
and the Stripe billing portal must be restricted.

---

## 8. Sequencing summary

```
  Phase 1  ██  P0  unblock checkout + address collection          ← go-live blocker
  Phase 2  ████ P1  subscription lifecycle sync + dunning         ← go-live blocker
  Phase 3  ██  P1  refunds, customers, expiry, disputes
  Phase 4  ██  P3  delete the dead Shopify layer
  Phase 5  ██  P3  types, flags, docs
  Phase 6  ??  P2  shipping / tax / term      ← gated on §7 decisions
```

Phases 4–5 can run in parallel with 2–3 (they touch disjoint files), but sequencing them
after 1 avoids deleting the Shopify gate and rewriting the hooks in the same commit.
