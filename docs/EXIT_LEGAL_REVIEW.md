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

## 4. The five automatic waivers

Nothing is charged when any of these hold. Checked in this order, strongest first.

1. **Consent not given** — the member never accepted terms disclosing a settlement.
2. **Cooling-off** — within 14 days of the **first delivery** (Consumer Contracts
   Regulations 2013). We run it from delivery, not from signup.
3. **Price-increase notice** — they are leaving inside a notice period for a rise they did
   not accept. Our own notice email says *"you can cancel free of charge any time before
   that date"*.
4. **We changed their plan** — a substitution or removal we made because a product became
   unavailable, within the last 60 days.
5. **Nothing owed** — the arithmetic came to zero, or under the £5 floor.

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
