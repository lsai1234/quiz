# Pricing strategy — analysis and recommendation

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

> **Superseded in part.** §5 and §7.1's anchoring argument no longer applies —
> prices are now set at a flat multiple of what we pay, with the supplier's RRP
> kept only as a cross-check. The reasoning about the *ladder* (§2, §7.1) and the
> *partner programme* (§3, §7.2) is unchanged and still live. See
> `docs/PRICING_GUIDE.md` §5.
>
> **Status: implemented.** Every recommendation in §7 is live in
> `src/lib/stack-blueprint/pricing.ts`, except §7.5 (quarterly shipping) and
> §7.6 (dropping GO Hydro), which are catalogue and scheduling changes rather
> than pricing settings. See §10 for what the shipped numbers actually came out
> at — two of them differ from the projections below, and the reasons are worth
> reading.

An audit of every price and discount CHRGD charges, what each one does to the
money, and what to change. Every figure comes from the model in
`src/lib/pricing/*` run over the real PowerBody catalogue, not from assumption.

**Headline:** the pricing is not too aggressive — it's *incoherent*. Five
discount mechanisms were designed independently and they collide. The most
serious result is that **there is currently no ongoing reason to subscribe**, and
on the middle bundle subscribing actively costs the member 5 points. Fixing the
collisions raises the average order from £24.42 to £25.93 while giving members a
better, clearer offer.

---

## 1. Everything we charge and everything we give away

| Mechanism | Where | Setting today |
| --- | --- | --- |
| **Anchor premium** | `anchor.targetBargainVsRrpPct` | list price = RRP **+8.2%** (derived) |
| **One-off bundle tiers** | `bundleTiers` | **10%** over £50, **15%** over £90, **20%** over £120 |
| **Subscribe & save** | `levelSubscriptionDiscount` | **10 / 15 / 20%** by stack size |
| **Subscription tiers** | `subscriptionTiers` | *empty — unused* |
| **First-month scratch card** | `introOffer.scratchReveal` | **50 / 25 / 10%**, weighted 1 / 10 / 10 → blended 18% |
| **Free delivery** | `freeDeliveryThreshold` | free over **£50**, else £3.95 |
| **Partner intro floor** | `partners.introFloorPct` | code guarantees at least **25%** off month one |
| **Partner commission** | `partners.firstOrderPct` / `renewalPct` | **20%** first order, **10%** renewals for **12 months** |
| **Margin floor** | `marginFloorPct` | never discount below cost × 1.15 (≈ 36.8% max off) |

Two of these are pure cost with no offsetting benefit modelled anywhere: the
partner intro floor and the 12-month renewal window. They turn out to be the
most expensive things in the list.

---

## 2. The critical fault: the subscription is worse than buying once

The one-off bundle tiers and the subscribe-&-save ladder were set independently.
Put a real quiz stack through both and they collide:

| Stack | List price | One-off discount | Subscribe & save | **Advantage of subscribing** |
| --- | --- | --- | --- | --- |
| Essentials (3 items) | £73.97 | 10% (£50+ tier) | 10% | **0 pp** |
| Performance (5 items) | £125.95 | **20%** (£120+ tier) | 15% | **−5 pp** |
| Complete (7 items) | £174.93 | 20% (£120+ tier) | 20% | **0 pp** |

A member on the Performance stack — the biggest segment, half of all orders —
**pays £6.30 more per month to subscribe than to buy the same box outright.**

The only thing subscription offers is the first-month scratch card. Everything
after month one is a worse deal than the one-off checkout sitting next to it.
That is the recurring-revenue thesis of the business resting on a single
promotional month.

**Why it happened:** the £120 tier threshold is below a 5-item stack's list
price, so a Performance basket lands on the *top* one-off tier automatically.

---

## 3. Partner commission is priced for a subscription that often doesn't happen

20% of net revenue on a first order is a normal affiliate rate *when a
subscription follows and pays it back*. On a one-off order there is nothing to
pay it back with:

