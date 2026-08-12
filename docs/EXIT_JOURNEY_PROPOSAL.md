# The exit journey — proposal

How a member leaves, and settles what they owe for goods already sent.

This builds on `STRIPE_INTEGRATION_PLAN.md`, which specified this as **Phase 3** and
deliberately stopped short of building it. That plan is still right about the shape. This
document is what a fresh scan of the code adds: **four things that have to be fixed before
a single settlement can be charged**, an architecture that makes the figure defensible
under the scenarios you named, and the exit options themselves.

Nothing here is built yet. This is for a decision.

---

## 1. Where we actually are

The maths, the law and the screen already exist:

| Piece | State |
|---|---|
| `cancelSettlement(sub)` — the arithmetic | ✅ built, tested (9 cases) |
| The subscription clock (`monthsActive`, `deliveriesMade`) | ✅ built |
| Terms disclose it; checkout discloses it | ✅ built |
| `consentCoversSettlement()` — the gate | ⚠️ built, **never called** |
| `CancelSaveFlow` shows the figure and its arithmetic | ✅ built |
| The button says *"Confirm — pay £80 and cancel"* | ✅ built |
| **Anything that charges it** | ❌ nothing |
| **Anything that computes it server-side** | ❌ nothing |

That last pair is the honest summary. Today a member sees a promise to charge them,
presses the button, and the subscription cancels for free — the figure is computed **in the
browser**, from a document the client holds, and the cancel route takes that same
client-supplied document and diffs it.

---

## 2. Four things that must be fixed first

These are new findings, not in the Phase 3 spec. The first is a blocker on the whole
premise.

### E-1 · Fulfilment ignores delivery cadence — so the premise isn't true yet

The settlement exists because a 3-month tub **ships once and is paid for over three
months**. `deliveriesMadeFor()` models exactly that: `floor(cycles / interval) + 1`.

But the only thing that raises a fulfilment order is the `invoice.paid` webhook, and it
calls `subscriptionOrderLines()`, which maps **every line, every month**, at full quantity
(`src/lib/orders/service.ts:144`). Nothing filters on `deliveryIntervalMonths`. Nothing
else raises dispatch orders — the daily cron doesn't.

So today, a member on a 3-month tub is sent that tub **every month**. Either:

- that is a live over-shipping bug costing roughly 2× the goods on every multi-month line
  (my reading — the concept is honoured everywhere else, including the order-confirmation
  delivery estimates); or
- cadence isn't real and the smoothing story is wrong, in which case the settlement is
  understated by a very long way.

Either way **the settlement cannot be charged until dispatch matches the model it bills
against.** You cannot invoice someone for "goods shipped ahead of payment" while the
shipping logic disagrees with the billing logic about what shipped.

### E-2 · The settlement re-prices history at today's prices

This is the scenario you named, and it is the most consequential.

```
paidToDateOf(sub)     = firstMonth + monthsActive × sub.flatMonthly
shippedValueToDate(l) = l.deliveriesMade × l.pricePerDelivery
```

Both use the **current** figure for **every historic month**. `flatMonthly` moves —
supplier price rises, swaps, adds, removals, all of which write a `BillingChange` to
`billingHistory`. `pricePerDelivery` moves for the same reasons.

A member who paid £30/month for four months, then went to £40 after a supplier rise, and
cancels in month six has actually paid `firstMonth + 4×30 + 2×40`. The formula says
`firstMonth + 6×40` — **overstating what they paid by £40, and understating the settlement
by the same**. A price *decrease* errs the other way and overcharges them, which is the
direction that produces a complaint.

The same applies to a member who added a product in month five: their whole history gets
re-priced at the bigger monthly.

### E-3 · Skipped deliveries are billed as shipped

`skipNextDelivery()` pushes the ship date out and banks a credit, but
`deliveriesMadeFor()` derives purely from `monthsActive` and cadence. A skipped box still
counts as delivered, so the settlement charges for a parcel that never left.

`skippedDeliveryCount()` exists and is used by `monthsRemainingOnTerm` — it just isn't in
the settlement path.

### E-4 · The consent gate is never enforced

`consentCoversSettlement(userId)` is the thing that stops us charging a balance to someone
who signed up under the old "no fee" terms. It is written, tested, documented as *"the gate
for ever charging one"* — and called by nothing outside its own test file.

---

## 3. The architecture change: settle from the ledger, not from the model

Fixing E-2 by reconstructing history from `billingHistory` is possible and fragile —
`BillingChange` records `effectiveFrom` as a date, and mapping dates back onto billing
cycles is exactly the kind of arithmetic that is wrong in a leap year and nobody notices.

**We already have two durable, authoritative ledgers.**

