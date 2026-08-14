# Exit settlement — pack for legal review

Everything a solicitor needs to review the exit charge, in one place. Written to be
sent as-is.

**What we are asking them to confirm:** that the settlement is enforceable as a debt for
goods supplied, that the disclosure is adequate, and that the re-consent approach is sound.

---

## 1. The commercial term, in one paragraph

Members buy a monthly subscription at a flat price. That price is the **smoothed average**
of a basket in which some items last several months — a three-month tub is charged at a
third of its price each month rather than in full on arrival. The consequence is that an
early box can contain more value than the payments so far have covered.

If a member cancels while that is true, they **settle the difference**: the retail value of
goods already dispatched to them, minus everything they have paid. They keep the goods.
There is **no minimum term and no cancellation fee** — the settlement replaces a minimum
term rather than sitting alongside one.

---

## 2. Worked example, as published

> Your plan is £70 a month: a £30 protein you get every month, and two £60 tubs that each
> last three months (£20 a month each). Your first box contains all three — £150 of product
> — and you have paid £70. The difference is £80 — but we never ask you for more than you
> have already paid us, so you would settle £70, keep everything in the box, and owe
> nothing further.

---

## 3. The four protections, all in code and all in the Terms

| | What it does | Where |
|---|---|---|
| **Cap** | Never more than the member has already paid us | `settlement.maxShareOfPaid: 1` |
| **Floor** | Balances of £5 or less are waived entirely | `settlement.minimum: 5` |
| **No clawback** | A first-month discount is never reclaimed at the exit | `settlement.reclaimIntroDiscount: false` |
| **Free-exit date** | We show the next date leaving would cost nothing, and offer it | `nextFreeExitMonth()` |

---

## 4. The four automatic waivers

Nothing is charged when any of these hold. Checked in this order, strongest first.

1. **Consent not given** — the member never accepted terms disclosing a settlement.
2. **Price-increase notice** — they are leaving inside a notice period for a rise they did
   not accept. Our own notice email says *"you can cancel free of charge any time before
   that date"*.
3. **We changed their plan** — a substitution or removal we made because a product became
   unavailable, within the last 60 days.
4. **Nothing owed** — the arithmetic came to zero, or under the £5 floor.

**Cooling-off was the fifth and is no longer a waiver at all.** It read the regulations as
"cancel within 14 days and owe nothing", which they do not say — see §4a.

---

## 4a. Inside the 14 days, the member chooses

The Consumer Contracts Regulations grant one right the rest of the year does not: **cancel
and send the goods back for a refund**. They do not grant a right to cancel, keep the goods
and pay nothing — a consumer who keeps what was sent has not returned it, and being paid
for goods kept is the trader's entitlement.

Treating cooling-off as an automatic waiver conflated the two and got it wrong in the
expensive direction. A member cancelling on day 13 kept every box and owed nothing, so the
whole month-one gap — a full signup box against one smoothed, discounted payment — was
written off in silence. Worked example from a live test: £68.80 of product sent, £46.86
charged, £21.94 written off without either figure appearing on the screen.

So `quoteExit` returns a `coolingOff` block whenever the window is open, priced on both
sides, and the cancel flow offers two buttons:

| Choice | What the member gets | What we do |
| --- | --- | --- |
| **Keep it** | Everything sent stays theirs | `mode: 'now'` — the ordinary settlement (`keepSettlement`), reached the ordinary way: intro discount, cap and £5 floor all applied |
| **Send it back** | Every payment refunded (`returnRefund`) | `mode: 'return'` — cancel, record `exit.returnRequested` + `refundDue`, email the address and deadline, and hold their orders in the fulfilment queue for whoever opens the parcel |

Four things are deliberate:

- **The refund is recorded, not paid.** Money goes back when the goods do. Refunding on the
  click would make the returns policy an honour system.
- **`coolingOff` is offered even when a waiver applies.** Being let off a balance and being
  entitled to your money back are different things; qualifying for one must not cost the
  other. When a waiver does apply, `keepSettlement` is zero like any other exit.
- **`mode: 'return'` is refused once the window closes**, rather than quietly downgraded to
  an ordinary cancellation — otherwise someone waits for a refund that was never coming.