| Journey | We keep, direct | We keep, via a partner |
| --- | --- | --- |
| Essentials one-off | £13.99 | **£0.68** |
| Performance one-off | £17.66 | **−£2.49** |
| Complete one-off | £27.45 | **−£0.54** |

Every partner-attributed one-off order is at or below break-even. And over a
whole subscriber lifetime the programme takes most of the customer:

| Stack | Direct LTV | Via a partner | Partner's share |
| --- | --- | --- | --- |
| Essentials | £71.46 | £24.26 | **66%** |
| Performance | £123.07 | £47.19 | **62%** |
| Complete | £138.45 | £39.31 | **72%** |

Three things compound to produce that. The 20% first-order rate; the 10%
renewal rate running for 12 months when the average subscriber stays 6; and the
25% intro floor, which is *deeper than the 18% we'd have given anyway* — so the
partner's code costs us a bigger discount **and** a commission on top. Month one
via a partner loses £12–£28 on every stack size.

---

## 4. The scratch card loses money on half of all first months

| Card | Odds | Essentials | Performance | Complete |
| --- | --- | --- | --- | --- |
| 50% off | 1 in 21 | −£18.79 | −£28.86 | **−£41.47** |
| 25% off | 10 in 21 | −£2.40 | −£2.50 | −£7.00 |
| 10% off | 10 in 21 | +£7.44 | +£13.31 | +£13.67 |
| **Expected** | | **+£1.51** | **+£3.77** | **+£1.20** |

**52% of first months lose money** — the top prize *and* the 25% card, which is
half of all draws. The expected value is positive but thin, and it is carried
entirely by the 10% card. A shift in the mix of who wins what, or a run of luck,
puts month one underwater.

Worth being precise: a loss-making first month is *fine* if the subscription
pays it back — that is what acquisition cost is. The problem is that it doesn't
combine safely with the partner floor, which forces the 25% outcome onto every
attributed order.

### The margin floor doesn't protect any of this

`marginFloorPct` caps discounting at ~36.8% off list. But it is applied inside
`buildSubscriptionPlan`, and the intro discount is applied *after*, in
`calculatePricing`:

```ts
const subscriptionFirstMonth = round(subscriptionTotal * (1 - introDiscount))
```

So Complete + a 25% card is 40% off, and Complete + a 50% card is 60% off —
both straight through a floor that exists to stop exactly that. The single
deepest discount in the business is the one the guardrail doesn't see.

---

## 5. The anchor promises one saving and delivers five

The anchor is set so a member on the middle bundle lands 8% below RRP. What
people actually get:

| Journey | vs RRP |
| --- | --- |
| Single item, no bundle | **8.2% ABOVE** |
| Essentials one-off | 4.9% below |
| Essentials subscription | 2.6% below |
| Performance subscription | 8.0% below ← the design target |
| Performance one-off | **15.3% below** |
| Complete one-off / subscription | 15.1% below |

A one-off Performance buyer gets nearly double the saving of an Essentials
subscriber. Nobody is being cheated, but "you save ~8%" is not a claim the
system supports, and the deepest savings go to the customers who commit least.

### The structural constraint worth understanding

With an 8.2% premium, any discount below **7.6%** leaves the member paying more
than RRP. The entry subscribe rate is 10%. That leaves barely 2 points of room
between "the cheapest one-off discount we can offer without going above RRP" and
"the entry subscription rate" — which is why the ladder has nowhere to go at the
bottom. **The entry subscribe rate has to clear the anchor premium with room to
spare, or the ladder collapses.**

---

## 6. Delivery: the free line is out of reach monthly, close quarterly

PowerBody ship free over £99 of wholesale in one parcel. Our stacks:

| Stack | Wholesale | Band | Costs us | To free |
| --- | --- | --- | --- | --- |
| Essentials (3) | £36.00 | ≤£50 → £6.50 | £7.87 | £63 away |
| Performance (5) | £62.00 | ≤£99 → £5.50 | £6.72 | £37 away |
| Complete (7) | £86.00 | ≤£99 → £5.50 | £6.72 | **£13 away** |

