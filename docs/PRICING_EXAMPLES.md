# Pricing worked examples

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

Every model, walked through with made-up products at made-up prices. **All the
numbers below are produced by the real code** (`src/lib/pricing/*`) — nothing is
hand-computed, so if a rule changes these change with it.

---

## 1. The rule

**Every price is what PowerBody charge us, doubled, rounded down to .99.** That
is the whole of it, and it works the same for every product including the ones
no brand publishes a recommended price for.

| Product | We pay | × 2 = we charge | Their RRP | vs their RRP |
| --- | --- | --- | --- | --- |
| Titan Whey 2kg | £31.00 | **£61.99** | £59.99 | +3.3% |
| Volt Pre-Workout 300g | £15.50 | **£30.99** | £29.99 | +3.3% |
| Drift Sleep Blend | £13.00 | **£25.99** | £24.99 | +4.0% |
| Kore Creatine 500g | £10.00 | **£19.99** | £19.99 | 0% |
| Nova Omega-3 (90 caps) | £8.80 | **£16.99** | £16.99 | 0% |
| Lumen Vitamin D3 | £5.20 | **£9.99** | £9.99 | 0% |
| Flux Electrolytes (20) | £3.60 | **£6.99** | £6.99 | 0% |

The RRP column is a **check, not an input**. Nothing in the price calculation
reads it. The hub flags anything more than 15% above the brand's own
recommendation, and none of these are.

That the two columns land so close together isn't luck: across the real
catalogue PowerBody's RRP is about **1.94× their wholesale**, so doubling what we
pay puts us where the market already is — we just get there by our own rule
instead of inheriting theirs.

---

## 2. Titan Whey, five ways to buy it

We pay £31.00, we charge £61.99. Their RRP is £59.99.

| How they buy it | They pay |
| --- | --- |
| On its own, nothing else in the basket | **£61.99** |
| In a £50+ basket, buying once (−8%) | £57.03 |
| Essentials subscriber (−13%) | £53.93 |
| Performance subscriber (−15%) | £52.69 |
| Complete subscriber (−20%) | **£49.59** |

Buy one thing with no basket and no plan and you pay a couple of pounds over the
high street. Everything else is under it, and the gap grows with commitment.

---

## 3. Delivery — PowerBody charge per BOX, not per item

They band on what *we* pay them for the whole parcel: £6.50 up to £50 of
wholesale, £5.50 up to £99, free above. Watch a basket grow:

| Basket | Our wholesale | Band | Next step |
| --- | --- | --- | --- |
| Titan | £31.00 | £6.50 | £19.00 more → £5.50 |
| + Volt | £46.50 | £6.50 | **£3.50 more → £5.50** |
| + Drift | £59.50 | **£5.50** | £39.50 more → free |
| + Kore | £69.50 | £5.50 | £29.50 more → free |
| + Nova | £78.30 | £5.50 | £20.70 more → free |

Because we aren't VAT-registered, **their £6.50 actually costs us £7.87** — we
can't reclaim the VAT they charge us.

The free line at £99 of wholesale needs roughly a £200 basket — reachable on a
quarterly shipment, essentially never on a monthly one.

---

## 4. A Performance stack (5 items)

**Titan + Volt + Drift + Kore + Nova** — we pay £78.30, we charge £155.95.

| Journey | They pay | Goods | Postage | **We keep** |
| --- | --- | --- | --- | --- |
| Buys once (−8%) | £143.47 | £93.96 | £6.72 | **£40.17** (28.0%) |
| Subscriber, months 2+ (−15%) | £132.56 | £93.96 | £6.72 | **£29.42** (22.2%) |

**Subscribing saves them £10.92 a month** over buying the same box once.

### Their first month, by scratch card

| Card | Odds | They pay | We keep |
| --- | --- | --- | --- |
| 40% off | 1 in 21 | £79.53 | **−£22.81** |
| 20% off | 1 in 3 | £106.05 | +£3.31 |
| 10% off | 1 in 2 | £119.30 | +£16.36 |
| **Expected** | | | **+£9.52** |

The top card loses money on purpose — that's the acquisition cost, rationed to
one draw in twenty-one. **Lifetime over 6 months: £156.62.**

---

## 5. The floor, and where it clips

Nothing is ever sold below **cost plus 15%**. Since prices are cost × 2, that
puts a hard ceiling on discounting:

```
prices at 2× cost, floor at 1.15× cost
  →  the most that can ever come off any product is 42.5%
```

That ceiling doesn't depend on RRP, on the supplier, or on anything that can
change under us. It falls straight out of two numbers we set ourselves.

> ### ⚠️ The top card promises more than the floor allows
>
> The biggest bundle (20%) plus the top scratch card (40%) asks for **52% off**.
> The floor can only give **42.5%**.
>
> On Titan Whey: the combination asks for £29.76, the floor hands back £35.65 —
> a real discount of 42.5%, not the 52% the card implies. Someone who scratches
> a 40% card on a Complete bundle gets less than the card says.
>
> **Two honest ways out:** bring the top card to 25% (Complete + 25% = 40%, which
> fits), or accept selling that one month nearer cost and lower the floor for the
> first month only. Quietly splitting the difference — which is what happens
> today — is the worst of the three. The hub now shows this on the Overview tab
> rather than hiding it.

---

## 6. Where the money goes — the full waterfall

Performance stack, subscriber, month 3:

```
Customer pays                                £132.56   →  £132.56
No VAT charged                                 £0.00   →  £132.56
  Not VAT-registered, so nothing is charged — and nothing reclaimed.
Less what PowerBody charge for the goods     −£93.96   →   £38.60
  Their wholesale price plus VAT, which we cannot reclaim.
Less what PowerBody charge to ship it         −£6.72   →   £31.88
  Banded on the £78.30 of wholesale in this order.
Less card fees                                −£2.19   →   £29.69
  1.5% + 20p of the gross. VAT-exempt, so nothing to reclaim.
Less returns provision                        −£0.27   →   £29.42
  2% of orders come back. The goods are refunded to us; the shipping never is.
```

**We keep £29.42 — 22.2% of what they paid.**

---

## 7. What this rule exposed

Switching from RRP-based to cost-based pricing took the catalogue from **1
product losing money to 4**. That is the rule telling the truth, not a step
backwards:

| Product | We pay | We charge | Subscriber pays | We keep |
| --- | --- | --- | --- | --- |
| GO Hydro Electrolytes | £3.20 | £5.99 | £5.09 | **−£1.75** |
| Vitamin D3 4000iu | £4.00 | £7.99 | £6.79 | **−£0.34** |
| Vitamin C 1000mg | £5.00 | £9.99 | £8.49 | **−£0.19** |
| Daily Multivitamin | £6.00 | £11.99 | £10.19 | **−£0.03** |

All four are cheap vitamins carrying a **£2.62 share of the postage**. A product
needs to be worth roughly £12 to survive that.

The old RRP rule hid three of them, because those brands recommend a generous
retail price relative to what they charge us — Vitamin D3 costs £4.00 and its RRP
is £9.99, so pricing off RRP made it look fine when the postage says otherwise.

**They aren't bad products, they're bad subscription lines.** Sell them as
add-ons to a box that's already going out.