| Question | Ledger | Why it is authoritative |
|---|---|---|
| What did they pay? | Stripe invoices for the subscription | It is what their card was actually charged |
| What did we send? | `Order` rows, `channel: 'subscription'` | Each is keyed `ord_inv_<invoiceId>`, carries `lines[].unitPrice` **snapshotted at the time**, and carries the fulfilment status |

So:

```
settlement = Σ(shipped orders · line prices as recorded)
           − Σ(paid invoices)
```

This is immune to every scenario in E-2 and E-3 by construction. A price rise doesn't
re-price the past, because the past is a row. A skipped delivery doesn't count, because no
order shipped it. A pause doesn't count, because no invoice was raised. A refunded order
subtracts itself. It also gives the member an itemised statement instead of a formula —
*"these six boxes, these five payments, this difference"* — which is worth more than the
arithmetic being right, because it is the difference between a number they accept and a
number they dispute.

`cancelSettlement()` stays, as the **forecast** — what the hub shows as "what it would cost
to leave today" while the plan is running. The ledger figure is what gets charged. They
should agree; a divergence beyond a pound is a bug worth alerting on, and that check is
cheap to build.

> **Dependency:** this only works once orders reflect real dispatch (E-1) and only for
> orders raised *after* that fix. Members mid-flight at the time need the model figure, or
> a migration that back-fills dispatch history. See §8.

---

## 4. Exit options — you asked whether different ones are possible

Yes, and one of them is materially kinder than the others. All four are offered from the
same screen, with the settlement figure shown first.

### Option A — **Settle and go** *(the default)*
Pay the balance now, subscription ends today, nothing else ships. One Stripe charge against
the card on file.

### Option B — **Pay it off, then stop** *(recommended to offer)*
Nothing more ships. The monthly keeps running until the balance clears, then the
subscription cancels **automatically**. No money today.

This is the honest one, because it is *exactly what the smoothing already promised*: they
agreed to pay for those goods over N months, and this is them finishing that. It converts a
scary £80 demand into "two more payments and you're done", it needs no new payment method,
and it is far more likely to be paid than an off-session charge on a card that may decline.
Mechanically: stop dispatch, keep the Stripe subscription billing, cancel when
`paidToDate ≥ shippedValue`.

### Option C — **Send it back**
For unopened goods inside the 14-day statutory window, the settlement is reduced by the
value of what comes back. This is a legal right, not a favour, and refusing it is what makes
a settlement look like a penalty. It is also the option most likely to be *asked for*
whether or not we build it, so it needs at least a manual path in the portal from day one.

### Option D — **Don't leave** *(exists)*
Pause, snooze, downsize, swap — `CancelSaveFlow` already offers these and they already
work. They stay in front of the settlement, not behind it.

**Not recommended: instalments as a separate option.** Option B already is one, using
machinery that exists. A bespoke payment plan means dunning, and dunning on a departing
customer is a bad place to be.

---

## 5. The journey

Entry: `/myhub` → Plan → **Manage subscription** → *Cancel subscription* (where
`CancelSaveFlow` lives today). Also reachable from the billing summary, which already shows
the balance.

```
1. Why are you leaving?          → existing reason capture
2. Would this help instead?      → existing saves (pause / downsize / swap / skip)
3. Here's where you stand        → NEW: the itemised statement
                                    what we sent · what you paid · the difference
4. How would you like to leave?  → NEW: options A / B / C
5. Confirm                       → NEW: server recomputes, charges, cancels
6. Done                          → receipt, and what happens to the last box
```

Step 3 is the one that decides whether this feels fair. It should be a **statement, not a
formula**: every box with its date and price, every payment with its date, the difference
at the bottom. The current screen shows `shippedValue − paidToDate = settlement`, which is
correct and reads like an assertion. A statement reads like evidence.

Step 5 must recompute server-side and **charge what the server calculated**, never what the
client displayed. If the two differ, show the new figure and make them confirm again.

---

## 6. Stripe

Per the existing spec (S-6), and it still looks right:

- **Invoice item + invoice**, not a bare PaymentIntent. It produces a real invoice the
  member can see in the billing portal, it is the right object for a taxable supply, and it
  survives a decline as a **payable invoice** rather than vanishing.
- **Off-session** against the saved payment method.
- **Cancel proceeds regardless of the charge outcome.** A failed settlement leaves an open
  invoice and a cancelled plan. Holding someone's cancellation hostage to a card decline is
  the single worst thing this feature could do, and the terms already promise otherwise.
- Idempotency keyed on `subscriptionId + monthsActive`, so a double-submit cannot
  double-charge.
- Option B needs no new Stripe object: keep the subscription, suppress dispatch, cancel on
  a threshold check in the `invoice.paid` handler.