No monthly stack reaches it. But **a Complete stack shipped quarterly is £258 of
wholesale — free, three times over.** Quarterly shipping is worth ~£6.72 × 8 =
£54 a year per Complete subscriber, which is more than any pricing lever on this
page. The Essentials stack is also one band away: £14 more of wholesale drops it
from £6.50 to £5.50.

---

## 7. Recommendation

Six changes. None of them make the customer offer worse; three make it better.

### 7.1 Make the one-off discount flat, and let only the subscription ladder

```
bundleTiers:  a single 8% tier over £50   (was 10/15/20 by basket value)
levelSubscriptionDiscount:  12.5 / 15 / 20   (was 10/15/20)
```

The ladder becomes a *subscription feature*, which is what it was always meant
to be. The message gets simpler, not more complicated: **"Spend £50 and get 8%
off with free delivery. Subscribe and it's 12.5%, 15% or 20%."**

| Stack | One-off | Subscribe | Advantage |
| --- | --- | --- | --- |
| Essentials | 8% | 12.5% | **+4.5 pp** |
| Performance | 8% | 15% | **+7 pp** |
| Complete | 8% | 20% | **+12 pp** |

The advantage now *grows with stack size*, which reinforces the bundle ladder
instead of fighting it. Every journey still lands at or below RRP.

The entry rung moves to 12.5% because 10% doesn't clear the 8.2% anchor premium
with enough room — see §5. If you'd rather keep a clean 10/15/20, the
alternative is to lower the anchor premium to ~4%, but that costs £3.10 per
order and drops the catalogue's average margin from 12.3% to 7.8%. Raising the
entry rung is the cheaper fix by a wide margin.

### 7.2 Reprice the partner programme

```
firstOrderPct:  0.15   (was 0.20)
renewalPct:     0.05   (was 0.10)
renewalMonths:  6      (was 12 — match actual retention)
introFloorPct:  0.20   (was 0.25)
```

The intro floor is the important one. At 25% it is *deeper than the 18% we give
away anyway*, so a partner code costs us extra discount **and** commission. At
20% against a 15% blended card it is still a genuine "at least 20% off" promise
a partner can advertise, at a fraction of the cost.

Result: partner-attributed one-off orders go from −£2.49 to **+£15.16**, and
the partner's share of a customer's lifetime value falls from 62–72% to
**35–43%** — which is where a healthy affiliate programme sits.

### 7.3 Recut the scratch card

```
outcomes:  40% (weight 1) / 20% (weight 8) / 10% (weight 12)
effectiveFirstMonthDiscount:  0.15
```

Same shape, same "rare big prize" hook, but the worst case on a Complete stack
improves from −£41.47 to −£27.68 and the *common* card (now 20%, 33% of draws)
stops being a loss-maker. 40% still reads as a great prize.

### 7.4 Apply the margin floor to the intro discount

A code change, not a setting. `calculatePricing` should run the first-month
price through `discountWithFloor` the same way the subscription rate is. Without
it, the guardrail is decorative on the one discount deep enough to need it.

### 7.5 Push the Complete stack over the free-shipping line

Quarterly shipping on stacks where the products last — worth ~£54 a year per
Complete subscriber, more than every pricing change above combined. Second best:
default the Complete stack to 8 products rather than 7, which clears £99 of
wholesale outright.

### 7.6 Drop GO Hydro Electrolyte Tablets from subscription

£6.49 RRP can't absorb even a third of a £6.50 delivery. It's the one product in
the catalogue that loses money at every bundle size. Keep it as an add-on to a
parcel already going out, not as a stack line.

---

## 8. What the package does

