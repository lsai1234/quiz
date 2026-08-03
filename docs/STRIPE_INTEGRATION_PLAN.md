# Stripe integration — architecture scan & phased plan

Status: **scan complete, plan proposed.** No application code has been changed by this
document.

- **Rev 3** — rescanned at `master` @ `a3051e5`, focused on the **cancel buy-out /
  outstanding-balance** requirement. Baseline: 66 suites / 899 tests passing.
- Rev 2 — after the P1–P8 product-changes / consent / notifications track.
- Rev 1 — initial scan at `a4c1154`.

> **Where the settlement work actually is.** Nothing has landed on `master` since Rev 2 —
> it is still `a3051e5` (29 Jul), tree clean. The cancel buy-out lives on an **unmerged**
> branch, `claude/supplement-quiz-audit-algeoo` @ `d3e668e` ("Cancel buy-out:
> pay-for-what-shipped settlement on early cancel"), which also carries a 12-commit quiz
> redesign (~3,700 insertions). Master already has the *per-line* settlement
> (`lineSettlement`, returned by `removeLine`); the branch adds the *whole-subscription*
> one (`cancelSettlement`).
>
> **The formula is right. Everything around it is not.** Rev 3's headline is that the
> settlement cannot be charged until three things underneath it are fixed — and two of
> them are live bugs affecting members today, independent of Stripe.

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
| `shippedValueOf(sub)` / `paidToDateOf(sub)` | branch | unmerged |
| `cancelSettlement(sub)` | branch | unmerged |
| `firstMonthDiscountRate` | branch, `types.ts` | unmerged — **collides**, see S-5 |
| Display in `BillingImpact` / `LineManageSheet` | master | ✅ shown to the member |
| Display in `CancelSaveFlow` | branch | unmerged |
| **Anything that charges it** | — | ❌ **does not exist** |

### 1.2 Findings

---

**S-1 · P0 · Cancel is a silent no-op for every real paying member.**

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

This is a P0 on its own, before any settlement work. It also directly contradicts the
Terms the member consented to: *"After any minimum term you can cancel whenever you like
from your account, with no fee and no phone call"* (`legal/content.ts:188`), with
`minMonths: 1` meaning there is no minimum term.

---

**S-2 · P0 · The settlement's two inputs are never advanced, so the number is only correct
in month zero.**

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

**This is the dependency that makes the rest of the work coherent.** Stripe's invoice stream
is the natural source of truth for "months actually paid": `invoice.paid` already fires for
the first box and every renewal, and already raises a fulfilment order. Advancing
`monthsActive` there, and `deliveriesMade` when a fulfilment order is raised for a line,
makes the settlement correct by construction. **The settlement cannot be charged until this
is done.**

---

**S-3 · P1 · The settlement is computed and displayed, but never charged — and there is no
primitive that could charge it.**

`lineSettlement` reaches `BillingImpact` ("Settlement (already-shipped box)") and
`LineManageSheet`; `cancelSettlement` reaches `CancelSaveFlow` on the branch. All display.
Cancel and remove both run as **pure client-side mutations** → `persist()` →
`PUT /api/hub/subscription`, which saves the document and returns.

So today the member is *shown* a settlement figure and then not charged it. That is the
worse of the two failure modes: it reads as a fee they agreed to and never paid.

`lib/payments/stripe.ts` exposes only hosted **Checkout Sessions** (redirect-based),
`updateSubscriptionAmount`, the billing portal, and `refundPayment`. There is **no
off-session charge primitive** — and a redirect-to-Checkout is the wrong tool for a cancel
settlement, because the member can simply close the tab and walk away with both the goods
and the cancellation.

---

**S-4 · P0 · The Terms the member consented to promise cancellation with no fee.**

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

**This is a legal-sequencing blocker, not a technical one, and it gates the whole feature.**
I would get the wording reviewed before building the charge path.

---

**S-5 · P2 · The branch introduces a duplicate discount field.**

The branch adds `MemberSubscription.firstMonthDiscountRate` ("the first-month intro discount
actually applied at signup"). Master already has `introDiscountRate` — *"the first-month
intro discount (0–1) the member claimed at checkout … this is the granted rate, not the one
the browser asked for"* — plus `firstMonth` (the amount actually billed).

These are the same concept. On merge, drop `firstMonthDiscountRate` and read
`introDiscountRate`; `paidToDateOf` gets the value it needs with no new field. Two fields
that must agree, in the input to a charge, is exactly where a silent money bug lives.

---

**S-6 · P1 · Choosing how to collect it.**

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

**S-7 · P1 · Edge cases the charge path has to answer.**

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

### Phase 0 — Make the subscription clock real *(P0; ~1 day)*

*Depends on: nothing. Fixes live bugs. **Prerequisite for any settlement work.***

1. Advance `monthsActive` on `invoice.paid` (Stripe's invoice stream is the source of truth
   for months paid); advance `deliveriesMade` per line when a fulfilment order is raised.
   Both idempotent, keyed off the invoice id as `createSubscriptionOrder` already is. **(S-2)**
2. In mock mode, advance the same fields from the mock subscription-order path so the two
   modes stay behaviourally identical.
3. Fix `canCancel` so a real member can cancel: with `minMonths: 1` and a correct
   `monthsActive` this resolves itself, but add a regression test asserting a
   **freshly-checked-out** subscription (`monthsActive: 0`) can cancel — the current demo
   seed's `monthsActive: 2` hides exactly this. **(S-1, F-12)**
4. Make `cancelSubscription` and `pauseSubscription` report refusal instead of silently
   returning the input, so a blocked mutation can never again look like success.

**Done when:** a member who checked out today can cancel and pause; `monthsActive` and
`deliveriesMade` advance with real invoices; `cancelSettlement` returns £0 for a member who
has paid off everything shipped, at any month.

---

### Phase 1 — Terms, consent, and disclosure *(P0; legal-led)*

*Depends on: 0 conceptually. Gates Phase 3. **Not a coding phase.***

5. Draft the settlement into the Terms as *paying the balance for goods already delivered*,
   with a worked example. Get it reviewed. **(S-4)**
6. Surface it at checkout beside the flat-monthly explanation, and in the hub's billing
   explainer. `CheckoutConsent` and `portal/pricing` already have the right slots.
7. Bump `TERMS_VERSION`; re-consent existing members via the notification outbox.
8. Gate the charge on consent version: only settle subscriptions whose consent row carries
   the settlement terms. Members on older terms cancel free — accept that cost.

---

### Phase 2 — Merge the settlement branch *(P2; ~half a day + conflict work)*

*Depends on: 0.*

9. Cherry-pick `d3e668e` (`cancelSettlement`, `shippedValueOf`, `paidToDateOf`, the tests)
   off `claude/supplement-quiz-audit-algeoo`. **Do not merge the whole branch** — the other
   11 commits are a quiz redesign that conflicts with the P1–P8 work in
   `recharge/mock.ts`, `recharge/types.ts`, `stack-blueprint/{pricing,factory}.ts`, and
   should be assessed on its own merits.
10. Drop `firstMonthDiscountRate`; read master's `introDiscountRate`. **(S-5)**
11. Extend `settlement.test.ts` with the month-6 and month-12 cases that S-2 currently gets
    wrong, so the clock fix is pinned by the settlement's own tests.

---

### Phase 3 — Charge the settlement *(P1; ~2 days)*

*Depends on: 0, 1, 2, and F-7. Live impact: money moves on cancel.*

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
| Subscription clock (S-2) | `monthsActive` advances on `invoice.paid`, idempotent on redelivery; `deliveriesMade` advances per line and survives a substitution |
| Cancel guard (S-1) | a `monthsActive: 0` subscription can cancel and pause; a refused mutation reports refusal rather than returning the input |
| Settlement correctness | the month-0 / month-6 / month-12 table in S-2; £0 once paid off; intro discount raises the settlement, never lowers it |
| Settlement charge (S-3, S-6) | computed server-side and snapshotted; invoice raised on the customer holding the card; **cancel proceeds when the charge fails**; no invoice at £0 |
| Waivers (S-7) | 14-day window, price-increase window, involuntary follow-on, pause/snooze |
| Consent gating (S-4) | a subscription on pre-settlement terms is never charged |
| Carry-forward | F-1/F-2/F-3/F-4b/F-6/F-7/F-8 per Rev 2 §6 |
| Discount regression | `pricing.test.ts` figures byte-identical after every Shopify deletion |

---

## 5. Decisions

**D-1 · Discounts stay in our engine.** *Recommendation: yes.* Record it, so the reflex when
Stripe reporting shows gross figures isn't to "fix" it here.

**D-2 · Proration on re-price. ✅ RESOLVED** — shipped as `proration_behavior: 'none'`.
Phase 5's hub-driven sync must match.

**D-3 · VAT.** Stripe Tax or out-of-band? Blocks F-11. *Note the settlement is also a taxable
supply* — whatever you decide has to cover it.

**D-4 · Shipping.** Charge below £50, or drop the messaging? Blocks F-9.

**D-5 · Minimum term.** Keep `minSubscriptionMonths: 1`? The settlement is arguably a
*better* instrument than a minimum term — it recovers exactly what is owed instead of binding
the member — so keeping 1 and relying on the buy-out is the more defensible position, and
the easier one to sell.

**D-6 · Notice symmetry.** A supplier price rise gets 30 days' notice; a member adding a
product raises their monthly immediately. Defensible, but state the position.

**D-7 · NEW · Settlement or minimum term — not both.** Charging a buy-out *and* enforcing a
minimum term would be double-counting, and would read as punitive. Pick one. My
recommendation is the buy-out, per D-5.

**D-8 · NEW · Grandfathering.** Members on pre-settlement terms who never re-consent cancel
free. Accept the cost, or run a re-consent campaign with a deadline? This is a commercial
call and it determines how much the feature is actually worth in year one.

**D-9 · NEW · What is the settlement for the quiz's own product mix?** Worth modelling before
committing: with `minSubscriptionMonths: 1` and multi-month tubs common, the month-one
settlement could be a large fraction of the first month's bill. If a typical canceller owes
more than they have paid, expect complaints and chargebacks regardless of how correct the
maths is. Run the numbers across real bundles before Phase 1's wording is drafted.
