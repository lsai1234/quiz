# How our pricing works — in plain English

Everything on this page is live in the Founders Hub under **Pricing**. Numbers
come from the model, not from assumption.

**The whole thing in three lines:**

1. **Every price is what we pay, doubled** (rounded down to .99).
2. **Buy once: 8% off** over £50. **Subscribe: 13 / 15 / 20%** by bundle size.
3. **Nothing is ever sold below cost plus 15%**, whatever the discounts add up to.

---

## 0. The cut-offs — what we can afford to sell

If you only look at one thing, look at these. Everything else on this page is
the working behind them.

| | Floor | Enforced by |
| --- | --- | --- |
| The cheapest single thing we can sell | **£12** | *Smallest order we accept* |
| The smallest one-off order worth taking | **£12** | *Smallest order we accept* |
| The smallest monthly plan that pays for itself | **£36** | — |
| The smallest plan that survives the scratch card | **£40** | *Minimum to subscribe* |

### Two different tests, and the difference matters

**A one-off has to pay every single time.** There's no renewal behind it, no
second chance — so if the checkout lets someone buy a £6 tub, we lose the
difference between what they pay and what the parcel costs. That's a hard floor,
and it's why nothing under £12 can be sold on its own: no order that small can
carry a £7.87 parcel, whatever is in it.

**A subscription only has to pay across its life.** The scratch card is
*supposed* to lose money on month one — that's rationed marketing, priced into
the blend, and holding it to break-even would mean having no intro offer at all.
So a plan is judged over six months: first month at the average card, then
renewals. It has to average out, not clear zero every month.

Getting these the wrong way round is expensive in both directions. Apply the
one-off rule to subscriptions and you kill the offer; apply the subscription rule
to one-offs and you bleed quietly.

### What this found

**The minimum to subscribe was set to £25.** A £25/month plan on the deepest
bundle rate does not cover its own goods and postage — we were offering, and
honouring, subscriptions that lose money on every renewal. It's now **£40**, and
the hub flags the setting the moment it drops below the computed floor.

There was also **no minimum order value at all**, so a single £5.99 item could be
bought on its own at a £1.75 loss. That's now £12.

---

Everything below is detail behind those.

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

### What we charge the member — a second ladder

PowerBody's ladder bands on **their wholesale values**; ours bands on **our
retail total**. Different numbers, different bases, and crossing them is how a
margin model starts believing postage is free.

So there are two ladders, deliberately shaped to line up
(`delivery.customerRates`, editable on the Pricing page beside the supplier one):

| Basket (retail) | Member pays | Costs us (Zone 1) | We absorb |
|---|---|---|---|
| under £40 | £4.95 | £7.80 | £2.85 |
| £40–£99 | £2.95 | £7.80 | £4.85 |
| £100–£198 | free | £6.60 | £6.60 |
| £198+ | free | £0.00 | £0.00 |

Plus a **£2.95 Highlands & Islands surcharge**, applied on every band including
the free one — PowerBody's Zone 2 free line is £300 of wholesale (roughly a £600
basket), so our cost genuinely never goes away up there.

**Why the free line sits at £100 and not lower.** It used to be £60, while our
own cost did not step down until ~£100 of retail and did not vanish until ~£198.
Every order in between shipped free and cost us the full £7.80 — the single worst
basket in the business was one that had just *earned* free delivery. The free
line now sits where their band steps down, so the point we stop charging is the
point it starts costing us less. `customer-rates.test.ts` pins that alignment.

What we still carry between £100 and £198 is a deliberate, bounded absorption:
delivery is a cost recovery, not a product, and a ladder that fully recovered
postage would price the small baskets out. The tests also assert we never collect
*more* than the parcel costs — if that ever needs to change it is a margin
decision worth saying out loud rather than hiding in a postage line.

**At a one-off checkout**, Stripe fixes its shipping options when the session is
created — before the customer has typed an address — so a rate cannot react to
their postcode. They pick mainland or Highlands themselves, and the fulfilment
queue flags a mainland rate paid on a Highlands postcode (`deliveryShortfall`)
rather than trusting the pick.

**On a subscription there is no pick at all.** Stripe accepts `shipping_options`
in payment mode only; a subscription Session carrying them is refused outright,
and for a while that refusal was every subscription checkout — the member signed
in, their plan saved, and the payment never started. Postage rides as a second
recurring line item instead (`recurringDeliveryOption`), at the **mainland**
rate, which is the number the plan receipt already quoted them and the one ~96%
of orders would have chosen. A Highlands subscriber therefore pays a mainland
rate; that is the same position as a one-off buyer who picks the cheaper option,
and the queue's shortfall flag is where it shows up.

**Different speeds** would need PowerBody to sell more than one service. Their
rate card reads as one per zone; `GET /api/portal/supplier/shipping-methods`
asks their `getShippingMethod` directly, and until it returns two, delivery
options can only be prices we set.

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

**Plus, on an influencer's code:** 25% off the regular price — *instead of* the
bundle deal or the first month of Subscribe & Save, never on top of one. Every
discount it replaces is shallower than 25%, so a code always leaves someone
better off than they were; the price takes the deeper of the two, so it can
never do the reverse. Codes work on stacks, curated bundles and subscriptions,
not on single products from the shop.

