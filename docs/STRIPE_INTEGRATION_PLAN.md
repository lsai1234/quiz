# Stripe integration — architecture scan & phased plan

Status: **Phases 0–2 shipped; Phase 3 specified, not built.**

- **Rev 4** — **Phases 0–2 implemented.** Policy confirmed: *cancel whenever you want,
  settle the outstanding balance on what has already been sent.* 68 suites / 935 tests
  passing (was 899). Phase 3 (actually charging it) is specified but **not built**.
- Rev 3 — rescanned at `master` @ `a3051e5`, focused on the cancel buy-out.
- Rev 2 — after the P1–P8 product-changes / consent / notifications track.
- Rev 1 — initial scan at `a4c1154`.

> **The confirmed offer.** *Cancel whenever you want — there is no minimum term and no
> cancellation fee — but settle the outstanding balance on anything already sent you that
> your payments have not yet covered.* The settlement replaces the minimum term rather than
> sitting alongside it (D-7): it recovers exactly what is owed instead of binding anyone.
>
> **What Rev 4 built.** The maths was already right; nothing underneath it was. Phase 0
> made the subscription clock real, so the figure is correct at any point in a plan's life
> rather than only in month zero. Phase 1 put the settlement into the consented Terms and
> disclosed it at checkout, with a version gate so it can never be charged to someone who
> was promised "no fee". Phase 2 brought `cancelSettlement` across and showed the member
> the figure and its arithmetic before they confirm.
>
> **What it deliberately did not build.** Phase 3 — actually taking the money. The
> settlement is calculated, disclosed and shown, but nothing charges it yet. That is the
> right order: the clock had to be trustworthy and the terms had to permit it before a
> single pound moved.

---

## 1. The cancel buy-out — the requirement

You want: when a member cancels, they settle the outstanding balance for goods already
delivered. Your example — three products in month one, one in month two, cancel after one
month — is exactly the case the branch's own test encodes:

```
  a monthly £30 item      → ships every month
  two 3-month £60 tubs    → ship once, last three months

  flatMonthly  = 30 + (60/3) + (60/3)  = £70
  first box shipped        30 + 60 + 60 = £150
  paid after one month                  = £70
  ─────────────────────────────────────────────
  cancelSettlement                      = £80
```

That is the correct economic answer, and the reasoning in the code comments is sound: the
flat monthly *spreads* multi-month items, so "cancel anytime" would otherwise let someone
bank three tubs for one month's pay. Framing it as **paying for what was shipped** — not a
cancellation fee — is also the framing that survives UK consumer-law scrutiny. Keep that
framing; it matters (see S-4).

### 1.1 What exists

| Piece | Where | State |
|---|---|---|
| `shippedValueToDate(line)` | `recharge/mock.ts:366` | master ✅ |
| `paidToDate(line, sub)` | `recharge/mock.ts:370` | master ✅ |
| `lineSettlement(line, sub)` | `recharge/mock.ts:380` | master ✅ — per-line, on removal |
| `removeLine` → `{ sub, settlement }` | `recharge/mock.ts:422` | master ✅ |
| `shippedValueOf(sub)` / `paidToDateOf(sub)` | `recharge/mock.ts` | ✅ **added (P2)** |
| `cancelSettlement(sub)` | `recharge/mock.ts` | ✅ **added (P2)** |
| The clock that keeps them honest | `recharge/clock.ts` | ✅ **new (P0)** |
| `firstMonthDiscountRate` | — | ✅ **dropped** — reads master's `introDiscountRate` (S-5) |
| Display in `BillingImpact` / `LineManageSheet` | master | ✅ shown to the member |
| Display + arithmetic in `CancelSaveFlow` | `CancelSaveFlow.tsx` | ✅ **added (P2)** |
| Disclosure in the Terms + at checkout | `legal/content.ts` | ✅ **added (P1)** |
| Consent gate before it may be charged | `legal/consent.ts` | ✅ **added (P1)** |
| **Anything that charges it** | — | ❌ **still does not exist — Phase 3** |

### 1.2 Findings

---

**S-1 · P0 · ✅ FIXED · Cancel was a silent no-op for every real paying member.**

