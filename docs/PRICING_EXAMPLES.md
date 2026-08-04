# Pricing worked examples

Every model, walked through with made-up products at made-up prices. **All the
numbers below are produced by the real code** (`src/lib/pricing/*`) — nothing is
hand-computed, so if a rule changes these change with it.

The fake catalogue, priced the way PowerBody price theirs (wholesale ≈ half of
their RRP):

| Product | Their RRP | We pay | Servings |
| --- | --- | --- | --- |
| Titan Whey 2kg | £59.99 | £31.00 | 60 |
| Volt Pre-Workout 300g | £29.99 | £15.50 | 30 |
| Drift Sleep Blend | £24.99 | £13.00 | 30 |
| Kore Creatine 500g | £19.99 | £10.00 | 100 |
| Nova Omega-3 (90 caps) | £16.99 | £8.80 | 90 |
| Lumen Vitamin D3 | £9.99 | £5.20 | 120 |
| Flux Electrolytes (20) | £6.99 | £3.60 | 20 |

---

## 1. The anchor — their RRP becomes our list price

We resell other people's brands, so the market sets the price. Our list price
starts from their RRP and adds a small premium, because almost everyone arrives
through the quiz and buys a bundle — the single-unit price is what the discount
is measured against.

| Product | Their RRP | Our list | We pay | Cost as % of list |
| --- | --- | --- | --- | --- |
| Titan Whey 2kg | £59.99 | **£63.99** | £31.00 | 48.4% |
| Volt Pre-Workout | £29.99 | **£31.99** | £15.50 | 48.5% |
| Drift Sleep Blend | £24.99 | **£26.99** | £13.00 | 48.2% |
| Kore Creatine | £19.99 | **£20.99** | £10.00 | 47.6% |
| Nova Omega-3 | £16.99 | **£17.99** | £8.80 | 48.9% |
| Lumen Vitamin D3 | £9.99 | **£9.99** | £5.20 | 52.1% |
| Flux Electrolytes | £6.99 | **£6.99** | £3.60 | 51.5% |

The premium is **derived**, not typed in: you set "a member on the middle bundle
should end up 8% under RRP" and the maths works backwards to +8.2%. That stops
you picking a premium and a target that contradict each other.

> **Quirk worth knowing:** prices round *down* to a .99 ending, so the premium
> actually landed is 5–8%, not a flat 8.2% — and on anything under about £12 it
> vanishes entirely. Lumen wants £10.81 and rounds back to £9.99. Rounding down
> is deliberate (rounding up can push a discounted price back *above* RRP), but
> it means cheap products carry no anchor at all. See §9.

---

## 2. One product, five ways to buy it

Titan Whey — their RRP £59.99, our list £63.99:

| How they buy it | They pay | vs RRP |
| --- | --- | --- |
| On its own, nothing else in the basket | £63.99 | **6.7% ABOVE** |
| In a £50+ basket, buying once (−8%) | £58.87 | 1.9% below |
| Essentials subscriber (−13%) | £55.67 | 7.2% below |
| Performance subscriber (−15%) | £54.39 | 9.3% below |
| Complete subscriber (−20%) | £51.19 | **14.7% below** |

That first row is the anchor doing its job: buy one thing from us with no basket
and no plan, and you pay a small premium over the high street. Every other row
is a real, checkable saving — and the saving grows with commitment.

---

## 3. Delivery — PowerBody charge per BOX, not per item

They band on what *we* pay them for the whole parcel: £6.50 up to £50 of
wholesale, £5.50 up to £99, free above. Watch a basket grow:

| Basket | Our wholesale | Band | Next step |
| --- | --- | --- | --- |
| Titan | £31.00 | £6.50 | £19.00 more → £5.50 |
| + Volt | £46.50 | £6.50 | **£3.50 more → £5.50** |
| + Kore | £56.50 | **£5.50** | £42.50 more → free |
| + Nova | £65.30 | £5.50 | £33.70 more → free |
| + Drift | £78.30 | £5.50 | £20.70 more → free |

Two products sitting £3.50 short of a cheaper band is the kind of thing worth
knowing when you build a bundle. The free line at £99 of wholesale needs roughly
a £190 basket — reachable on a quarterly shipment, essentially never on a
monthly one.

