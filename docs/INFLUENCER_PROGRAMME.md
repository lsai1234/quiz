# Influencer partner programme — proposal

> ### ⚠️ The scratch card is switched off (2026-08)
>
> `introOffer.scratchReveal.enabled` is now `false` and `firstMonthDiscount` is
> `0`. **There is no site-wide first-month discount.** A partner's code is the
> only extra discount on the site, on top of the subscription and bundle rates,
> which are unchanged.
>
> Anything below that describes a scratch card, its outcomes, its odds, or a
> partner code as a *floor under* the card is history. The mechanism is still in
> the code and switching it back on restores exactly what ran before — see
> `docs/PARTNER_PROGRAMME_BUILD.md` §0 D1 for what that switch costs and why the
> flat rate has to be set in the same breath.

**Status: rates repriced and live in config; no plumbing built.** The commission
rates in §1 are what `PRICING_CONFIG.partners` now holds. Everything about
attribution, payout and qualification is still a proposal.

> ### ⚠️ Repriced — read this before §2 onwards
>
> The original design (20% first order, 10% renewals for 12 months, a 25% intro
> floor) was modelled against a **representative order, not the actual mix**, and
> when it was run across all four order types it turned out that **every
> partner-attributed order lost money** — one-off at −£0.77 and subscription at
> −£0.17. Three things compounded:
>
> - **20% on a first order is priced for a subscription that follows.** On a
>   one-off order there is no renewal stream to pay it back.
> - **12 months of renewals** against an average subscriber life of 6. Not
>   directly expensive — the months don't happen — but it promises money the
>   retention curve doesn't produce.
> - **The 25% intro floor was deeper than the ~18% card we gave away anyway**, so
>   a partner's code cost us a bigger discount *and* a commission on top. This
>   was the expensive one.
>
> Now **15% / 5% for 6 months, with a 20% floor**. Every order type pays. The
> full audit is in `docs/PRICING_STRATEGY.md` §3.
>
> **Sections 2–5 below still contain the original 20/10/25 modelling.** The
> reasoning about programme *shape* — split rate, code-first attribution,
> qualification windows, no tiers in v1 — is unchanged and still worth reading.
> The specific pound figures in those sections are superseded by §1 and by
> PRICING_STRATEGY.md.

Numbers in §2 onwards come from the live pricing model (`lib/pricing/*`) — a
representative 3-product quiz stack, £30 wholesale, 2.5kg, at the model's own
recommended price of £103.26, with the business **not yet VAT-registered**.

---

## 1. The recommendation, in one page

| | |
| --- | --- |
| **Model** | Percentage of **net revenue** (ex VAT, ex delivery) |
| **First order** | **15%** |
| **Renewals** | **5%**, for **6 months** from signup |
| **Follower offer** | The partner's code **raises the floor of the scratch card to 20%**. The card stays; nobody skips it |
| **Attribution** | **Discount code first**, referral link as a convenience. 30-day last-click cookie |
| **Qualification** | Accrues on order, confirms after the 14-day return window, reverses on refund |
| **Hard guard** | Commission is floored at **5%** contribution so it can never make an order a loss |
| **Tiers** | **Not in v1** — flat rates for everyone |
| **Payout** | Monthly in arrears, £25 minimum, self-billed |

Across the whole book at 30% attribution this is about **£1.97 an order** — the
headline 15% is only ever paid on one order, and only ever on the net.

### Why this shape

A subscription business should pay for **subscribers**, not for clicks. A split
rate does three things a flat rate can't: the headline rate competes for
attention against every other programme an influencer is offered, the recurring
tail makes them care whether the traffic they send actually stays, and the two
together cost us less than a flat rate worth the same to them.

The rates have to clear one bar the original design missed: **an attributed
one-off order must still make money on its own.** A one-off carries the first-order
rate with no renewals behind it, so whatever the headline is, it has to survive
that case. 15% does; 20% didn't.

### Why 6 months and not life-of-subscription

Life-of-subscription is the most attractive thing you can offer a partner, and
the wrong thing to offer. Three reasons:

- **The influence expires long before the payments do.** A partner's post plausibly
  drives months 1–3. It has nothing to do with whether someone is still
  subscribed in month 30 — that's the product and the service. Paying forever
  for a customer acquired once is paying for something that already happened.
- **It creates an unbounded liability.** A permanent obligation to everyone who
  ever posted, including people who go inactive, change career or become
  unreachable. It is also the kind of thing that complicates ever valuing or
  selling the business.
- **A window longer than the subscriber life promises nothing real.** At an
  average life of 6 months, a 12-month window and a 6-month window pay out
  almost identically — the extra months simply don't happen. What the longer
  window does is set an expectation the business can't fund *if retention ever
  improves*, which is precisely the moment it would hurt most. Matching the
  window to `orderMix.averageRetentionMonths` keeps the promise honest in both
  directions.

The recurring rate is still there to buy the thing that matters — a partner who
cares whether the traffic they sent actually stays.