```
monthsRemainingOnTerm = max(0, minMonths − monthsActive + skipped + snoozed)
canCancel             = monthsRemainingOnTerm === 0
cancelSubscription    = canCancel(sub) ? {...cancelled} : sub      ← returns sub UNCHANGED
```

`minSubscriptionMonths` defaults to **1**. `monthsActive` for a subscription built by the
real checkout is **0** (`buildMemberSubscription`, `opts.monthsActive ?? 0`) and — see S-2 —
never advances. So `monthsRemainingOnTerm = 1`, `canCancel = false`, and
`cancelSubscription` returns the subscription **unmodified**. The member clicks Cancel, the
sheet closes, nothing happens. `pauseSubscription` carries the same guard, so pause is
blocked too.

**Why nobody has caught it:** the hub's *demo seed* (`createMockSubscription`) passes
`monthsActive: 2`, so `canCancel` is true and cancel works perfectly in every demo and in
the mock flow. Only accounts that actually checked out are affected — i.e. only real
customers.

**Fixed in Phase 0.** `cancelSubscription` is now unconditional — the settlement is the
protection, so there is nothing left for a term to guard and no reason to refuse. The
`canCancel` gate came off `pauseSubscription` too: blocking the gentler action while
allowing the drastic one made no sense to a member. Pinned by a test that cancels a
`monthsActive: 0` subscription — exactly what the real checkout produces, and exactly what
the demo seed's `monthsActive: 2` was hiding.

---

**S-2 · P0 · ✅ FIXED · The settlement's two inputs were never advanced, so the number was
only correct in month zero.**

`monthsActive` is written in exactly one place — `buildMemberSubscription`, at construction.
`deliveriesMade` likewise (`deliveriesInMonths(monthsActive, …)` at construction, `0` in
`addLine`). Nothing increments either: not the `invoice.paid` webhook, not the daily cron,
not the orders service. Confirmed by grep across `src/`.

For a live Stripe member, both freeze at signup. Consequences:

| After | `monthsActive` | `paidToDateOf` | `shippedValueOf` | `cancelSettlement` |
|---|---|---|---|---|
| month 0 | 0 | £70 | £150 | £80 ✅ correct |
| month 6 | 0 *(should be 6)* | £70 *(should be £490)* | £150 *(should be ~£330)* | £80 ❌ |
| month 12 | 0 *(should be 12)* | £70 *(should be £910)* | £150 *(should be ~£570)* | £80 ❌ |

A member who has paid £910 against £570 of goods would be charged **£80 they do not owe**.
Both inputs are stale and they err in opposite directions, so the error does not even
cancel out predictably — the number is simply not meaningful after month zero.

**Fixed in Phase 0**, in `src/lib/recharge/clock.ts` (pure) driven from the `invoice.paid`
webhook. Stripe's invoice stream is the source of truth for "cycles actually paid for".
Three decisions worth knowing:

- **Renewals only.** The clock advances on `billing_reason === 'subscription_cycle'`, not
  `subscription_create`. The first invoice is the month already accounted for by
  `monthsActive: 0` plus the box that ships at signup; counting it would credit the member
  with paying their first month twice and undercharge the settlement.
- **Idempotent against redelivery.** Keyed off the fulfilment order's prior existence
  (`ord_inv_<invoiceId>`), checked *before* the order is raised. A redelivered webhook that
  advanced the clock again would silently shrink what someone owes.
- **`deliveriesMade` is derived, not accumulated.** Recomputed each cycle from the line's
  own cadence and `joinedAtMonth` (new field, defaults to 0). An accumulator drifts on
  replay or substitution; deriving it means a swap that keeps the line id keeps its
  delivery history, and a product added in month four is never credited with the four
  boxes that shipped before it existed.

---

**S-3 · P1 · PARTLY ADDRESSED · The settlement is computed and displayed, but never charged
— and there is still no primitive that could charge it.**

`lineSettlement` reaches `BillingImpact` ("Settlement (already-shipped box)") and
`LineManageSheet`; `cancelSettlement` reaches `CancelSaveFlow` on the branch. All display.
Cancel and remove both run as **pure client-side mutations** → `persist()` →
`PUT /api/hub/subscription`, which saves the document and returns.