**Every discount is floored.** No combination can take a product below cost plus
15%, including the scratch card — which used to be the one discount that slipped
past the guardrail.

### The three depths cost the same whoever takes the quiz

Essentials, Balanced and Complete are **price brackets, not product counts**:

| Depth | Monthly subscription |
| --- | --- |
| Essentials | up to **£35** |
| Balanced | **£35–£55** |
| Complete | **£55–£80** |

The engine builds one ranked stack and each depth is filled with the most
relevant products that fit its bracket, so the *number* of products is what
changes between two members — not the price. It used to be the other way round:
the depths were fixed at 3 / 5 / 7 products, which made "Essentials" mean £26 to
one member and £68 to another, and put Complete anywhere between £50 and £120.
Two people comparing notes on the same three options were looking at two
different shops.

Three things the brackets are not allowed to do:

- **Drop something the stack is for.** A product the quiz marked required — a
  bulking member's mass builder at £37/month — is in every depth even when it
  alone costs more than the bracket. Same for anything the member added
  themselves.
- **Fake a choice.** A small stack can run out of products before it runs out of
  brackets. Rather than show the same list twice, or two prices eight pence
  apart, it offers two depths, or one.
- **Disagree with the till.** The price on the depth card is produced by the
  same `calculatePricing` call the checkout bills from.

The brackets live in `src/lib/quiz-core/tiers.ts` (`TIER_PRICE_BANDS`) and the
fill is `src/lib/stack-blueprint/tier-plan.ts`. Anything a depth can't fit stays
on the results page as an upgrade, so the member chooses to go above £80 rather
than being shown it.

---

## 5. Where prices come from — one rule

**Every price is what we pay, doubled, rounded down to .99.** That's it.

```
Titan Whey: PowerBody charge us £31.00  →  we sell it at £61.99
```

### Why not the brand's RRP

It used to be. Prices were worked backwards from PowerBody's recommended retail
price, and that produced sensible numbers — but it meant **every price in the
shop depended on somebody else's suggestion.** An RRP isn't a fact: it varies by
brand, PowerBody can change it, and plenty of products don't carry one at all.
A feed update could quietly reprice the catalogue.

Doubling what we pay lands in almost the same place anyway. Across the catalogue
their RRP is about **1.94× their wholesale**, so ×2 puts us within a few percent
of the market — we just get there by a rule we own and can explain in a sentence.

### RRP is now the check, not the driver

Where a brand does publish one, the hub compares our price against it and flags
anything more than 15% above. A check can only ever raise a flag; a driver
silently sets every price in the shop. **4 of 24 products** currently sit above
their brand's RRP — worth a look, not an emergency.

### What this exposed

Under the old rule, 1 product lost money. Under this one, **4 do** — and that is
the rule telling the truth rather than a step backwards.

| Product | We pay | We charge | Subscriber pays | We keep |
| --- | --- | --- | --- | --- |
| GO Hydro Electrolytes | £3.20 | £5.99 | £5.09 | **−£1.75** |
| Vitamin D3 4000iu | £4.00 | £7.99 | £6.79 | **−£0.34** |
| Vitamin C 1000mg | £5.00 | £9.99 | £8.49 | **−£0.19** |
| Daily Multivitamin | £6.00 | £11.99 | £10.19 | **−£0.03** |

All four are cheap vitamins, and the problem is the same one every time: a
product carrying a **£2.62 share of the postage** needs to be worth more than
about £12 to survive it. The old RRP rule hid three of these because those
brands happen to recommend a generous retail price relative to what they charge
us — Vitamin D3 costs £4.00 and its RRP is £9.99, so pricing off RRP made it
look fine when the postage says otherwise.

**They aren't bad products, they're bad *subscription lines*.** The fix is to
sell them as add-ons to a box that's already going out, not as stack items.

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

| | |
| --- | --- |
| **A typical order** | £76.85 |
| **We keep** | **£8.69** (13.1%) |
| A customer, over 6 months | **£27.01** |

And all four kinds of order pay their way:

| Order type | Share | We keep |
| --- | --- | --- |
| Subscription, direct | 42% | £7.90 |
| One-off, direct | 28% | £15.11 |
| Subscription, via a partner | 18% | £3.36 |
| One-off, via a partner | 12% | £4.50 |

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

Three tabs, and that's deliberate — it used to be five and they buried each
other.

| Tab | Question it answers |
| --- | --- |
| **Overview** | The cut-offs first — what we can afford to sell — then what a typical order makes us and what a customer is worth |
| **Products** | What we pay, what we charge, and what we keep on every product — worst first |
| **Rules** | Every setting, editable, with what it does written next to it |

The deep modelling — the weighted average-order model, the break-even sweeps,
the full cost waterfall, the VAT projection — is all still there, behind a
**"show the working"** link on the first two tabs. It's there when you want it
and out of the way when you don't.

Worked examples of every model above — with invented products, and every number
produced by the real code — are in **`docs/PRICING_EXAMPLES.md`**.
