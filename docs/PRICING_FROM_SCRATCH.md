# Pricing, from scratch

Everything we pay, everything we charge, and a simple starting point.

All figures are **UK mainland (Zone 1)** and assume prices at **double what we
pay**. The Highlands & Islands cost a bit more and are handled separately at the
end.

---

## The one thing to get straight first

There are **two completely different £50s** in this business, and mixing them up
is what went wrong in my last few write-ups.

| | Measured on | Threshold |
| --- | --- | --- |
| **What PowerBody charge us** | what **we spend with them** in one parcel | £50 / £99 |
| **What we charge the customer** | what **the customer spends** | £50 |

Since we price at ×2, our spend is roughly **half** the retail price. So
PowerBody's £50 and £99 bands land at **£100 and £198 of retail**, not £50 and
£99. Everything below follows from that.

---

## Part 1 — What PowerBody charge us to ship

Their Zone 1 standard delivery, banded on our order amount:

| What we spend with them | They charge us | Inc. VAT we can't reclaim |
| --- | --- | --- |
| Up to £50 | £6.50 | **£7.80** |
| Up to £99 | £5.50 | **£6.60** |
| Over £99 | **free** | **£0** |

### The same thing, in retail money

| The customer's basket | We spend | We pay to ship |
| --- | --- | --- |
| Under £100 | under £50 | **£7.80** |
| £100 – £198 | £50 – £99 | **£6.60** |
| Over £198 | over £99 | **£0** |

Two consequences, and they drive everything:

- **Postage doesn't care what the product costs.** A £3 tub and a £40 tub cost
  the same to send. That's why cheap products are hard.
- **Free shipping needs a ~£200 basket.** Not £99. It's reachable on a quarterly
  stack shipment; it is essentially never reachable monthly.

---

## Part 2 — What we charge the customer

| Their basket | They pay for delivery |
| --- | --- |
| Under £50 | **£3.95** |
| £50 or more | **Free** |

### So what does delivery actually cost us?

| Their basket | We collect | We pay | **Net** |
| --- | --- | --- | --- |
| Under £50 | £3.95 | £7.80 | **−£3.85** |
| **£50 – £100** | **£0** | **£7.80** | **−£7.80** ← worst |
| £100 – £198 | £0 | £6.60 | **−£6.60** |
| Over £198 | £0 | £0 | **£0** |

> ### The £50–£100 band is the expensive one
>
> Our free-delivery promise starts at **£50**, but our own cost doesn't drop
> until **£100**. So there's a band where we've stopped collecting anything and
> are still paying the full £7.80 — the worst of both. And it's a band a lot of
> orders will sit in.
>
> Moving our free-delivery line to £100 would line the two up. Across a spread of
> basket sizes it's worth about **£1.17 more per order** (£30.62 → £31.79). Not
> huge, but it's free money for a promise most customers wouldn't miss — a £75
> basket paying £3.95 postage is a normal shopping experience.

---

## Part 3 — The other three costs

### Goods

PowerBody's wholesale price **plus 20% VAT we can't reclaim** (we're not
registered). Their £10 costs us £12.

### Card fees

Stripe: **1.5% + 20p** of whatever the customer pays.

### Returns

About **2 in 100** orders come back. Goods refunded, postage never. Spread across
all orders, roughly **30p each**.

### Put together

| Customer pays | They add postage | Goods | Postage | Card | Returns | **We keep** |
| --- | --- | --- | --- | --- | --- | --- |
| £20 | £3.95 | £12.00 | £7.80 | £0.56 | £0.31 | **£3.28** |
| £40 | £3.95 | £24.00 | £7.80 | £0.86 | £0.31 | **£10.98** |
| £62 | £0 | £37.20 | £7.80 | £1.13 | £0.31 | **£15.56** |
| £120 | £0 | £72.00 | £6.60 | £2.00 | £0.26 | **£39.14** |

---

## Part 4 — Every discount we give

| Discount | What it is | Applies to |
| --- | --- | --- |
| **Bundle** | 8% off | One-off orders over £50 |
| **Subscribe & save** | 13% / 15% / 20% | By stack size (3 / 5 / 7 products) |
| **First month** | Scratch card: 40% (1 in 21), 20% (1 in 3), 10% (1 in 2) — averages **15%** | New subscribers |
| **Free delivery** | Worth £3.95 | Orders over £50 |
| **Partner code** | At least 20% off month one | Influencer referrals |
| **The floor** | Never below **cost + 15%**, whatever the discounts add up to | Everything |

The rule tying them together: **subscribing always beats buying once**, by 5, 7
and 12 points as the stack grows.

---

## Part 5 — Bundles

| Stack | Products | Subscribe & save |
| --- | --- | --- |
| Essentials | 3 | 13% |
| Performance | 5 | 15% |
| Complete | 7 | 20% |

Plus a **budget cap** — say "under £50" and the quiz won't build past £50.

Everything ships in **one box**, so a 3-item stack pays one postage, not three.
That's the whole reason the quiz model works.

---