**Because we aren't VAT-registered, their £6.50 actually costs us £7.87** — we
can't reclaim the VAT they charge us.

---

## 4. An Essentials stack (3 items)

**Titan Whey + Kore Creatine + Nova Omega-3** — list £102.97, their combined RRP
£96.97, we pay PowerBody £49.80.

| Journey | They pay | vs RRP | Goods | Postage | Card fees | **We keep** |
| --- | --- | --- | --- | --- | --- | --- |
| Buys once (−8%) | £94.73 | 2.3% below | £59.76 | £7.87 | £1.62 | **£25.17** (26.6%) |
| Subscriber, months 2+ (−13%) | £89.58 | 7.6% below | £59.76 | £7.87 | £1.54 | **£20.10** (22.4%) |

**Subscribing saves them £5.15 a month** over buying the same box once. That gap
is the entire point of the ladder, and it used to be zero.

### Their first month, by scratch card

| Card | Odds | They pay | vs RRP | We keep |
| --- | --- | --- | --- | --- |
| 40% off | 1 in 21 | £53.75 | 44.6% below | **−£15.20** |
| 20% off | 1 in 3 | £71.67 | 26.1% below | +£2.45 |
| 10% off | 1 in 2 | £80.63 | 16.9% below | +£11.28 |
| **Expected** | | | | **+£6.66** |

The top card loses money on purpose — that's the acquisition cost, and it's
rationed to one draw in twenty-one. What matters is that the *common* outcomes
both pay, which is what the recut fixed.

**Lifetime (6 months): £107.16.**

---

## 5. A Performance stack (5 items)

**Titan + Volt + Kore + Nova + Drift** — list £161.95, RRP £151.95, we pay £78.30.

| Journey | They pay | vs RRP | **We keep** |
| --- | --- | --- | --- |
| Buys once (−8%) | £148.99 | 1.9% below | **£45.61** (30.6%) |
| Subscriber, months 2+ (−15%) | £137.66 | 9.4% below | **£34.45** (25.0%) |
| First month, 40% card (1 in 21) | £82.59 | 45.6% below | −£19.80 |
| First month, 20% card (1 in 3) | £110.13 | 27.5% below | +£7.33 |
| First month, 10% card (1 in 2) | £123.89 | 18.5% below | +£20.88 |
| **Expected first month** | | | **+£13.78** |

**Subscribing saves them £11.34 a month.** Note the bigger stack ships in a
cheaper band (£5.50 not £6.50), so the postage per order actually *falls* as the
basket grows.

**Lifetime (6 months): £186.03.**

---

## 6. The same customer, via an influencer's code

Their code guarantees at least 20% off month one, and the partner earns 15% of
net revenue on the first order, then 5% for six months.

**Essentials stack:**

| | They pay | We keep before commission | Commission | **We keep** |
| --- | --- | --- | --- | --- |
| Month 1 (20% floor) | £71.67 | £2.45 | £10.75 | **−£8.30** |
| Months 2+ | £89.58 | £20.10 | £4.48 | **+£15.62** |

**Lifetime via partner: £69.80.** Direct it would have been £107.16 — so the
partner costs £37.36, or **34.9% of the customer**.

**Performance stack:**

| | They pay | Commission | **We keep** |
| --- | --- | --- | --- |
| Month 1 (20% floor) | £110.13 | £16.52 | **−£9.19** |
| Months 2+ | £137.66 | £6.88 | **+£27.57** |

**Lifetime via partner: £128.66** against £186.03 direct — the partner costs
**30.8% of the customer**.

Month one going negative is fine and expected: it is the acquisition cost, and
the subscription pays it back in month two. What matters is that the *lifetime*
is strongly positive, and that the partner's share sits around a third rather
than the two thirds it was before the reprice.

---

## 7. A small basket — under our free-delivery line

**Lumen Vitamin D3 + Flux Electrolytes** — list £16.98, we pay £8.80.

Under £50, so: no bundle discount, and they pay £3.95 postage.

| | |
| --- | --- |
| Customer pays | £20.93 (£16.98 + £3.95 postage) |
| Costs us to ship | £7.87 |
| **We keep** | **£1.68** (8.0%) |

