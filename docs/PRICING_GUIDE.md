# How our pricing works — in plain English

Everything on this page is live in the Founders Hub under **Pricing**. Numbers
come from the model, not from assumption.

**What changed in this round:** the bundle ladder came down to 10/15/20, list
prices are now anchored to the supplier's RRP instead of built up from cost, and
delivery is costed per *parcel* rather than per product. Between them those three
took the catalogue from 23 products showing a loss to 1.

---

## 1. The five things that eat a sale

Sell something for £30 and you do not have £30. Five things come out, and only
the first is obvious.

| | What it is | Roughly |
| --- | --- | --- |
| **The goods** | What PowerBody charge us | ~52% of their RRP |
| **Delivery** | What PowerBody charge to ship the parcel | £6.50, £5.50, or free — see below |
| **VAT** | Nothing today. A fifth of every price once we register | 0% now |
| **Card fees** | Stripe's cut | 1.5% + 20p |
| **Returns** | 2% come back; we get the goods, never the postage | ~30p an order |

What's left after all five is **contribution** — the only number that means
anything. Everything in the hub measures margin against it.

---

## 2. Delivery is the thing that decides everything

PowerBody band delivery on **what we pay them for the parcel** — not on weight,
and not on what the customer pays us:

| Our wholesale in the box | They charge us |
| --- | --- |
| up to £50 | **£6.50** |
| up to £99 | **£5.50** |
| over £99 | **free** |

*(Highlands & Islands: £7.99, free over £300.)*

### The box, not the item

This is the single most important sentence on the page, and until this round the
model got it wrong. **Delivery is charged once per parcel.** A product in a
three-item stack carries a third of one delivery, not a whole one.

The model used to price every product as though it were posted on its own. That
added ~£2.60 of phantom postage to every line and made almost the whole catalogue
look unprofitable. It wasn't; the tool was.

| | Priced as if it ships alone | In a 3-item parcel |
| --- | --- | --- |
| Gold Standard Whey 2.27kg | +7% | **+20%** |
| ISO-XP Whey Isolate 1kg | −1% | **+15%** |
| Diet Whey 1kg | −10% | **+12%** |
| Beta-Alanine 500g | −20% | **+14%** |
| Vitamin D3 4000iu | −57% | **+8%** |
| **Whole catalogue** | **−20.5% avg, 23 losing** | **+12.3% avg, 1 losing** |

Nothing about the prices changed between those two columns. Only what each
product was asked to carry.

The **model** tab now has an *"in a parcel of N items"* box so you can see this
directly. Set it to 1 for the worst case; the default matches what the quiz
actually sells.

### Chase the next band, not the free line

£99 of wholesale is roughly a **£190 basket**. Almost no order gets there, so
"add £60 more and it ships free" is true and useless. The step from £6.50 to
£5.50 at **£50 of wholesale** — about a £95 basket — is reachable, often with one
more product. The hub now shows both, next band first.

**The pattern that still holds:** things that last two or three months work
better than monthly things, because one delivery gets spread across the months
instead of landing every month.

> ⚠️ The Dropshipping Guide quoted different rates — weight bands of £3.25–£5.17,
> and said free delivery was *not* available to dropshippers. The rates above are
> what the account actually shows. **Worth confirming with PowerBody**, because
> the small-order cost doubled and the large-order cost went to zero.

### Our free delivery is a different thing

We give the customer free delivery over £50 **of our retail prices**. PowerBody's
thresholds are on **their wholesale values**. Different numbers, different
bases — they are not related, and crossing them is how a margin model starts
believing postage is free.

Under our £50 line the customer's £3.95 roughly covers PowerBody's charge. Over
it we collect nothing and still pay them — on every qualifying order. That's the
cost of the promise, and it's a marketing cost, not a fulfilment one.

---

## 3. VAT — you're right, it largely cancels out

**Not registered (today):** we charge no VAT, so we keep the whole shelf price.
But we can't reclaim the VAT PowerBody charge us, so their £10 of stock really
costs £12 and their £6.50 delivery really costs £7.80.

**Registered (later):** we hand over a fifth of every sale, but reclaim theirs.

They *do* largely offset — but not exactly. Registering costs you **the VAT rate
times your margin**, not times your revenue:

```
registering costs ≈ 20% × (what you keep after paying for stock)
```

The trap is that the VAT we're eating is a big visible number that makes
registering look like a saving. It isn't: you'd hand over more on sales than
you'd claim back on costs. Staying unregistered is right until turnover forces
it — the **VAT tab** tracks the £90,000 threshold and projects when that lands.

---

## 4. What the customer gives up and gets

**Three discounts, and they stack:**

1. **Subscribe & save** — **10% / 15% / 20%** by bundle size *(was 15/20/25 —
   you said 25% was too deep, and it was)*
2. **First month** — a scratch card averaging 18% (top prize 50%, ~1 in 21)
3. **Free delivery** over £50 of our prices

**Plus, when the partner programme goes live:** the influencer's code raises the
scratch card's floor to 25% — the card still runs and can still pay 50%, the
code just raises the worst outcome. It never stacks on top of a won card.

---

## 5. Where prices come from — solved