**Phase 2** made the display honest rather than incidental: `CancelSaveFlow` now shows the
figure with its arithmetic (value sent − paid so far = to settle), or an explicit "nothing
left to pay" when it is zero, and the confirm button names the amount. The Terms promise
the member sees it before confirming, so this is now load-bearing copy, not decoration.

**Still true:** nothing collects it. A member confirms and no money moves. That is Phase 3,
and it is the honest state to be in — better than charging against terms nobody had agreed
to, but it must not be left here indefinitely.

`lib/payments/stripe.ts` exposes only hosted **Checkout Sessions** (redirect-based),
`updateSubscriptionAmount`, the billing portal, and `refundPayment`. There is **no
off-session charge primitive** — and a redirect-to-Checkout is the wrong tool for a cancel
settlement, because the member can simply close the tab and walk away with both the goods
and the cancellation.

---

**S-4 · P0 · ✅ FIXED · The Terms the member consented to promised cancellation with no fee.**

`lib/legal/content.ts`, `TERMS_VERSION = '2026-07-29'`, is a **versioned, consented
document with an evidence row per member** (`recordConsent` in `finalize.ts`, migration v4).
It currently says:

- *"After any minimum term you can cancel whenever you like from your account, **with no fee
  and no phone call**. Your plan runs to the end of the month you have paid for."* (:188)
- *"Where there is no minimum term, you can cancel any time."* (:187)
- *"You also have the statutory right to cancel within 14 days of your first order under the
  Consumer Contracts Regulations 2013."* (:190)
- *"If a change materially affects you, we will tell you and ask you to accept the new
  version before it applies to your plan."* (:219)

Charging a buy-out contradicts the first line, and the document itself binds you to the
process in the last. So the sequence is forced:

1. Draft settlement terms into `TERMS_VERSION` — framed as **paying the balance for goods
   already delivered**, never as a cancellation fee or penalty. A penalty on a
   no-minimum-term contract is very likely an unfair term under the Consumer Rights Act
   2015; a genuine debt for product received is not, *provided it is disclosed before
   purchase* and the method of calculation is transparent.
2. Show the mechanism at checkout, next to the flat-monthly explanation — the reason the
   monthly is smoothed is the reason the settlement exists, and it reads honestly when the
   two are presented together.
3. Bump the version, re-consent existing members, and **only apply the settlement to
   subscriptions whose consent row carries the new version**. The evidence table makes this
   enforceable; use it.
4. Carve out the statutory 14-day window (S-7).

**Done in Phase 1.** `TERMS_VERSION` is now `2026-08-03`. The "Minimum term and cancelling"
section became **"Cancelling, and settling what we have already sent you"**: no minimum
term, no cancellation fee, and a balance framed throughout as *a debt for goods received*
— *"This is not a charge for leaving; it is the outstanding balance on goods you have
received and kept."* It carries the worked example from §1, states that the balance only
ever covers goods already dispatched and falls to zero, and promises the figure is shown
before confirmation. The statutory 14-day right is placed explicitly *ahead* of it.

Disclosed at checkout too, not only in the terms: `CHECKOUT_BILLING_POINTS` renders above
the consent box, next to the flat-monthly explanation that is the reason the balance exists.
A balance that only appears when someone tries to leave is the kind of term that gets struck
down however sound the arithmetic.

`SETTLEMENT_TERMS_VERSION` + `consentCoversSettlement(userId)` are the enforcement point.
Anyone still on the old terms was promised "no fee" and **cancels free** until they accept
the new ones — enforced per member against the consent evidence table, not by deploy date.

**Still needs a lawyer.** The structure and framing are right; the wording has not been
reviewed, and it should be before it earns a penny.

---

**S-5 · P2 · ✅ FIXED · The branch introduced a duplicate discount field.**