- **The keep card shows both figures it comes from** ("we've sent you £68.80, you've paid
  £46.86"), because the settlement is only chargeable as a debt for goods rather than as a
  fee for leaving, and a bare number does not read as one.

**The published Terms were already right, and the code was the thing out of step.** The
cancellation clause says the statutory right means *"you return any unopened products for a
refund rather than settling a balance"* — return OR settle, never keep-and-pay-nothing — and
the three settle-nothing cases it lists are the price-increase notice, a change we made
ourselves, and payments having covered everything. Cooling-off is not among them. So this
brings the code back to what members have already been shown and consented to, and
`SETTLEMENT_TERMS_VERSION` does **not** need moving: nobody is being held to wording they
did not accept.

**Opened supplements are not refunded.** The Terms say *"for hygiene reasons we cannot
refund opened supplements unless they are faulty"*, and that is now what the code does.
The consequence is that the refund cannot be a fixed number at cancellation, because what
is opened is not knowable until the parcel is:

- `coolingOff.returnRefund` is a **ceiling** — everything they paid, refunded in full only
  if the whole box comes back unopened. Quoted as "up to" everywhere it appears: the flow,
  the confirmation, the email and the queue note.
- `refundForReturned(quote, returnedValue)` prices what actually arrives. Proportional to
  VALUE, not to item count: the member paid less than the goods are worth, so refunding
  retail would hand back more than was ever taken, and a flat per-item share would price a
  returned £60 tub the same as a returned sachet. Clamped so it can never exceed what was
  paid.
- `exit.refundDue` holds the ceiling; `exit.refundPaid` and `exit.returnRefundedAt` are set
  by whoever opens the parcel. They are deliberately separate fields — conflating them would
  turn "up to £46.86" into a promise made before anyone had looked in the box.
- Faulty or damaged goods are refunded whether opened or not, and we cover the postage. The
  flow and the email both say so, and both ask the member to tell us *before* posting.

**Still open:** nothing yet processes the refund. The return is recorded, the member is
emailed, and their orders are held in the fulfilment queue with the ceiling and the rule on
the note — but paying out is a manual Stripe action today, and `refundPaid` is written by
hand. A returns screen in the Founders Hub is the obvious next step.

Return postage sits with the member unless the goods arrived damaged or wrong, which is the
statutory default and is stated in both the flow and the email. Diminished value on goods that come back opened does not arise as a separate question: an
opened supplement is not refunded at all unless it was faulty, so there is nothing to
deduct from.

---

## 4b. The intro discount is never reclaimed — on both paths

`settlement.reclaimIntroDiscount` is `false`, and for a while only one of the two
arithmetics honoured it:

- **Forecast** (`cancelSettlement`) measures shipped goods against `settlementBasisOf` —
  what the plan COSTS over the months lived, at the full monthly. Correct.
- **Ledger** (`exitStatement`), which is what actually bills, measured against `paidTotal` —
  what the card was CHARGED, i.e. after the discount. So the discount fell into the balance
  and was billed back at the exit, to precisely the people most likely to dispute it.

The two disagreed by exactly the discount, which is what `ledgerDivergence` had been
reporting to a founder-only field that nothing acted on.

`introDiscountKeptOf(sub, config)` now computes it — `settlementBasisOf − paidToDateOf` —
and `quoteExit` hands it to the ledger, which subtracts it **before** the cap (applying it
after would let the cap bite on money we had already decided not to ask for) and reports it
as `introKept`. The exit statement shows it as its own line, *"Intro offer — not reclaimed:
−£5.32"*, which is what `settlementBasisOf`'s own docs always said the split was for.

On the worked example: £21.94 raw gap, less £5.32 kept, **£16.62 to settle**.

---

## 5. Disclosure — where and when

- **At checkout**, in `CHECKOUT_BILLING_POINTS`, above the consent box and before payment.
  Deliberately not only in the Terms.
- **In the Terms**, §"Cancelling, and settling what we have already sent you", with the
  worked example above.
- **In the hub**, on the billing summary, as an indicative figure at all times.
- **At the exit**, itemised: every box with its contents, every payment, both totals, the
  cap and waiver as their own lines, and the balance — before anything is confirmed.

---

## 6. THE QUESTION WE MOST WANT ANSWERED

`SETTLEMENT_TERMS_VERSION` moved from `2026-08-03` to `2026-08-12`. Three of the four
changes are **concessions** — the cap, the £5 floor, and no clawback of the intro discount.
The fourth is a **correction**, and it is the one to look at:

> **Was:** *"It goes down every month as your payments catch up with what was sent, and it
> reaches zero — nothing at all to pay — as soon as they do."*
>
> **Now:** *"It falls every month as your payments catch up with what was sent, and reaches
> zero when they do — but it rises again each time a new multi-month item arrives, because
> that item has only just started being paid for. So there is a regular point in your plan,
> usually a month or two away, where leaving costs nothing at all."*

The old wording described half a curve. The balance is a **sawtooth**: it returns to zero
once per delivery cadence and climbs again on the next multi-month dispatch, for the life
of the plan. A member three years in can still owe a full dispatch if they cancel the day
after a tub ships.

**Our position:** because the omission is material and not in the member's favour, we have
moved the consent gate with it — members who accepted the old wording are **not charged**
until they accept the new. We would like this confirmed as the right call, and the new
wording confirmed as adequate.

---

## 7. Re-consent

- Members on pre-settlement terms **exit free**, enforced in code
  (`consentCoversSettlement`), not by policy.
- The in-hub notice is **dismissible and non-blocking**. Declining changes nothing and no
  service is withheld.
- The notice states the new term, the cap, the floor, and explicitly that they may decline.
- Consent is validated against the documents the server is serving, never against what the
  client submits, and recorded with IP and user agent.

**To confirm:** that a dismissible in-app notice plus email is adequate to vary terms for a
continuing subscription, and that our fallback — the member stays on the old terms
indefinitely — is sound.

---

## 8. VAT

We are **not currently VAT-registered** (`vat.registered: false`), so settlement invoices
carry no VAT line (`settlement.chargeVat: false`).

**To confirm:** on registration, whether a balance settled *after* the registration date on
goods delivered *before* it carries VAT. The flag is deliberately separate from
`vat.registered` so this is answered by a person rather than by a boolean flipping.

---

## 9. Other things worth an opinion

- Settlements are charged **off-session** to the saved card as a Stripe invoice. A decline
  leaves an **open invoice** the member can pay; **the cancellation always proceeds**.
- We compute the figure server-side from our own records of what shipped and what was
  charged, never from anything the browser supplies.
- Every exit is **snapshotted** — the itemised statement, the source, the waiver, the
  invoice — so the figure can be explained later without re-deriving it.
- Where a member has **overpaid**, we say so and refund; we do not keep it.

---

## 10. Source

| Thing | File |
|---|---|
| Terms text | `src/lib/legal/content.ts` |
| Consent gate | `src/lib/legal/consent.ts` |
| Re-consent campaign | `src/lib/legal/campaign.ts` |
| Waivers + the decision | `src/lib/recharge/exit.ts` |
| The statement | `src/lib/recharge/exit-ledger.ts` |
| Policies | `PRICING_CONFIG.settlement` |
| Modelling behind the policies | `docs/EXIT_JOURNEY_PROPOSAL.md` §9 |