| | Today | Recommended |
| --- | --- | --- |
| Average order keeps | £24.42 (21.6%) | **£25.93 (23.0%)** |
| Customer lifetime value | £72.51 | **£77.63** |
| Commission paid per order | £5.12 | **£3.45** |
| Subscription advantage (E/P/C) | 0 / −5 / 0 pp | **+4.5 / +7 / +12 pp** |
| Partner one-off order (Performance) | −£2.49 | **+£15.16** |
| Partner's share of LTV | 62–72% | **35–43%** |
| Worst scratch card (Complete) | −£41.47 | **−£27.68** |
| Catalogue average margin | 12.3% | 12.3% *(unchanged)* |
| Products losing money | 1 | 1 |

The business makes **more** money while the member gets a clearer offer and a
real reason to subscribe. That is the tell that these were coherence problems
rather than a pricing level that was wrong.

---

## 9. What I'd leave alone

- **The anchor premium (+8.2%).** It's doing its job and the catalogue sits at
  market. Lowering it costs real margin for no strategic gain.
- **The 10/15/20 shape of the ladder** at the top two rungs. Only the entry rung
  needs to move, and only because of the anchor constraint in §5.
- **Free delivery over £50.** It costs us about £6.72 on every qualifying order,
  but it's the threshold that pulls basket size up towards PowerBody's bands, so
  it partly pays for itself.
- **VAT.** Staying unregistered is right until turnover forces it.
- **The 35% target margin** as a *target*. It isn't achievable on branded resale
  and the hub now says so plainly, which is more useful than a target set where
  everything passes.


---

## 10. What shipped, and where the projections were wrong

Implementing this surfaced two errors in the analysis above. Both are corrected
here rather than quietly edited into §8.

### The entry rung had to go to 13%, not 12.5%

§7.1 proposed 12.5%. Against a flat 8% one-off tier that is a **4.5-point**
advantage — under the 5-point bar the same section set for "worth a commitment".
The bar is the right one, so the rung moved to **13%**. The shipped ladder is
**13 / 15 / 20**, giving **+5 / +7 / +12** points.

`src/lib/pricing/ladder.ts` now enforces this as an invariant and the hub renders
it, so the next time someone edits a rate the verdict moves under their hand
instead of nobody noticing for a month.

### The blended model was overstating one-off orders

`blendedEconomics` priced every one-off at full list — it never applied the
bundle tier at all. Since 40% of orders are one-off, the headline number on the
hub's first tab was flattering by the whole tier. Now fixed, which makes the
before-and-after look **worse in absolute terms and better in what it shows**:

| On the hub's own basis (3-item basket at the catalogue average) | Before | After |
| --- | --- | --- |
| Average order keeps | £6.70 (10.3%) | **£8.08 (12.3%)** |
| Customer lifetime value | £21.72 | **£24.63** |
| Commission per order | £2.91 | **£1.97** |
| One-off, direct | £12.93 | £14.43 |
| One-off, via a partner | **−£0.77** | **+£3.93** |
| Subscription, direct | £7.63 | £7.30 |
| Subscription, via a partner | **−£0.17** | **+£2.80** |

The headline figures in §8 (£24.42 → £25.93) were measured on a 5-item basket
and before this fix. The direction and the ratio hold; the absolute numbers were
optimistic on both sides of the comparison.

**The finding that matters:** under the old settings *two of the four order
types lost money* — every partner-attributed order, one-off and subscription
alike. All four are now positive, which is what makes the partner attribution
rate genuinely safe to not know.

### Two side effects worth having on the record

**One budget-capped stack lost a product.** Budget caps are enforced on the
*one-off discounted* total, so a shallower one-off discount fits fewer products
under the same ceiling. Across 16 persona snapshots exactly one changed —
`perf-bulking-balanced` went from 4 products to 3 under an £80 cap. Every other
stack kept its selection, and every subscription total fell. Worth deciding
later whether a subscription-first business should cap stacks on the one-off
price at all; it currently does.

**The margin floor now binds where it never used to.** Applying it to the intro
discount means a deep scratch card on a thin product no longer discounts to
whatever the card says — it stops at cost × 1.15. That is the point, but it does
mean the advertised "40% off" is occasionally not 40% off. The card is still
honest at the basket level; it is the per-line floor that clips it.