The branch adds `MemberSubscription.firstMonthDiscountRate` ("the first-month intro discount
actually applied at signup"). Master already has `introDiscountRate` — *"the first-month
intro discount (0–1) the member claimed at checkout … this is the granted rate, not the one
the browser asked for"* — plus `firstMonth` (the amount actually billed).

These are the same concept. `firstMonthDiscountRate` was dropped. `paidToDateOf` prefers
`firstMonth` — the amount the card was actually charged — and falls back to
`introDiscountRate` for subscriptions written before `firstMonth` was recorded. Two fields
that must agree, in the input to a charge, is exactly where a silent money bug lives.

---

**S-6 · P1 · SPECIFIED, NOT BUILT · Choosing how to collect it.**

Recommended: **invoice item + a one-off invoice, charged off-session**, not a PaymentIntent
and not a Checkout redirect.

```
  computeSettlement(sub)          ← SERVER-SIDE, from the stored doc, never the client
        ↓
  stripe.invoiceItems.create({ customer, amount, currency, description })
        ↓
  stripe.invoices.create({ customer, collection_method: 'charge_automatically',
                           pending_invoice_items_behavior: 'include', auto_advance: true })
        ↓
  finalise → Stripe attempts the saved card off-session
        ↓
  ┌── paid ──────────► cancel Stripe subscription · save sub cancelled · receipt email
  └── failed / requires_action
              └──────► cancel Stripe subscription ANYWAY · leave the invoice open
                       · email hosted_invoice_url · pursue via normal dunning
```

Why an invoice rather than a PaymentIntent: it produces a real invoice document, appears in
the member's billing history beside their subscription, gets Stripe's dunning and the hosted
payment page (which is also the SCA fallback) for free. For a charge people will query, the
paper trail is the point.

**The ordering is the inverse of `applyChangeEvent`, deliberately.** The re-price path puts
Stripe first because a plan that disagrees with the card charge is worse than no change. Here
the opposite holds: **cancellation must never be withheld pending payment.** Blocking a
cancellation until a debt is settled is precisely the kind of term that gets struck down.
Cancel first, always; collect the debt as an ordinary receivable.

Two things to verify before relying on this, rather than assume:

- **Mandate scope.** Subscription Checkout saves a payment method for *recurring* charges.
  An unscheduled, variable-amount off-session charge may sit outside that mandate under UK/EU
  SCA rules. Confirm with Stripe (and set `setup_future_usage` / an explicit unscheduled
  mandate at checkout if needed) rather than discovering it via `authentication_required`
  failures in production.
- **Customer identity.** F-7 (below) means returning members can end up with multiple Stripe
  Customers. The settlement invoice must land on the customer that holds the card — fix F-7
  first or the charge has nothing to bill.

**Snapshot the figure.** Compute the settlement once, at cancel, and store it on the
subscription (or an audit row) with its inputs. `deliveriesMade` and `monthsActive` keep
moving; a number the member was shown must not silently change before it is charged.

---

**S-7 · P1 · DISCLOSED, NOT ENFORCED · Edge cases the charge path has to answer.**

| Case | Required behaviour |
|---|---|
| **Statutory 14-day cancellation** | Consumer Contracts Regs 2013 override. Within 14 days of the first order the member returns unopened goods for refund — a settlement must not be used to defeat that. Waive, or limit strictly to opened/consumed goods |
| **Cancelling in a price-increase notice window** | Terms already promise a free exit (`content.ts:157`). Waive the settlement |
| **We changed their plan** | `changes/event.ts:76` already sets `settlement: 0` for involuntary changes — *"we never charge a settlement on a removal we caused"*. Extend the same principle to a cancel that follows one |
| **Pause / snooze** | Not a cancellation. No settlement |
| **Substituted lines** | `deliveriesMade` must survive a swap, or shipped-value resets and the member is under-charged |
| **Settlement ≤ £0** | No invoice item, no invoice, no email. Do not create a £0 invoice |
| **Charge fails** | Cancel stands. Invoice stays open. One clear email with the hosted invoice link |
| **Member disputes it** | The snapshot plus `deliveriesMade` history is the evidence. Store it |
| **Mock mode** | `getPaymentSource() !== 'stripe'` → compute, display, record, charge nothing |

---

## 2. Carry-forward findings

Re-verified at `a3051e5`. Statuses unchanged from Rev 2 except where noted.

| # | Sev | Status | Summary |
|---|---|---|---|
| F-1 | P0 | OPEN | One-off Stripe checkout unreachable — `useShopCheckout:36` / `useStackCheckout:85` gate on `isShopifyLive()`, false by default |
| F-2 | P0 | OPEN | Subscription sessions collect no delivery address → boxes dropship to a blank address |
| F-3 | P1 | OPEN | No `invoice.payment_failed` / `customer.subscription.updated` — dunning invisible |
| F-4a | — | **DONE** | Supplier-driven re-price syncs to Stripe (`syncBilling` → `updateSubscriptionAmount`), Stripe-first, `proration_behavior: 'none'` |
| F-4b | P1 | OPEN | Member-driven changes never reach Stripe — `PUT /api/hub/subscription` just saves. **Now compounded by S-1/S-3** |
| F-4c | P2 | OPEN | Two writers mutate `flatMonthly`, one unsynced |
| F-5 | P1 | OPEN | Hardcoded `Visa 4242` on real checkouts (`mock.ts:136`) |
| F-6 | P1 | OPEN | Subscription-order refunds are a silent no-op (no payment intent captured) |
| F-7 | P2 | OPEN | No Stripe Customer reuse — **now blocks S-6** |
| F-8 | P2 | OPEN | Abandoned `pending_payment` rows leak |
| F-9 | P2 | OPEN | Free-delivery threshold advertised, never charged |
| F-10 | P2 | OPEN | API version unpinned; `'gbp'` hardcoded at four sites |
| F-11 | P2 | OPEN | No Stripe Tax / VAT |
| F-12 | P3 | OPEN→**P1** | Minimum term unenforced in Stripe. **No longer latent**: S-1 shows the term guard is load-bearing and currently misfiring |
| F-13 | P3 | OPEN | `POWERBODY_STRIPE_PLAN.md` says "not yet built"; `SUBSCRIPTIONS.md` still Shopify/Recharge-framed with stale figures; `README.md` describes a different product |
| F-14 | P2 | OPEN | Daily cron re-prices without retry or alerting on `syncBilling` failure |

Shopify debt inventory is unchanged from Rev 2 §4 — ~2,000 LOC across ~15 files, still
inert, still the cause of F-1. `lib/recharge/` now has 20 importers; the rename gets more
expensive each phase.

---

## 3. Plan

Phase 0 is new and unblocks everything else. Phases 1–3 are the settlement track. The
original Stripe phases follow, renumbered.

---

### Phase 0 — Make the subscription clock real ✅ **DONE**

*Fixed two live bugs. Prerequisite for any settlement work.*

1. ✅ `src/lib/recharge/clock.ts` — `advanceCycle`, `deliveriesMadeFor`, `syncDeliveryCounts`.
   Pure; the webhook does the I/O. **(S-2)**
2. ✅ Wired into `invoice.paid`: renewals only, idempotent against redelivery.
3. ✅ `MemberSubscriptionLine.joinedAtMonth` — set by `addLine`, so a later addition is not
   credited with earlier boxes.
4. ✅ `cancelSubscription` is unconditional; `pauseSubscription` gates on state, not policy.
   **(S-1, F-12)**
5. ✅ Copy that promised a minimum term removed from `BillingSummary`, `CancelSaveFlow` and
   `DeliveryDetailSheet`, and `minSubscriptionMonths`' doc comment rewritten to say plainly
   that it no longer gates anything.

**Verified by:** `recharge/__tests__/clock.test.ts` (14 assertions on the semantics), four
new webhook tests (advances on renewal, not on `subscription_create`, not twice for a
redelivered invoice, once per distinct invoice), and a regression test cancelling a
`monthsActive: 0` subscription.

**Known follow-up, deliberately out of scope:** `subscriptionOrderLines` puts *every* line
in *every* subscription order, so a 3-month tub is dropshipped monthly. The clock models
per-line cadence correctly; fulfilment does not. Fixing it changes what physically ships
and belongs in its own change.

---

### Phase 1 — Terms, consent, and disclosure ✅ **DONE (pending legal review)**

*Gates Phase 3. The wording still needs a lawyer's eyes before it earns money.*

6. ✅ Terms section rewritten as *settling the balance on goods already delivered*, with the
   worked example, the falls-to-zero promise and the "shown before you confirm" commitment.
   **(S-4)**
7. ✅ `CHECKOUT_BILLING_POINTS` — disclosed at checkout, above the consent box.
8. ✅ `TERMS_VERSION` → `2026-08-03`. `needsReconsent` already keys off the version, so the
   in-hub re-consent prompt arms itself.
9. ✅ `SETTLEMENT_TERMS_VERSION` + `consentCoversSettlement(userId)` — the gate Phase 3 must
   call before charging anyone.
10. ⬜ **Legal review of the wording.** Not done. Nothing should be charged until it is.
11. ⬜ Re-consent campaign for existing members via the outbox.

**Verified by:** nine new assertions in `legal/__tests__/content.test.ts` (it is a fee-free
cancellation, it is not a charge for leaving, it is capped by what was sent, it shows the
arithmetic, it lists the waivers, the statutory right comes first) and six in
`consent.test.ts` for the gate.

---

### Phase 2 — Bring the settlement across ✅ **DONE**

12. ✅ `cancelSettlement`, `shippedValueOf`, `paidToDateOf` added to `recharge/mock.ts`.
    Written fresh against master rather than cherry-picked — the branch's other 11 commits
    are a quiz redesign that conflicts with the P1–P8 work in `recharge/{mock,types}.ts`
    and `stack-blueprint/{pricing,factory}.ts`, and **should still be assessed on its own
    merits**; nothing here depends on it.
13. ✅ `firstMonthDiscountRate` dropped in favour of `firstMonth` / `introDiscountRate`. **(S-5)**
14. ✅ `settlement.test.ts` covers month 0, 6 and 12, so the clock fix is pinned by the
    settlement's own tests — the month-6 and month-12 cases are precisely what the frozen
    clock got wrong.
15. ✅ `CancelSaveFlow` shows the figure, its arithmetic, and names the amount on the confirm
    button; `BillingSummary` shows the standing position.

---

### Phase 3 — Charge the settlement — **NOT BUILT** *(P1; ~2 days)*

*Depends on: F-7 (Customer reuse) and legal sign-off on Phase 1's wording. Until this
ships, the settlement is calculated, disclosed and shown — but never collected.*

12. Add `chargeSettlement(customerId, amount, description)` to `lib/payments/stripe.ts` —
    invoice item + off-session invoice per S-6. **(S-3, S-6)**
13. Move cancellation server-side: a `POST /api/hub/subscription/cancel` route that
    recomputes the settlement from the stored document (never the client), snapshots it,
    charges, cancels the Stripe subscription, saves. **Cancel proceeds regardless of charge
    outcome.**
14. Implement the S-7 waivers: 14-day statutory window, price-increase notice window,
    involuntary-change follow-on, pause/snooze, £0.
15. Receipt and failed-charge emails through the existing outbox.

**Done when:** a member cancelling in month one is invoiced the un-amortised balance and
their subscription ends; a member cancelling in month twelve is charged nothing; a declined
settlement still cancels the plan and leaves a payable invoice.

---

### Phase 4 — Unblock Stripe checkout *(P0; ~half a day)* — *was Phase 1*

16. Delete the `isShopifyLive()` gates; always POST to `/api/cart`. **(F-1)**
17. Add `shipping_address_collection` to `createSubscriptionSession`. **(F-2)**
18. Pin `apiVersion`; single `DEFAULT_CURRENCY`. **(F-10)**
19. Expose `paymentsMode` on `/api/config`.

*Independent of 0–3 and can run first if you want the shop earning sooner.*

---

### Phase 5 — Close the member-driven lifecycle *(P1; ~1 day)* — *was Phase 2*

20. `cancelStripeSubscription` / `pauseStripeSubscription` / `resumeStripeSubscription`
    beside `updateSubscriptionAmount`.
21. Extract `syncBilling`'s guard-and-order logic into a shared helper; call it from the hub
    mutation path on a stored-vs-incoming diff. **(F-4b, F-4c)**
22. `invoice.payment_failed` → `past_due` + outbox template; `customer.subscription.updated`
    → mirror status. **(F-3)**
23. Populate `paymentMethod` from the real payment method. **(F-5)**

---

### Phase 6 — Money-movement correctness *(P1–P2; ~1 day)*

24. Capture payment intent / charge on `invoice.paid` so subscription refunds work; partial
    refunds. **(F-6)**
25. Stripe Customer reuse — **pull forward, Phase 3 depends on it**. **(F-7)**
26. `checkout.session.expired` → `failed`; sweeper. **(F-8)**
27. `charge.refunded` / `charge.dispute.created` reconciliation.
28. `syncBilling` failures through `changes/health.ts` with retry. **(F-14)**

---

### Phases 7–8 — Shopify removal *(P3; ~2 days)*

Unchanged from Rev 2 §5 Phases 4–5: delete the dead layer (`lib/shopify/`,
`/api/subscribe`, `Act5Bundle`, `useShopifyCart`, `/api/products`, the seed script), then
retire the types, the data-source flag, rename `lib/recharge/` → `lib/subscription/`, and
rewrite the three stale docs. **(F-13)**

---

### Phase 9 — Commercial hardening *(P2; gated on §5)*

Shipping options (F-9), Stripe Tax (F-11), minimum-term enforcement (F-12), idempotency keys
and webhook event dedupe.

---

## 4. Test plan

| Area | Tests |
|---|---|
| Subscription clock (S-2) | ✅ `clock.test.ts` + 4 webhook tests — advances on renewal, not on `subscription_create`, not twice on redelivery, once per distinct invoice |
| Cancel guard (S-1) | ✅ a `monthsActive: 0` subscription cancels; pause gates on state only |
| Settlement correctness | ✅ month-0 / 6 / 12; £0 once paid off; never negative; intro discount raises it, never lowers it; a line added but not shipped is not charged |
| Terms + consent gate (S-4) | ✅ 9 content assertions + 6 gate assertions |
| Settlement charge (S-3, S-6) | ⬜ Phase 3 — computed server-side and snapshotted; invoice raised on the customer holding the card; **cancel proceeds when the charge fails**; no invoice at £0 |
| Waivers (S-7) | ⬜ Phase 3 — 14-day window, price-increase window, involuntary follow-on, pause/snooze |
| Consent gating at the charge | ⬜ Phase 3 — `consentCoversSettlement` is built; nothing calls it yet |
| Carry-forward | F-1/F-2/F-3/F-4b/F-6/F-7/F-8 per Rev 2 §6 |
| Discount regression | `pricing.test.ts` figures byte-identical after every Shopify deletion |

---

## 5. Decisions

**D-1 · Discounts stay in our engine.** *Recommendation: yes.* Record it, so the reflex when
Stripe reporting shows gross figures isn't to "fix" it here.

**D-2 · Proration on re-price. ✅ RESOLVED** — shipped as `proration_behavior: 'none'`.
Phase 5's hub-driven sync must match.

**D-3 · VAT.** Stripe Tax or out-of-band? Blocks F-11. *The settlement is also a taxable
supply* — whatever you decide has to cover it, and Phase 3 should not ship before it does.

**D-4 · Shipping.** Charge below £50, or drop the messaging? Blocks F-9.

**D-5 · Minimum term. ✅ RESOLVED — no minimum term.** Confirmed: cancel whenever you want,
settle the outstanding balance. `minSubscriptionMonths` stays 1 and no longer gates
cancelling or pausing; the buy-out is the instrument. Raising it above 1 now only affects
copy and margin projections, and the Terms promise it will not stop anyone leaving.

**D-6 · Notice symmetry.** A supplier price rise gets 30 days' notice; a member adding a
product raises their monthly immediately. Defensible, but state the position.

**D-7 · Settlement or minimum term — not both. ✅ RESOLVED — settlement.** Implemented that
way throughout: the term guard is off both cancel and pause, and every surface that promised
a minimum term now says there isn't one.

**D-8 · NEW · Grandfathering.** Members on pre-settlement terms who never re-consent cancel
free. Accept the cost, or run a re-consent campaign with a deadline? This is a commercial
call and it determines how much the feature is actually worth in year one.

**D-9 · What is the settlement for the quiz's own product mix? — STILL OPEN, and now the
most valuable thing to do next.** With no minimum term and multi-month tubs common, a
month-one settlement can be a large fraction of the first bill — in the published example it
is £80 against £70 paid, i.e. *more than the first month itself*. A scratch-card intro
discount makes it larger still (the 50%-off case owes £115). If a typical canceller owes
more than they have paid, expect complaints and chargebacks however correct the arithmetic
is, and expect it to show up in refund rates before it shows up in revenue.

Model it across real bundles **before Phase 3 makes it chargeable**. Options if the numbers
look hostile: cap the settlement at some fraction of what has been paid, exclude the intro
discount from the shortfall, or bias bundle construction away from multi-month tubs in month
one. All three are cheaper to decide now than to retrofit after the first chargeback.