If a single flagship partner ever needs life-of-subscription to sign, that's a
bespoke term for one deal, not the shape of the programme.

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

## 4. The follower offer, and what happens to the scratch card

**The scratch card does not go away, and there is no second journey.** Every
customer scratches, exactly as they do now. A partner's code changes the **odds
table**, not the code path — same screen, same animation, better prizes.

> "Use Sarah's code and you're guaranteed **at least 20% off** your first month —
> scratch to see if you got **50%**."

That is a stronger pitch than a flat number, because it has a floor she can
promise *and* an upside worth watching. And it is one implementation: the intro
allocator (`stack-blueprint/intro-allocation.ts`) already draws from a weighted
outcome table and rations it to hit a target effective rate. A partner code swaps
the table. Nothing branches.

| | Outcomes | Effective first month |
| --- | --- | --- |
| Unattributed (today) | 50% (w1) · 25% (w10) · 10% (w10) | **19.0%** |
| Attributed | 50% (w1) · 25% (w20) | **26.2%** |

So an attributed customer costs about **7 points more** on month one only.

### Why not a flat 30% replacing the card (my first proposal)

I modelled it and it's worse on both counts. Worst-case attributed first order,
after the biggest bundle discount and 20% commission:

| Follower offer | Effective intro | Member pays | Left after commission |
| --- | --- | --- | --- |
| Unattributed today | 19.0% | £62.69 | £8.89 (14.2%) |
| **Partner floor 25%** | **26.2%** | **£57.16** | **£4.55 (8.0%)** |
| Partner floor 30% | 31.0% | £53.47 | £1.66 (3.1%) |
| Flat 30%, no card | 30.0% | £54.21 | £2.24 (4.1%) |

A flat 30% is both **more expensive** than the 25% floor and **a weaker pitch**,
because it throws away the 50% upside that makes the card worth talking about.
The 25% floor is the better trade in both directions.

### The rule that must not bend

**One first-month discount, ever.** A partner code and a won scratch card do not
stack — the code *is* the card, with better odds. Stacking a 30% code onto a won
50% card is 65% off and a straight loss on the worst-case order.

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
commissionMarginFloor: 0.05,
```

If an order's contribution after commission would fall under the floor, the
commission is **capped at the floor** and the partner statement says so plainly
("capped: this order's margin was too thin to pay the full rate"). Honest,
visible, and it makes a loss-making attributed order structurally impossible.

This is the correct answer to the worry that pushes people towards profit share:
you get the protection without the opacity.

**5%, not the 15% I first proposed.** That was wrong and would have quietly
broken the programme. An attributed first order lands at **8%** contribution
after commission (see §4) — that is *by design*, because the first month carries
both the deepest intro discount and the highest commission rate. A 15% floor
would have capped commission on essentially **every** attributed first order,
which is precisely the moment a partner is watching their dashboard.

The floor's job is to make a **loss** impossible, not to defend a target margin.
Acquisition months are supposed to be thin; the renewal month leaves **£28.22**
after its 10%, and payback is 1.3 months. 5% does the safety job without
fighting the business model.

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

## 8. Tiers — deferred

**Not in v1.** Flat 20% / 10% / 25%-floor for everyone.

Tiers add a qualification rule, a promotion job, a second set of rates to test
and a conversation to have with every partner about which band they're in —
before there is any evidence about what actually drives performance. With a
handful of partners, one flat rate is easier to sell, easier to explain and
easier to change.

The data to build them on is being collected from day one anyway (§10): approved
orders, refund rate, retention by partner. When there's enough of it, tiers can
be introduced on evidence rather than guesswork — and rates should key off
**proven performance, not follower count**, which is the least reliable number
in the industry.

One note for when they arrive: at a 25% first-order rate the worst case lands at
about 3% contribution, below even the 5% floor — so a top tier should be capped
nearer **22%**, or should buy its extra value in something other than commission
(a co-named bundle, a bigger follower discount, guaranteed content spend).

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

## 12. Decisions

### Settled

| Decision | Answer |
| --- | --- |
| Rates | **20% first order, 10% renewals** |
| Recurring window | **12 months** (§1) |
| Tiers | **Not in v1** (§8) |
| Follower offer | **Partner code raises the scratch floor to 25%** — the card stays, one journey (§4) |
| Stacking | **Never.** One first-month discount per order (§4) |
| Commission margin floor | **5%**, revised down from 15% (§5c) |

### Still open

1. **Attributed share to price in.** I've assumed **30%** of orders end up
   attributed, which puts the programme at ~3.4% of net revenue book-wide. If
   this is meant to be the *main* growth channel that figure is higher and prices
   need to carry more. It is one config value and can be revised as the channel
   proves out — but the initial number should be a decision, not a default.
2. **One-off campaign CPA.** Worth supporting a flat fee per order as an
   exception for a specific campaign, or keep the programme to exactly one shape?
   My inclination is to keep one shape until something forces otherwise.
