# How our pricing works — in plain English

Everything on this page is live in the Founders Hub under **Pricing**. Numbers
come from the model, not from assumption.

**What changed in this round:** list prices are anchored to the supplier's RRP
instead of built up from cost, delivery is costed per *parcel* rather than per
product, and — the big one — **the discount ladder now belongs to the
subscription alone.** Buying once got a laddered discount that quietly beat
subscribing; on the middle bundle it cost members 5 points to subscribe. See
`docs/PRICING_STRATEGY.md` for the full audit.

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

Under our £50 line the customer pays £3.95 — which covers **about half** of what
a small parcel actually costs us (£7.87, because we can't reclaim the VAT
PowerBody charge). So we lose ~£3.92 on postage even on the orders where we
charge for it. Over the £50 line we collect nothing and pay the whole £7.87.

Both are marketing costs rather than fulfilment ones, and both are bigger than
they look. Worth a decision: raise the charge towards £5.95–£6.95, or accept it
as a loss-leader that pulls basket size up. See `docs/PRICING_EXAMPLES.md` §7.

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

**Buy once:** a flat **8% off** any basket over £50, plus free delivery.

**Subscribe:** **13% / 15% / 20%** by bundle size — always a clear step better
than buying once, and the step *grows* with the stack:

| Bundle | Buy once | Subscribe | You save by subscribing |
| --- | --- | --- | --- |
| Essentials | 8% | **13%** | +5 points |
| Performance | 8% | **15%** | +7 points |
| Complete | 8% | **20%** | +12 points |

That gap is the whole point, and it used to be zero or negative. The one-off
discount is deliberately **flat** — when both laddered they collided, and the
one-off tier won.

**Plus, on your first month:** a scratch card averaging 15% (top prize 40%,
~1 in 21).

**Plus, when the partner programme goes live:** the influencer's code raises the
scratch card's floor to 20% — the card still runs and can still pay 40%, the
code just raises the worst outcome. It never stacks on top of a won card.

**Every discount is floored.** No combination can take a product below cost plus
15%, including the scratch card — which used to be the one discount that slipped
past the guardrail.

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
bundle price = list − 13/15/20%    ← what a quiz member actually pays
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
ever sell it as an add-on inside a parcel that's already going out. **Still to
do** — it needs a catalogue change, not a pricing one.

### Most of the catalogue is under target — and that's the target's fault

23 of 24 products come in under the 35% target margin, averaging 12.3%. That
isn't 23 findings, it's one: **resold brands are priced against their own RRP,
and the market won't pay an own-brand margin for them.** Either accept a lower
target on resale, or make the money on bundle size and own-brand lines. The hub
now says this once at the top instead of flagging every row.

---

## 6. Influencer commission

**15% of net revenue on a member's first order, 5% on renewals for 6 months.**
Never on the gross — up to a fifth of that is HMRC's.

It used to be 20% / 10% for 12 months, with the code guaranteeing 25% off month
one. Three problems compounded: the renewal window ran twice as long as a
subscriber actually stays, and the 25% floor was *deeper than the 15% card we
give away anyway* — so a partner's code cost us a bigger discount **and** a
commission on top of it.

The result was that **every partner-attributed order lost money**:

| Order type | Share | Before | After |
| --- | --- | --- | --- |
| One-off, direct | 28% | £12.93 | £14.43 |
| Subscription, direct | 42% | £7.63 | £7.30 |
| One-off, via a partner | 12% | **−£0.77** | **+£3.93** |
| Subscription, via a partner | 18% | **−£0.17** | **+£2.80** |

All four now make money. That is what makes not knowing the partner attribution
rate genuinely safe: whatever share of orders come through partners, the average
stays positive.

---

## 7. Are we losing money on average? No.

You asked for this to be unmistakable in the hub, and it's the first tab:
**"Are we making money?"**

On a representative 3-item basket (£76.10 list, £38.46 of wholesale), after
discounts, commission, postage, VAT, card fees and returns:

| | Before | After |
| --- | --- | --- |
| **Average order keeps** | £6.70 (10.3%) | **£8.08** (12.3%) |
| Average customer, over their life | £21.72 | **£24.63** |
| Commission paid, per order | £2.91 | **£1.97** |

And the sensitivity sweep — how far each lever could move before the *average*
order broke even:

| Lever | Now | Breaks even at |
| --- | --- | --- |
| Orders through partners | 30% | **never** — 0% or 100%, the average stays positive |
| Commission on a first order | 15% | **never** |
| Average subscriber life | 6 months | **never** |
| Average first-month discount | 15% | **never** |
| Biggest bundle discount | 20% | **never** |
| Orders returned | 2% | 68.6% |
| **What PowerBody charge us** | £38.46 | **£47.69** — 24% headroom |

Only two levers can break it, and one of them needs a 34× rise in returns. **The
real risk is supplier cost**, which has 24% of room in it. That is the number to
watch, and it's why not knowing the partner attribution rate isn't a risk worth
worrying about.

### Why "never" is the answer that matters

Under the old settings this table looked similar — but it was measured with two
of the four order types quietly losing money, and with one-off orders priced at
full list because the model never applied their discount. Both are fixed. Every
order type now pays, which is *why* no attribution share can break the average.

---

## 8. Where to look in the hub

| Tab | Question it answers |
| --- | --- |
| **Are we making money?** | Does the average order pay, and what would have to go wrong |
| **The model** | What one product costs and what to sell it for, with every step shown — including how many items share its parcel |
| **Every product** | The same maths across the catalogue, worst first |
| **VAT** | Are we required to register, and what would it cost |
| **The rules** | Every setting, editable, with the reasoning next to it |

Worked examples of every model above — with invented products, and every number
produced by the real code — are in **`docs/PRICING_EXAMPLES.md`**.
