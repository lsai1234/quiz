# Influencer partner programme — proposal

**Status: proposal, nothing built.** Numbers below come from the live pricing
model (`lib/pricing/*`), not from assumption — a representative 3-product quiz
stack, £30 wholesale, 2.5kg, at the model's own recommended price of £103.26,
with the business **not yet VAT-registered** (today's setting).

---

## 1. The recommendation, in one page

| | |
| --- | --- |
| **Model** | Percentage of **net revenue** (ex VAT, ex delivery) |
| **First order** | **20%** |
| **Renewals** | **10%**, for 12 months from signup |
| **Follower offer** | A fixed **30% first month**, which **replaces** the scratch card rather than stacking |
| **Attribution** | **Discount code first**, referral link as a convenience. 30-day last-click cookie |
| **Qualification** | Accrues on order, confirms after the 14-day return window, reverses on refund |
| **Hard guard** | Commission is floored so it can never push an order below a set contribution margin |
| **Payout** | Monthly in arrears, £25 minimum, self-billed |

Blended over a six-month subscriber this is **11.3% of net revenue** — the
headline 20% is only ever paid on one order.

### Why this shape

A subscription business should pay for **subscribers**, not for clicks. A split
rate does three things a flat rate can't: the 20% headline competes for
attention against every other programme an influencer is offered, the 10% tail
makes them care whether the traffic they send actually stays, and the two
together cost us less than a flat rate worth the same to them.

---

## 2. What it costs — the real numbers

At the model's recommended £103.26 for a representative stack:

| Scenario | Member pays | Contribution | Margin |
| --- | --- | --- | --- |
| Bought once | £103.26 | £61.39 | 59.5% |
| Typical subscriber | £82.61 | £41.05 | 49.7% |
| **Worst case** (biggest bundle + intro offer, cancels immediately) | £63.50 | £22.23 | **35.0%** |

**The clean rule: because margin is measured on net revenue, X% commission on
net revenue costs exactly X points of margin.** Every scenario, no exceptions.
That is the whole affordability question in one sentence.

| Commission | Worst case margin after | Typical subscriber after |
| --- | --- | --- |
| 5% | 30.0% | 44.7% |
| 10% | 25.0% | 39.7% |
| 15% | 20.0% | 34.7% |
| **20%** | **15.0%** | 29.7% |
| 25% | 10.0% | 24.7% |

So 20% on the first order leaves 15% margin **even on the worst customer we can
imagine** — one who takes the biggest bundle discount, wins the intro offer, and
cancels at the first opportunity. That customer is rare; the typical one leaves
us 39.7% after the 10% renewal rate.

### Payback and return

| Subscriber life | Contribution (LTV) | Commission (CAC) | Ratio | Payback |
| --- | --- | --- | --- | --- |
| 3 months | £104.33 | £29.22 | 3.6 : 1 | 0.7 months |
| 6 months | £227.48 | £54.01 | 4.2 : 1 | 1.3 months |
| 12 months | £473.78 | £103.57 | 4.6 : 1 | 2.5 months |

3:1 is the usual benchmark for a healthy acquisition channel. Even a subscriber
who leaves after three months clears it, and **payback is inside two months** —
the programme funds itself rather than needing working capital.

### What it costs across the whole book

This is the number that matters for pricing. If **30%** of orders end up
attributed, the programme costs `0.30 × 11.3% ≈ 3.4%` of net revenue overall —
so prices barely need to move to carry it. The headline 20% is a per-order rate,
not a business-wide cost, and the two get confused constantly.

---

## 3. Why not the other models

You asked specifically about flat-per-sale and profit share. Both are wrong here,
for different reasons.

### Flat fee per sale (CPA), e.g. £15 an order
- **Against:** no incentive to promote the bigger bundle. Our margin comes from
  larger stacks — delivery is a fixed cost per parcel, so a £100 order is far
  more profitable than two £50 ones. A flat fee pays the same either way and
  quietly pushes partners towards the cheapest thing they can sell.
- **Against:** it prices badly at both ends. £15 is generous on a £40 order and
  insulting on a £150 one.
- **Where it does win:** predictability, and it caps the downside on a
  loss-leading offer. Worth keeping as a **special-case option for one-off
  campaigns**, not as the standard.

### Percentage of profit
- **Against, decisively:** an influencer cannot verify it. "You get 30% of our
  contribution margin" invites exactly one question — *whose* contribution
  margin, calculated how — and there is no good answer that doesn't involve
  showing them our supplier invoices. It reads as a business trying to keep the
  numbers to itself, and serious partners walk.
- **Against:** it makes their income depend on our cost control, which they
  have no influence over. If PowerBody put prices up, the influencer's pay
  drops. Indefensible.
- **The legitimate worry it comes from** — "what if commission makes an order
  unprofitable?" — is real, and is solved properly in §5 by flooring commission
  against margin rather than by making the whole model opaque.

### Percentage of gross (VAT-inclusive) revenue
- **Never.** Up to a fifth of a gross price is HMRC's money. Paying commission
  on it means paying partners out of the VAT account. Commission is always on
  **net revenue, excluding delivery** — delivery isn't margin, it's a
  pass-through we usually lose money on.

---

## 4. The follower offer (the half of this that actually drives sales)

Commission motivates the influencer. It does nothing for their audience. Every
successful programme pairs it with something the follower gets, and that is
usually what converts.

**Recommendation: the partner's code sets a fixed 30% first month, replacing the
scratch card.**

Why this rather than an extra discount on top:

- **It must not stack.** A 30% code plus a won 50% scratch card is 65% off, and
  on the worst-case order that is a loss. One first-month discount applies, ever.
- **It's a better pitch.** "Sarah's code gets you 30% off your first month" is
  concrete. "Scratch a card and see what you get" is fun on-site but impossible
  to promise in a video.
- **It's already modelled.** The intro offer is a configured lever with a blended
  cost (`introOffer.effectiveFirstMonthDiscount`, currently 18%). A fixed 30% for
  attributed orders costs about 12 points more on month one only, on attributed
  orders only, and the existing machinery prices it.

The rate should be per-tier, so a bigger partner can be given a stronger offer
without renegotiating the commission.

---

## 5. Integration with the pricing model

This is the part that has to be right, and the codebase already has the patterns.

### 5a. Commission is a line in the waterfall

`unitEconomics()` gains a step between card fees and returns:

```
Customer pays                              63.50
Less VAT                                    0.00   (not registered yet)
Less what PowerBody charge for the goods  −36.00
Less what PowerBody charge to ship it      −4.30
Less card fees                             −1.15
Less partner commission (20%)             −12.70   ← new
Less returns provision                     −0.22
                                        ─────────
Contribution                                9.13
```

It renders like every other line, so an order's economics are as legible with a
partner as without one. No hidden cost, no separate "marketing" bucket.

### 5b. Expected commission is priced in — same pattern as the intro offer

The config already carries `introOffer.effectiveFirstMonthDiscount`: the
**blended** cost across everyone who checks out, which the Good-price model uses
so prices afford the offer. Commission gets the exact same treatment:

```ts
partners: {
  /** Blended commission across ALL orders — attributed share × average rate. */
  effectiveCommissionPct: 0.034,
}
```

Set it to `attributed share × blended rate` (≈ 30% × 11.3% ≈ 3.4%) and every
price in the catalogue carries the programme. Raise the share as the channel
grows and prices follow. Same lever, same semantics, one line of new config.

### 5c. A margin floor for commission — the same guard discounts already have

`discountWithFloor()` already stops a discount pushing a line below
`marginFloorPct`. Commission gets the mirror:

```ts
/** Commission is reduced rather than paid if it would take an order below this. */
commissionMarginFloor: 0.15,
```

If an order's contribution after commission would fall under the floor, the
commission is **capped at the floor** and the partner statement says so plainly
("capped: this order's margin was too thin to pay the full rate"). Honest,
visible, and it makes a loss-making attributed order structurally impossible.

This is the correct answer to the worry that pushes people towards profit share:
you get the protection without the opacity.

### 5d. Partner VAT is a real cost while we're unregistered

A VAT-registered influencer invoices commission **plus VAT**. While we can't
reclaim, a £20 commission costs us **£24**. Small partners generally aren't
registered; established ones are. So each partner carries a
`vatRegistered` flag and the model costs it in — otherwise the programme is 20%
more expensive than the hub says for exactly the partners we most want.

### 5e. Where it shows up

- **Pricing → The model:** a "with a partner" toggle on the scenario picker, so
  the waterfall can be read both ways.
- **Pricing → Every product:** worst-case margin shown after expected commission.
- **Dashboard:** commission accrued this month as a cost line in Financials.

---

## 6. Attribution

### Code-first, link-second

**The discount code is the attribution.** `SARAH30` entered at checkout credits
Sarah, full stop.

That is deliberate, and better than the usual cookie-first design:

- It **survives everything** — ad blockers, iOS tracking prevention, a follower
  who watches on a phone and buys on a laptop, a cookie banner they declined.
- It needs **no consent**, because typing a code isn't tracking.
- It's **verifiable by the partner**, which removes the single biggest source of
  affiliate disputes ("your tracking is broken, I know I drove that sale").

The referral link (`/?ref=sarah`) is a convenience that pre-fills the code and
carries a 30-day last-click cookie for people who don't type it. Where both
exist, **the code wins** — it's the more deliberate signal.

### Through the quiz

The existing funnel already groups a whole quiz → reveal → checkout journey under
one anonymous session id. Carrying `ref` as an event property gives a
**per-partner funnel** for free: how many of Sarah's clicks start the quiz,
finish it, reach the reveal, and buy.

That's more than a vanity metric. It's how you tell a partner with a real
audience from one with a bought one — bought traffic clicks and bounces, real
traffic answers eleven questions about its training.

### Subscriptions

The attribution is stored on the **subscription**, not just the order, so
renewals credit the right partner for the full 12 months without re-attribution.

---

## 7. Qualification, clawback and abuse

| Stage | When | Meaning |
| --- | --- | --- |
| `pending` | Order placed | Accrued, not payable |
| `approved` | Order shipped **and** 14-day return window passed | Payable in the next run |
| `reversed` | Refund, cancellation, or chargeback | Deducted from the next payout |
| `capped` | Margin floor bit (§5c) | Reduced amount, reason shown |

Controls worth having from day one:

- **Self-referral blocked** — a partner's own account and email can't use their code.
- **Refund-rate flag** — a partner whose refund rate runs well above the book
  average is either driving the wrong audience or gaming it. Both need a
  conversation.
- **Undeliverable addresses** already get caught by the fulfilment queue, and a
  reversed order reverses its commission automatically.
- **No commission on an order that never shipped.** Obvious, and the most common
  place affiliate programmes leak money.

---

## 8. Tiers

Rates should improve with proven performance, not with follower count —
follower count is the least reliable number in the industry.

| Tier | Qualifies at | First order | Renewals | Follower offer |
| --- | --- | --- | --- | --- |
| **Partner** | Default | 15% | 8% | 25% first month |
| **Established** | 10 approved orders | 20% | 10% | 30% first month |
| **Ambassador** | 40 approved orders, refund rate under book average | 25% | 12% | 35% first month + a bundle named with them |

Two things this buys: a reason for a partner to keep going after their first
post, and a defensible answer to "can you do better than 20%" that isn't a
negotiation.

Worth checking: Ambassador at 25% leaves **10% margin on the worst case** before
the floor bites, so the floor at §5c should be set at or below that — or
Ambassador capped at 22%.

---

## 9. Payouts, contracts and the law

- **Monthly, in arrears**, £25 minimum balance, rolling over below that.
- **Self-billing** (we raise the invoice on their behalf) is standard and saves
  chasing paperwork; needs a self-billing agreement signed up front.
- **Partner VAT status** captured at signup — see §5d.
- **ASA/CAP disclosure is mandatory.** UK influencers must label paid promotion
  clearly (`#ad`) — and it must be obvious *before* the audience engages. Put it
  in the agreement, because an undisclosed ad is our compliance problem as much
  as theirs.
- **Health claims are the real risk.** We sell supplements. An influencer saying
  a product "cures" or "treats" anything is a serious problem for us, whatever
  the contract says. The codebase already maintains claim-safe copy
  (`stack-blueprint/approved-claims.ts`) — **give every partner a pre-approved
  copy pack** drawn from it and make using it a condition. Cheapest risk control
  available, and partners generally prefer being handed the words.

---

## 10. What the hub needs

**Products → Partners** (or its own tab):

- Partner list: code, tier, status, orders, revenue, commission owed, refund rate
- Per-partner: the quiz funnel from §6, cohort retention of their customers,
  contribution after commission, effective CAC, payback
- **The blunt one:** contribution after commission, per partner. Some partners
  will be net negative and the hub should say so rather than showing a
  flattering revenue number.
- Payout run: approve a month, generate statements, mark paid

**Partner-facing view** (phase 2): a read-only link showing their own numbers.
Removes almost all support email and is the single biggest trust builder in an
affiliate programme.

---

## 11. Build order

**Phase 1 — the money is right**
Partner records + codes, attribution through quiz and checkout, commission ledger
with the qualification states, the waterfall line, expected commission in the
Good-price model, the margin floor, hub partner list.

**Phase 2 — the programme is runnable**
Follower offer replacing the scratch card, tiers, payout runs and statements,
per-partner funnel and cohorts, refund-rate flags.

**Phase 3 — it runs itself**
Partner-facing dashboard, automated payouts, claim-safe copy pack, self-billing
documents.

---

## 12. Decisions needed before I build

1. **Rates.** 20% / 10% for 12 months as proposed, or a different split? The
   binding constraint is that first-order rate against a 35% worst case.
2. **Recurring window.** 12 months, or shorter (6) / for the life of the
   subscription? Life-of-subscription is the most attractive pitch and the most
   expensive; it also means paying forever for a customer acquired once.
3. **Follower offer.** Fixed 30% first month replacing the scratch card, as
   proposed? And is anyone allowed to stack it — my strong recommendation is no.
4. **Attributed share to price in.** I've assumed 30% of orders. If the plan is
   for this to be the main growth channel, that number is higher and prices need
   to carry more.
5. **Margin floor for commission.** 15% suggested. Below that the commission is
   capped rather than paid.
6. **Tiers now or later?** They add real complexity; flat rates for the first
   handful of partners is a legitimate choice.
7. **One-off campaign CPA** — worth supporting as an exception, or keep the
   model to one shape?