## Part 6 — Should pricing be ×2, or "×something + a fixed amount"?

Our costs are two different shapes: **goods scale** with price, **postage
doesn't**. A proportional markup only earns more on dearer products while
postage stays flat — so cheap products can't cover it. A fixed adder fixes
exactly that. Here's what each does:

| We pay | ×2 | we keep | ×1.7 + £4 | we keep | Brand RRP | Adder vs RRP |
| --- | --- | --- | --- | --- | --- | --- |
| £3 | £6.00 | **−£2.11** | £9.10 | +£0.94 | £5.82 | **+56%** |
| £4 | £8.00 | **−£1.34** | £10.80 | +£1.42 | £7.76 | **+39%** |
| £5 | £10.00 | **−£0.57** | £12.50 | +£1.89 | £9.70 | **+29%** |
| £8 | £16.00 | +£1.74 | £17.60 | +£3.32 | £15.52 | +13% |
| £12 | £24.00 | +£4.82 | £24.40 | +£5.21 | £23.28 | +5% |
| £20 | £40.00 | +£10.98 | £38.00 | +£9.01 | £38.80 | −2% |
| £31 | £62.00 | +£15.56 | £56.70 | +£10.34 | £60.14 | −6% |
| £40 | £80.00 | +£22.49 | £72.00 | +£14.61 | £77.60 | −7% |

### Stay proportional

The fixed adder **works on paper and fails in a shop.** It makes every product
profitable — but lands cheap ones **29–56% above what the brand itself
recommends**, while giving away margin on the dear ones where we didn't need to.
It's biggest as a percentage exactly where the market is tightest. Nobody pays
£9.10 for a £6 tub.

> **A cheap product cannot carry a £7.80 parcel at any price the market accepts.
> No pricing formula fixes that — only not shipping it alone does.**

Which is your instinct: a minimum order, and keeping tiny items out of the quiz
as standalone lines.

---

## Part 7 — The floors

| | Cheapest that works |
| --- | --- |
| A product sold **on its own** (also: the smallest one-off order) | **£11.50** |
| A product as **one line in a 3-item box** | **£8.00** |
| A **monthly plan**, renewals only | **£18.80/mo** |
| A **monthly plan** across its whole life, including the scratch card | **£21.20/mo** |

The last two are gentler on purpose. A one-off has nothing behind it, so it has
to pay every time. A subscription is judged over its life, because the top
scratch card is *supposed* to lose on month one — that's rationed marketing.

---

## Part 8 — The rules, as shipped

Six rules. That's the whole model.

| | |
| --- | --- |
| **1. Price** | what we pay **× 2**, rounded down to .99 |
| **2. Minimum order** | **£15** — enforced at checkout and in the cart API |
| **3. Quiz floor** | nothing under **£8** gets a slot in a stack; cheaper products are add-ons |
| **4. Delivery** | **£3.95** under £60, **free** at £60+ — qualified on the subtotal, before any discount |
| **5. Discounts** | 8% one-off over £50 · subscribe & save 13/15/20 · first-month card averaging 15% |
| **6. Minimum subscription** | **£25/month** |

### Two tests, not one

**A one-off must pay every time.** Nothing behind it. The £15 minimum is a hard
refusal, not a warning — the checkout and the cart API both reject a smaller
basket.

**A subscription only has to pay over its life.** The scratch card is meant to
lose on month one; the floor no longer caps it, so a 40% card really is 40% off
and really does lose money. What has to hold is the six-month total.

### A typical 3-item box (£76.85), every route

| Route | They pay | We keep |
| --- | --- | --- |
| Bought on its own | £76.85 | **£21.17** |
| In a basket over £50 (−8%) | £70.70 | **£15.11** |
| Subscriber, months 2+ | £61.48 | **£6.03** |
| First month, averaged across the card | £52.11 | −£3.20 *(allowed)* |
| **A whole subscription, over 6 months** | £359.51 | **£26.95** |
| Worst case: 40% card, 1 in 21 | £36.89 | −£18.19 *(allowed)* |

### The floors, computed

| | Floor | Enforced by |
| --- | --- | --- |
| Cheapest single thing we can sell | £12 | Minimum order (£15) |
| Smallest one-off order worth taking | £12 | Minimum order (£15) |
| Smallest monthly plan that pays for itself | £19.20 | — |
| Smallest plan that survives the scratch card | £21.60 | Minimum to subscribe (£25) |

---

## What was dropped

- **The 35% target margin.** Unreachable on resold brands, so every screen
  comparing against it read "everything is failing". Real margins are 10–25%.
- **The average-order model, break-even sweeps and case tables.** Replaced by the
  scenario list above: same question, but you can read the answer instead of
  reconstructing it.
- **The RRP cross-check.** A flag nobody acted on.
- **The cost-plus "good price" model.** Superseded by ×2.

---

## Zone 2 (Highlands & Islands)

£7.99 flat, free over £300 of our spend — so effectively never free. About 4% of
UK addresses, adding roughly 7p to an average order's postage.