You said individual prices can sit higher because people buy through the quiz and
should feel they got a bargain. That's exactly right, and it's now how the model
works.

**Before:** cost-plus. Add up the five costs, apply a target profit, work
backwards. That produced prices roughly **double PowerBody's own RRP** — £118 for
a whey they say should retail at £64.99. Nobody buys that, and an unsellable
price loses money just as surely as a thin one.

**Now:** the market sets the price and we anchor to it.

```
list price   = RRP + 8.2%          ← the anchor, what a single unit costs
bundle price = list − 15%          ← what a quiz member actually pays
the bargain  = ~8% BELOW RRP       ← real, and checkable in ten seconds
```

**The one lever is the saving, not the premium.** You set "members should end up
~8% under RRP" and the premium is *derived* from it. That sounds fussy and isn't:
setting both by hand lets you pick a pair that don't work — a 30% premium with a
15% bundle discount lands the member *above* RRP, turning the bargain into a
markup. The hub makes that impossible, and warns you if you ask for a saving
deeper than the bundle discount can deliver.

Worked example:

| | |
| --- | --- |
| Gold Standard Whey — PowerBody RRP | £64.99 |
| Our list price (the anchor) | **£69.99** |
| What a quiz member pays on the middle bundle | **£59.49** |
| What they save against a price they can look up | **8.5%** |

**Cost-plus didn't disappear — its job changed** from *"what should we charge?"*
to *"at that price, do we still make money?"* It's now the floor, and it flags
the products where the answer is no.

### Are the prices still too high?

No. The catalogue averages **+8.2% over RRP** on singles, and a member on a
bundle lands **9.8% below RRP**. The old cost-plus model averaged +111%.

### One product genuinely doesn't work

GO Hydro Electrolyte Tablets: £6.49 RRP, and it can't absorb even a third of a
£6.50 delivery. At −15% it's the only loss left in the catalogue, and no amount
of bundling fixes it. The honest answer is to keep it off subscription, or only
ever sell it as an add-on inside a parcel that's already going out.

### Most of the catalogue is under target — and that's the target's fault

23 of 24 products come in under the 35% target margin, averaging 12.3%. That
isn't 23 findings, it's one: **resold brands are priced against their own RRP,
and the market won't pay an own-brand margin for them.** Either accept a lower
target on resale, or make the money on bundle size and own-brand lines. The hub
now says this once at the top instead of flagging every row.

---

## 6. Influencer commission

**20% of net revenue on a member's first order, 10% on renewals for 12 months.**
Never on the gross — up to a fifth of that is HMRC's.

Blended over a six-month subscriber that's 11.3%. Across the whole book at 30%
attribution it's about **£3.10 an order** — the headline 20% is a per-order rate,
not a business-wide cost, and the two get confused constantly.

**One thing to watch.** At these settings a subscription taken *through a partner
code* is roughly break-even over its whole life:

| Order type | Share | Member pays | We keep |
| --- | --- | --- | --- |
| One-off, direct | 28% | £76.10 | **£20.43** (26.9%) |
| Subscription, direct | 42% | £63.11 | **£7.63** (12.1%) |
| One-off, via a partner | 12% | £76.10 | **£5.21** (6.9%) |
| Subscription, via a partner | 18% | £62.35 | **−£0.17** (−0.3%) |

That last row is the partner intro floor (25% on month one) landing on top of the
bundle discount, then 20% commission on the discounted total. It's break-even,
not a hole — but if partner attribution climbed well past 30% it's the number
that would start to bite. The lever to pull first is the intro floor, not the
commission rate.

---

## 7. Are we losing money on average? No.

You asked for this to be unmistakable in the hub, and it's the first tab:
**"Are we making money?"**

On a representative 3-item basket (£76.10 list, £38.46 of wholesale), after
discounts, commission, postage, VAT, card fees and returns:

| | |
| --- | --- |
| **Average order keeps** | **£9.52** (14.0% of net revenue) |
| Average customer, over their life | **£22.85** |
| Commission paid, per order | £3.10 |

And the sensitivity sweep — how far each lever could move before the *average*
order broke even:

| Lever | Now | Breaks even at |
| --- | --- | --- |
| Orders through partners | 30% | **never** — 0% or 100%, the average stays positive |
| Commission on a first order | 20% | **never** |
| Average subscriber life | 6 months | **never** |
| Average first-month discount | 18% | **never** |
| Biggest bundle discount | 20% | **never** |
| Orders returned | 2% | 62.8% |
| **What PowerBody charge us** | £38.46 | **£46.92** — 22% headroom |

Only two levers can break it, and one of them needs a 30× rise in returns. **The
real risk is supplier cost**, which has 22% of room in it. That is the number to
watch, and it's why not knowing the partner attribution rate isn't a risk worth
worrying about.

---

## 8. Where to look in the hub

| Tab | Question it answers |
| --- | --- |
| **Are we making money?** | Does the average order pay, and what would have to go wrong |
| **The model** | What one product costs and what to sell it for, with every step shown — including how many items share its parcel |
| **Every product** | The same maths across the catalogue, worst first |
| **VAT** | Are we required to register, and what would it cost |
| **The rules** | Every setting, editable, with the reasoning next to it |
