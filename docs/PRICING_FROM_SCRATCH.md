# Pricing, from scratch

Everything we pay, everything we charge, and a simple starting point. No jargon,
no models — just the numbers and what they mean.

---

## Part 1 — What an order actually costs us

Four things. That's all there is.

### 1. The goods

PowerBody charge us a wholesale price, and they add 20% VAT on top. **We can't
claim that VAT back** (we're not VAT-registered), so it's a real cost.

> A product they charge us **£10** for actually costs us **£12**.

### 2. The postage

PowerBody charge us **once per parcel**, based on what we've spent with them in
that box — not on weight, not on what the customer pays.

| What we spend with them, in one box | They charge us | Real cost to us (+VAT) |
| --- | --- | --- |
| Up to £50 | £6.50 | **£7.87** |
| £50 – £99 | £5.50 | **£6.60** |
| Over £99 | free | **£0** |

Two things follow from this, and they drive nearly everything:

- **Postage doesn't care how expensive the product is.** A £3 tub and a £40 tub
  cost the same to send. That's why cheap products are hard.
- **Three products in one box cost the same to send as one.** That's why the
  quiz selling a stack is worth so much.

### 3. Card fees

Stripe take **1.5% + 20p** of whatever the customer pays. On a £50 order that's
95p. No VAT to reclaim on it.

### 4. Returns

About **2 in 100** orders come back. We get the goods refunded but never the
postage — out and back. Spread across all orders that's roughly **30p an order**.

### Put together

| A customer spends | They also pay postage | Goods cost us | Postage costs us | Card | Returns | **We keep** |
| --- | --- | --- | --- | --- | --- | --- |
| £20 (one item) | £3.95 | £12.00 | £7.87 | £0.56 | £0.31 | **£3.21** |
| £40 (one item) | £3.95 | £24.00 | £7.87 | £0.86 | £0.31 | **£10.91** |
| £80 (one item) | £0 *(over £50)* | £48.00 | £7.87 | £1.40 | £0.31 | **£22.42** |

Note the middle column: the customer stops paying postage at £50, but our cost
doesn't change — a £40 wholesale spend is still in PowerBody's cheapest band.

---

## Part 2 — Shipping: both sides of it

These are two completely separate numbers and mixing them up is the single
easiest way to get pricing wrong.

### What we pay PowerBody

Banded on **our wholesale spend in the box** — the table above. £7.87 for a small
parcel, £6.60 for a medium one, free once we've spent £99 with them.

### What we charge the customer

| Their order | They pay for delivery |
| --- | --- |
| Under £50 | **£3.95** |
| £50 or more | **Free** |

### So what does delivery really cost us?

| Their order | We collect | We pay | **Net** |
| --- | --- | --- | --- |
| Under £50 | £3.95 | £7.87 | **−£3.92** |
| £50 – ~£100 | £0 | £6.60 | **−£6.60** |
| Big enough that we spend £99+ with PowerBody | £0 | £0 | **£0** |

**Delivery always costs us something except on very big orders.** The £3.95 we
charge covers about half of a small parcel. That's a deliberate choice — it keeps
the price attractive — but it's worth knowing it isn't covering its cost.

> ⚠️ **I got this wrong last time.** Some of the numbers I gave you assumed we
> absorbed the postage even on orders under £50, where we actually charge £3.95.
> That made small subscriptions look far worse than they are. Corrected figures
> are in Part 5.

---

## Part 3 — Every discount we currently give

| Discount | What it is | Applies to |
| --- | --- | --- |
| **Bundle** | 8% off | Any one-off order over £50 |
| **Subscribe & save** | 13% / 15% / 20% | By stack size (3 / 5 / 7 products) |
| **First month** | Scratch card: 40% (1 in 21), 20% (1 in 3), 10% (1 in 2) — averages **15%** | New subscribers only |
| **Free delivery** | Worth £3.95 | Orders over £50 |
| **Partner code** | Guarantees at least 20% off month one | When someone uses an influencer's link |
| **The floor** | Nothing is ever sold below **cost + 15%**, whatever the discounts add up to | Everything |

The one rule tying these together: **subscribing always beats buying once**, and
by more as the stack gets bigger — 5, 7 and 12 points respectively.

---

## Part 4 — Bundles

The quiz builds one of three stacks:

| Stack | Products | Subscribe & save |
| --- | --- | --- |
| Essentials | 3 | 13% |
| Performance | 5 | 15% |
| Complete | 7 | 20% |

Plus a **budget cap** — if someone says "under £50" the quiz won't build them a
stack that costs more than £50.

The important bit is the postage. Everything in a stack ships in **one box**, so
a 3-item stack pays one £7.87 postage, not three. That's the whole reason the
quiz model works and single-product sales struggle.

---

## Part 5 — Should pricing be ×2, or "×something + a fixed amount"?

This is the right question, because **our costs are two different shapes**:

- The **goods** scale with price (a dearer product costs us more).
- The **postage** doesn't (£7.87 whatever's in the box).