**Open: VAT.** D-3 in the existing plan, still unresolved, and it blocks this. The
settlement is a taxable supply. Right now we are not VAT-registered
(`vat.registered: false`), so the practical answer today is "no VAT line" — but that has to
be a stated decision, because it changes the moment registration happens and a settlement
invoice is exactly the document HMRC would want to see it on.

---

## 7. Founders portal

Nothing exists for this today — `SubscriptionDetail` has no settlement anywhere.

- **Subscription detail** — current balance, the statement behind it, and its history.
- **Exit queue** — cancellations with an unpaid settlement, worked like the fulfilment
  queue: chase, waive, or write off. A waiver is a button with a reason and an audit line,
  because it will be used and it should not be a database edit.
- **Commerce → Financials** — settlements billed, collected, waived, written off. Without
  this the feature's actual value is invisible.
- **Waivers must be first-class**, not exceptional. §8 lists five cases where we should
  waive automatically; a founder will find a sixth in week one.

---

## 8. Scenarios, and what each does

| Scenario | Settlement | Why |
|---|---|---|
| Cancel month 1, three-month tubs shipped | Full balance | The case the feature exists for |
| Cancel month 12, everything amortised | £0 | Payments caught up |
| Intro discount (scratch card) taken | **Larger** | They paid less, so they owe more — see D-9 below |
| Price *rose* mid-life | Ledger handles it | Historic months at historic prices |
| Price *fell* mid-life | Ledger handles it | Ditto — this is the one that overcharges today |
| Product added in month 5 | Ledger handles it | `joinedAtMonth` already keeps it from being credited with earlier boxes |
| **We** substituted or removed a line | **Waived** for that line | Already the rule (`changes/apply.ts`) — do not regress it |
| Supplier price rise they didn't accept | **Waived** | They are leaving because we changed the deal |
| Within 14 days of signup | **Waived / returns** | Statutory |
| Paused or snoozed | Neither counts | No invoice, no dispatch |
| Skipped a delivery | Not counted | Once E-3 is fixed |
| Member on pre-settlement terms | **£0, free exit** | The consent gate (E-4) — D-8 |
| Member has *overpaid* | **£0 today; owed a refund** | See below |
| Involuntary cancel (we exit them) | £0 | Never charge for our own decision |

**Overpayment is currently invisible.** `cancelSettlement` is `max(0, …)` and stops there.
`lineOverpayment()` exists as the per-line mirror but there is no whole-subscription
equivalent and nothing surfaces it. A member who paused a lot, or skipped, or whose plan was
downsized, can genuinely be *owed* money at exit. Charging fairly in one direction and
silently keeping the difference in the other is the fastest way to lose the argument that
this is a debt for goods rather than a fee. **Recommend: compute and refund it.**

---

## 9. D-9 — MODELLED. Two things have to change before this is chargeable

*Run over 12 real personas through the real engine (`buildStackBlueprint` →
`buildMemberSubscription`), at four intro-discount rates, across 15 months.
`src/lib/recharge/exit-model.ts`, pinned by `exit-model.test.ts`.*

### Finding 1 — the balance is a **sawtooth**, not a debt that runs down

A typical plan (`perf-bulking-balanced`, £54.94/mo):

```
month   0      1     2      3      4     5      6      7     8
owed  £11.33 £5.67 £0.01 £11.34 £5.68 £0.02 £11.35 £5.69 £0.03
```

It returns to ~zero **once per cadence** and jumps again on the next dispatch —
forever. A member three years in still owes a full dispatch if they cancel the
day after a tub ships.

So the framing in the code — *"it reaches 0 as soon as their payments cover what
was sent"* — is wrong, or at least badly incomplete. It reaches zero
**periodically**. That is economically right (you are holding a tub you have not
finished paying for) but it changes the product:

> **There is always a date, usually one or two months away, when leaving is free.
> Show it.** "Cancel now for £11.33, or on 14 March for nothing" turns a demand
> into a choice, costs us the difference only from members who won't wait, and
> pairs exactly with Option B.

I'd make that the headline of the exit screen, not a footnote.

### Finding 2 — an intro discount is **never amortised**

This is the one that would have caused real damage. The scratch card reduces what
they paid without reducing what we sent, so it lifts the **entire sawtooth
permanently**. The undiscounted plan touches £0 every third month; the 50%-card
version never touches zero at all, at any point in the plan's life.

| Persona | monthly | m0 owed, no card | m0 owed, 50% card | ratio to paid |
|---|---|---|---|---|
| perf-bulking-balanced | £54.94 | £11.33 (0.21×) | £38.80 | **1.41×** |
| perf-muscle-complete | £87.69 | £18.65 (0.21×) | £62.49 | **1.43×** |
| well-immune-focus | £24.78 | £14.34 (0.58×) | £26.73 | **2.16×** |
| well-health-under30 | £10.00 | £14.34 (1.43×) | £19.34 | **3.87×** |