> ⚠️ **Our £3.95 postage charge covers about half what a small parcel costs us
> (£7.87).** We lose £3.92 on delivery for every under-£50 order. Above the free
> line we collect nothing and pay the whole £7.87. That's a deliberate
> marketing cost, but it's bigger than it looks — see §9.

---

## 8. The full waterfall — where every pound goes

Performance stack, subscriber, month 3. This is exactly what the hub renders:

```
Customer pays                                £137.66   →  £137.66
  The shelf price, VAT included.
No VAT charged                                 £0.00   →  £137.66
  Not VAT-registered, so nothing is charged — and nothing can be reclaimed.
Less what PowerBody charge for the goods     −£93.96   →   £43.70
  Their wholesale price plus VAT, which we cannot reclaim.
Less what PowerBody charge to ship it         −£6.72   →   £36.98
  Banded on the £78.30 of wholesale in this order.
  £20.70 more of stock drops it to £0.00.
Less card fees                                −£2.26   →   £34.72
  1.5% + 20p of the gross. VAT-exempt, so nothing to reclaim.
Less returns provision                        −£0.27   →   £34.45
  2% of orders come back. The goods are refunded to us; the shipping never is.
```

**We keep £34.45 — 25.0% of what they paid.**

### What VAT registration would do to that same order

| | Not registered (today) | Registered |
| --- | --- | --- |
| Customer pays | £137.66 | £137.66 *(same shelf price)* |
| VAT to HMRC | £0.00 | **−£22.94** |
| Goods cost us | −£93.96 | −£78.30 *(reclaimed)* |
| Postage costs us | −£6.72 | −£5.60 *(reclaimed)* |
| **We keep** | **£34.45** | **£28.34** |

**Registering costs £6.11 on this order** — about 4.4% of the price. The two
sides largely cancel, but not exactly: you hand over more on sales than you claim
back on costs. That difference is roughly *the VAT rate × your margin*.

---

## 9. The margin floor, and where it bites

No discount can take a product below **cost × 1.15**. Flux Electrolytes — list
£6.99, we pay £3.60, so the floor is £4.14:

| | Asks for | Floor gives | |
| --- | --- | --- | --- |
| Complete subscriber (−20%) | £5.59 | £5.59 | fine |
| …then a 10% card | £5.03 | £5.03 | fine |
| …then a 20% card | £4.47 | £4.47 | fine |
| …then a 40% card | £3.36 | **£4.14** | **floor bites** |

That last row is the fix from this round working. The intro discount used to be
applied *after* the floor had been enforced, so it walked straight past it.

**Flux still doesn't work.** At −23.4% margin it's the product that can't carry
even a share of a delivery, whatever we discount it to. The model says so
plainly: *"Loses money at the bundle price. The honest fix is usually to keep it
off subscription, not to charge more than the market."*

---

## 10. The ladder check

The invariant the hub now enforces on every rung:

> **PASS** — Every bundle beats buying once by at least 5 points, and every rung
> lands the member below RRP.

| Bundle | Buy once | Subscribe | Advantage | Member vs RRP |
| --- | --- | --- | --- | --- |
| Essentials | 8% | 13% | **+5 pts** | 5.8% below |
| Performance | 8% | 15% | **+7 pts** | 8.0% below |
| Complete | 8% | 20% | **+12 pts** | 13.4% below |

---

## Two things these examples turned up

**1. The £3.95 delivery charge is well under cost.** A small parcel costs us
£7.87 and we collect £3.95 — a £3.92 loss on every under-£50 order, on top of
the £7.87 we absorb entirely above the free line. Options: raise the charge
towards £5.95–£6.95, drop the free-delivery threshold so fewer orders sit in the
losing band, or accept it as a deliberate loss-leader that pulls basket size up.
Worth a decision rather than a default.

**2. The anchor doesn't reach cheap products.** Rounding down to .99 swallows the
whole premium below about £12 — Lumen and Flux both list at exactly their RRP.
Rounding down is right (rounding up can turn a saving into a markup), but it
means the "list price sits above RRP" story is only true for the mid and upper
catalogue. Not a bug, but not what the rule claims either.