A purely proportional markup only earns more on dearer products, while the
postage stays flat — so cheap products can't cover it. A fixed adder would fix
exactly that. Here's what each actually does:

| We pay | ×2 → price | we keep | ×1.7 + £4 → price | we keep | Typical brand RRP | ×1.7+£4 vs RRP |
| --- | --- | --- | --- | --- | --- | --- |
| £3 | £6.00 | **−£2.18** | £9.10 | +£0.87 | £5.82 | **+56%** |
| £4 | £8.00 | **−£1.41** | £10.80 | +£1.35 | £7.76 | **+39%** |
| £5 | £10.00 | **−£0.64** | £12.50 | +£1.82 | £9.70 | **+29%** |
| £8 | £16.00 | +£1.67 | £17.60 | +£3.25 | £15.52 | +13% |
| £12 | £24.00 | +£4.75 | £24.40 | +£5.14 | £23.28 | +5% |
| £20 | £40.00 | +£10.91 | £38.00 | +£8.94 | £38.80 | −2% |
| £31 | £62.00 | +£15.49 | £56.70 | +£10.27 | £60.14 | −6% |
| £40 | £80.00 | +£22.42 | £72.00 | +£14.54 | £77.60 | −7% |

### The answer: stay proportional

The fixed adder **works on paper and fails in a shop.** It makes every product
profitable — but it lands cheap products **29–56% above what the brand itself
recommends**, which nobody will pay, while simultaneously giving away margin on
the expensive products where we didn't need to.

That's the trap: the fixed adder is biggest as a *percentage* exactly where the
market is tightest. A £3 tub has a £6-ish market price. You cannot charge £9.10
for it, whatever the spreadsheet says.

**So the real conclusion isn't about the formula at all:**

> A cheap product cannot carry a £7.87 parcel at any price the market accepts.
> No pricing rule fixes that. Only not shipping it alone does.

Which is exactly your instinct — a minimum order, and keeping tiny items out of
the quiz as standalone lines.

### The two floors, at ×2

| | Cheapest that works |
| --- | --- |
| A product sold **on its own** | **£12** retail (£6 wholesale) |
| A product as **one line in a 3-item stack** | **£8** retail (£4 wholesale) |

---

## Part 6 — A simple starting point

Six rules. That's the whole model.

### 1. Price = what we pay × 2, rounded down to .99

A £10 product sells at £19.99. Nothing else feeds into it — not the brand's RRP,
not a target margin. If we later want to be dearer or cheaper, we change one
number.

### 2. Minimum order £12

Below that, no order can carry its own parcel. Enforced at checkout, not just
advised.

### 3. Nothing under £8 goes in the quiz as a standalone line

Products cheaper than that only work as an extra in a box already going out.
They can still be sold — as add-ons, never alone.

### 4. Delivery: £3.95 under £50, free at £50+

Unchanged. Worth knowing it costs us £3.92–£6.60 an order either way; that's a
marketing cost we're choosing.

### 5. Discounts: 8% one-off, 13/15/20 subscribe, first-month card averaging 15%

Unchanged, and the one thing to protect is that **subscribing always beats buying
once** by a visible margin.

### 6. Minimum subscription £25/month

**Correction:** I raised this to £40 last time based on a calculation that
wrongly assumed we absorbed postage on sub-£50 plans. The real floors are:

| | Corrected | What I said before |
| --- | --- | --- |
| Renewals cover their costs from | **£19.20/month** | £36 |
| Whole plan survives the scratch card from | **£21.60/month** | £40 |

So £25 was fine all along and £40 is turning away subscriptions that would have
made money. **This needs changing back.**

---

## What I'd drop

- **The 35% target margin.** It isn't reachable on resold branded goods and every
  screen comparing against it just says "everything is failing", which is noise.
  Real margins are 10–25% and that's the honest number.
- **The average-order model, break-even sweeps and case tables.** Already hidden
  behind "show the working" — I'd delete them rather than maintain them.
- **The RRP cross-check.** Useful once, when we were pricing off RRP. Now that we
  price from cost it's a column nobody acts on.

---

## What still needs a decision from you

1. **Is ×2 the right multiple?** It gives 10–25% margin depending on the product.
   ×1.9 is cheaper and thinner, ×2.1 dearer and fatter. The floors move with it.
2. **The £40 subscription minimum** — confirm I should put it back to £25.
3. **The top scratch card says 40% but the floor only allows 42.5% total**, so a
   Complete subscriber winning it gets less than the card promises. Either bring
   the card to 25% or accept selling that month nearer cost.