Across all 48 persona × rate combinations, the balance exceeds everything the
member has ever paid in **15 cases — and 12 of those are the 50% card**. Without
any card it happens once in twelve.

**Recommendation: exclude the intro discount from the shortfall.** Settle against
what the plan costs, not what the card reduced month one to. It drops
`perf-bulking` from £38.80 (1.41×) to £11.33 (0.21×) and restores the free-exit
month. The discount was a marketing cost we chose to bear; reclaiming it at the
exit is charging it back to precisely the people most likely to dispute it — and
it makes the scratch card, our best conversion tool, into a debt instrument.

### Finding 3 — capping at what they have paid is nearly free

Modelled at 1.0×: **£0.00** written off across 15 exit months on `perf-bulking`
and `well-immune-focus`, **£4.34** on the £10/month plan. It only ever bites
where the balance would otherwise exceed everything they have paid — which, with
Finding 2 fixed, is a handful of very small plans.

**Recommendation: adopt it as a belt-and-braces cap.** It costs almost nothing
and it makes "you owe more than you have ever paid us" structurally impossible.

### Together

With both levers, the worst case across every persona and rate falls to well
under 1× paid, every plan keeps a periodic free-exit month, and the sawtooth
becomes explainable in one sentence: *you are settling the box you are holding.*

> Footnote worth chasing separately: `well-health-under30` builds a £10.00/month
> plan while `minSubscriptionMonthly` is £25, so that plan should not be sellable
> at all. Either the floor is not enforced on this path or the persona is
> unreachable — it does not affect the exit work, but it is the sort of thing
> that turns up as a real order.

---

## 9b. What the original D-9 warning got right

The existing plan said:

> a month-one settlement can be a large fraction of the first bill — in the published
> example it is **£80 against £70 paid**. A scratch-card intro discount makes it larger
> still (the 50%-off case owes £115).

The instinct was right and the emphasis was slightly off. On the plans the quiz actually
builds, the **undiscounted** settlement is modest — 0.11× to 0.58× of what has been paid in
eleven of twelve personas. It is the **scratch card** that makes it hostile, and it does so
permanently rather than only in month one. The two levers adopted above deal with it; the
third option the plan floated — biasing bundles away from multi-month tubs — is not needed
and would cost margin for nothing.

---

## 10. Phasing

| # | Work | Size |
|---|---|---|
| ~~0~~ | ~~Model D-9 across real bundles~~ — **done**, §9. Two levers adopted. | ✅ |
| **1** | **Fix E-1** — dispatch respects cadence. Blocker, and a live fulfilment bug regardless of this feature. | ~1 day |
| **2** | Ledger-based settlement (§3) + E-3 skips + overpayment. Pure functions, heavily tested. | ~2 days |
| **3** | Server-side cancel route: recompute, enforce consent (E-4), snapshot, charge, cancel. Stripe invoice + waiver rules. | ~2 days |
| **4** | The member journey — statement, options A/B/C, receipt. | ~2 days |
| **5** | Founders portal — balance, exit queue, waivers, financials. | ~1.5 days |
| **6** | Emails: statement, receipt, failed charge, Option B progress. | ~0.5 day |

**~10 days**, with phases 0 and 1 as hard gates. Phases 2–6 are shippable behind the
existing `PAYMENTS_SOURCE` switch, so this can be walked in simulate mode exactly like the
supplier integration was.

---

## 11. Decisions — all confirmed

| # | Decision | Answer |
|---|---|---|
| 1 | E-1 — dispatch should respect cadence | **Bug. Fix it.** |
| 2 | Option B — pay it off, then stop | **Offer it** |
| 3 | Overpayments | **Refund them** |
| 4 | D-8 grandfathering | **Run a re-consent campaign with a deadline** |
| 5 | D-3 VAT | **No VAT line while unregistered — stated position** |
| 6 | D-9 modelling before building | **Done — §9** |

Two further calls follow from the modelling and are taken as adopted unless overruled:

| # | Decision | Position |
|---|---|---|
| 7 | Intro discount in the shortfall | **Excluded.** It is a marketing cost, not a loan |
| 8 | Cap on the settlement | **1.0× what they have paid.** Costs ~nothing; makes "you owe more than you have paid" impossible |

And one thing the modelling turned up that changes the product rather than the maths:

| # | Decision | Position |
|---|---|---|
| 9 | Show the next free-exit date | **Yes — headline it.** The balance is a sawtooth with a £0 month every cadence, so almost every member is 1–2 months from leaving free |

### Also now in scope, from decision 4

A **re-consent campaign** is its own piece of work — an in-hub notice, a deadline, a
reminder email, and a report of who has and hasn't accepted. It gates how much of the
member base this feature can ever apply to, so it wants starting early rather than last.
Roughly a day, and it can run in parallel with phases 1–2.
