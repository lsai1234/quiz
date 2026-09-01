# Founders Hub — structure, pricing model, and the supplier review queue

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

This is the current shape of the hub. Where an older phase spec
(`PHASE6_PORTAL_SPEC.md`, `POWERBODY_STRIPE_PLAN.md`, `BUNDLES_SPEC.md`,
`PRODUCT_CHANGES_SPEC.md`, `SUBSCRIPTIONS.md`) names a `/founderhub/*` route, this
document supersedes it — those specs record what was built at the time and are
left as history rather than rewritten.

**The hub moved.** With the site now on the apex domain `getchrgd.co.uk`, the
whole tree moved `/portal/*` → `/founderhub/*` (and the customer hub `/hub` →
`/myhub`). Every route below is written in the new form. Old paths still land in
the right place — `next.config.ts` redirects them — but nothing links to them
any more. The API routes did **not** move: they are still `/api/portal/*` and
`/api/hub/*`, because nobody types those and renaming them buys nothing.

---

## 1. Navigation

The top bar was fifteen tabs, which is a filing cabinet rather than a
navigation. It is now seven, with two of them carrying a sub-nav:

| Tab | Route | What lives there |
| --- | --- | --- |
| **Dashboard** | `/founderhub` | The business at a glance (see §4). |
| **Commerce** | `/founderhub/commerce` | Review queue · Single orders · Subscriptions · Financials |
| **Products** | `/founderhub/products` | Catalogue · Top 25 · Bundles · PowerBody · Dashboard · Readiness · Coverage |
| **Pricing** | `/founderhub/pricing` | Every pricing rule, in one place (see §2). |
| **Requires action** | `/founderhub/actions` | Product changes on live subscriptions. |
| **Emails** | `/founderhub/emails` | The outbox. |
| **Settings** | `/founderhub/settings` | Mock vs live data, supplier, payments, founder codes. |

### Routes that moved

| Was | Now |
| --- | --- |
| `/founderhub/dashboard` | `/founderhub/products/dashboard` |
| `/founderhub/coverage` | `/founderhub/products/coverage` |
| `/founderhub/readiness` | `/founderhub/products/readiness` |
| `/founderhub/supplier` | `/founderhub/products/powerbody` |
| `/founderhub/bundles` | `/founderhub/products/bundles` |
| `/founderhub/orders` | `/founderhub/commerce/orders` |
| `/founderhub/subscriptions` | `/founderhub/commerce/subscriptions` |

### Routes that were removed

- **Bulk import** (`/founderhub/import`, `/api/portal/import`, `lib/portal/import.ts`,
  the Olivit CSV template). Products come from the PowerBody feed via
  `/founderhub/products/powerbody`, which maps, AI-fills and de-dupes them — the CSV
  path was a second, worse way to do the same thing.
- **Improvements backlog** (`/founderhub/backlog`, `/api/portal/backlog`,
  `lib/portal/backlog*.ts`). A to-do list inside the product it is a to-do list
  for; it belongs wherever the rest of the work is tracked.

`lib/portal/store.ts` keeps `imported` products — that is now the PowerBody
"add to catalogue" flow's storage, not the CSV importer's.

---

## 2. Pricing — one page, and the Good-price model

`/founderhub/pricing` is now the single home for every rule that decides a price:
the subscription offer and per-bundle rates, the first-month offer and scratch
card odds, delivery, profit guardrails, one-off and subscription discount tiers,
budget ceilings, and what happens when a supplier changes a product. Editing any
of them applies everywhere — quiz, shop, hub and Stripe — on save.

The page has three tabs: **The model** (one worked product), **Every product**
(the same maths over the catalogue), and **The rules** (every setting).

### The unit-economics waterfall (`lib/pricing/unit-economics.ts`)

This is the centre of the pricing area. "Margin" used to be price minus supplier
cost — one subtraction hiding four leaks, each of them real money:

| Leak | Why it bites |
| --- | --- |
| **VAT** | Shelf prices are inc-VAT by law; PowerBody quote ex-VAT. Subtracting one from the other counts up to 20% of HMRC's money as profit. |
| **Delivery** | PowerBody charge £3.25–£5.17 per order, by weight, with **no free-shipping threshold for dropshippers**. On a £20 tub that is a fifth of the price. |
| **Card fees** | 1.5% + 20p of the gross, and VAT-exempt so there is nothing to reclaim. |
| **Returns** | 14-day right to return. The goods are refunded to us; the shipping never is. |

Net all four off a £30 sale on a £10 product and an apparent 67% margin is
closer to 30%. So the module emits an ordered, signed **waterfall** — every step
named and summing exactly to the contribution — and the UI renders those steps
rather than recomputing anything. There is nowhere for a number on the screen to
come from except a row you can see.

Margins are quoted on **net revenue** (the honest denominator) with the
margin-of-gross shown beside it, so the two can't be confused.

`priceForMargin` solves the stack backwards. The free-delivery threshold makes
the equation piecewise, so both branches are solved and the one consistent with
its own answer wins; the result is then verified against the real (penny-rounded)
waterfall and nudged up if rounding left it a hundredth under target. The solver
and the display cannot disagree.

### VAT (`lib/pricing/vat.ts`, `lib/pricing/vat-position.ts`)

`vat.registered` is a pricing rule, not a display toggle — registered and
unregistered are genuinely different businesses. **It ships as `false`**, which
is the phase the business is in. Flip it the day registration takes effect and
the whole hub reprices. Per-product `vatRate` covers the zero-rated items.

The **VAT tab** answers the three questions in the order they get asked.

**1. Am I required to register yet?** Rolling 12-month taxable turnover from real
orders against HMRC's £90,000 threshold, with the crossing date projected from
the run rate over the months we actually have (not a full year we don't — a
three-month-old business would otherwise look a quarter as busy as it is). The
threshold is on *any rolling 12 months*, not a tax year, so it can be crossed by
one good quarter; HMRC expect registration within 30 days of the end of that
month.

**2. What would it cost?** This is the part that needs care. PowerBody are
VAT-registered, so while we aren't we eat the VAT on everything they charge us —
a big, visible, annoying number that makes registering look attractive. It's a
trap, and the arithmetic settles it. Holding prices:

```
unregistered:  contribution = P − C(1+v)
registered:    contribution = P/(1+v) − C
difference   = v × [ P/(1+v) − C ]  =  v × your net gross margin
```

**Registering costs you the VAT rate times your margin.** Reclaiming input VAT
only wins when costs exceed net revenue — i.e. when you're already losing money.
So the panel shows *both* sides (what we'd reclaim, what we'd hand over) and the
net, because either one alone misleads. At a £45 average order and a 40% cost
ratio that's roughly £776/yr, or +8.7% on prices to stand still.

The reprice figure is deliberately **bigger** than the per-order cost: raising a
price also raises the VAT and card fee on the increment, so it has to be grossed
up to net the shortfall. Both sides of that calculation use the same delivery
assumption — solving them differently made it read as a price *cut*, which is
the bug the test `quotes a reprice that actually restores the contribution`
exists to prevent.

**3. What don't we know?** Stated on the panel: the Flat Rate Scheme, zero-rated
products, Making Tax Digital, and any turnover sold outside this hub that counts
towards the same threshold. It models what registration does to margin — it is
not tax advice, and the panel says so.

The verdict is mirrored onto the dashboard as a notice once it's actionable
(`watch` or `act`), above the counted queues — a VAT deadline outranks anything
with a number next to it.

### Delivery — PowerBody's real rate card (`lib/pricing/delivery.ts`)

From their Dropshipping Guide (June 2026), ex VAT, priced by **weight and zone**:

| Zone | Service | Band | Price |
| --- | --- | --- | --- |
| UK mainland | Royal Mail Tracked 48 | 0–7kg | £3.25 |
| UK mainland | DPD Two Day | 0–1990g | £4.75 |
| UK mainland | DPD Two Day | 1990g–30kg | £5.17 |
| Highlands & Islands | Royal Mail Tracked 48 | 0–7kg | £4.49 |
| EU | UPS International | 0–20kg | €10.00 |

The cheapest service that can carry the weight is the one they use. Bands are
`(min, max]` so a weight on a boundary lands in exactly one. Where nothing can
carry it — over 7kg to the Highlands, which they simply don't list — the quote
reports `unavailableReason` rather than pricing it at zero.

Three things this encodes that the old placeholder model got wrong:

- **There is no free supplier shipping.** Their guide: "Next Day Delivery and
  Free Delivery are not available to Dropshippers." Our free-delivery offer to
  the member does not reach PowerBody; we absorb their charge on every order.
- **It is a fulfilment fee, not postage** — picking, packaging, invoice printing,
  labour, storage and shipping. That is why it is so large next to a £20 tub.
- **Zones are blended, not worst-cased.** `zone2SharePct` (default 4%) mixes
  mainland and Highlands into one honest number rather than overpricing the 96% —
  but only when pricing something nobody has bought yet. A real order has an
  address, so it gets the real zone (below).

### Our free-delivery offer is not their threshold

Two numbers that look comparable and are not, in different directions:

|  | Ours | PowerBody's |
| --- | --- | --- |
| Basis | Our **retail** prices, inc VAT | Their **wholesale** values, ex VAT |
| Figure | Free over £100 | Free over £300 (Zone 2 **wholesale** only) |
| Applies to us? | It's our promise, it costs us | **No** — dropshipping never gets free delivery |

`freeDeliveryImpact()` prices the promise, and returns it **rung by rung**
(`bands`) rather than as one number — the ladder has two paid rungs and the
interesting one is usually the middle: it collects something, but not enough.

On a small parcel costing us £7.80, the entry rung's £4.95 recovers most of it,
the £2.95 rung about a third, and at £100+ we collect nothing and pay the full
charge on **every** qualifying order. That last line is the cost of the promise,
and it is a marketing cost rather than a fulfilment one. What changed is where it
starts: the free line now sits at £100, which is where PowerBody's own price
steps down, instead of £60 — where we stopped collecting a full £40 of retail
before our cost moved at all.

### Zone from postcode, and where they won't go (`lib/pricing/zones.ts`)

The delivery page publishes the exact Zone 2 postcode list, so for a real order
there is no need to assume anything. `zoneForPostcode` handles the numbered
ranges properly — `PA20–49` and `PA60–78` are Zone 2 but `PA1` (Paisley) is
mainland, and a plain prefix match would get half of Scotland wrong.

More importantly it encodes what a UK dropshipping account **cannot serve at
all**: Northern Ireland (BT), Guernsey (GY), Jersey (JE), and anywhere outside
the UK. All of those are ordinary-looking UK addresses sitting in PowerBody's own
Zone 2 — nothing about "BT1 5GS" warns you the supplier will refuse it. The
review queue flags them in red and counts them as blocked so nobody bulk-approves
one, and the dashboard lists them first. The Isle of Man (IM) is Zone 2 and
allowed — it's on the expensive list, not the banned one.

Because the charge is weight-banded, **`CatalogueProduct.weightGrams` is
load-bearing** — it also feeds PowerBody's `createOrder`, which requires a
weight. Readiness warns on mock data and **fails when live**. Products added from
the feed carry it; the mock fixtures parse it from the pack size in the name.

### The account minimum

PowerBody require **£1,000 of wholesale spend a month** (2 months' grace) to keep
a dropshipping account open, and suggest aiming for a £35 average order. Losing
the account is a bigger problem than any single price, so the model tab shows how
many orders a month that works out to at our current average price and cost
ratio.

### The Good price

`lib/pricing/good-price.ts` sits on the waterfall and prices for the **least
profitable path a member can take**:

1. The **biggest bundle's** subscribe-&-save rate (`worstCaseSubscriptionRate`).
2. The **average first-month discount** — the blended figure actually given away,
   not the headline 50% scratch card almost nobody wins.
3. **Cancelling at the earliest point** (`minSubscriptionMonths`).
4. **We carry the delivery.**

It reports the **spread**, not one number: bought once / typical subscriber /
worst case, side by side. One worst-case figure tells you whether a price is
safe; three tell you what you are pricing into.

Prices round **up** to the penny — rounding a floor down puts you under it.

---

## 3. Nothing reaches the supplier unreviewed

We do not ask PowerBody for anything until a founder has confirmed it. This is a
business rule enforced in the orders domain, not an accident of nothing calling
the code yet — so adding a cron or a webhook later cannot quietly start
dropshipping.

Every order carries `review: { state, by, at, note }`:

| State | Meaning |
| --- | --- |
| `pending` | Paid, waiting on a founder. The default, and what an order written before the queue existed reads as. |
| `approved` | Confirmed. Only now may `submitOrderToSupplier` run. |
| `held` | Parked deliberately (an address query, a stock doubt). |
| `rejected` | Will not be fulfilled as it stands. **Does not** refund or cancel — money is a separate decision. |

`/founderhub/commerce/queue` groups everything paid-but-unsent by the day it was
raised, with separate views for **one-off** and **subscription** renewals,
because the questions differ: "is this address real?" versus "has anything on
this plan gone out of stock?". It flags orders that could not be dropshipped as
they stand (no supplier SKU, no delivery address), supports bulk approve / hold /
reject, and sends only what has been approved.

Opening a single order and pressing **Confirm & send to PowerBody** approves and
sends in one step — a founder looking at the order *is* the human confirmation
the gate exists to demand. The gate itself stays.

---

## 4. The dashboard

`/founderhub` is ordered by what a founder can act on:

1. **Needs you** — orders to review, approved orders to send, product changes on
   live subscriptions, subscriptions needing attention, products not
   launch-ready, orders that failed to reach the supplier. Sorted biggest first,
   each linking to where you'd act.
2. **Orders** — raised today, awaiting review, ready to send, with the supplier.
3. **This month** — revenue, goods, the delivery we carry, gross profit, plus
   rolling 24-hour and 7-day windows.
4. **Subscriptions** — active members, MRR, per-member average.
5. **Where people fall off** — the quiz funnel.

### How the money is counted

`lib/portal/dashboard.ts` reconciles rather than flatters:

- **Revenue** counts orders that were paid for and not given back (refunded and
  cancelled orders are reported separately, not netted silently). The till total
  and the **net-of-VAT** figure are both reported — VAT is collected, not earned.
- **Cost** counts goods, the weight-banded delivery we carry (less whatever the
  member paid for postage, net of its own VAT), and card fees.
- **Margin is measured on net revenue**, so neither VAT nor an uncosted order can
  inflate it.
- An order whose supplier cost we don't fully know **counts towards revenue but
  is left out of the margin**, and the count of such orders is shown. A margin
  computed over half a catalogue is worse than no margin at all.

### The quiz funnel

`/api/analytics` now **keeps** events in `analytics_events` (migration v8)
alongside the structured log line, so the funnel is computed from our own data
with no third party. Anonymous by construction: a per-visit session id, no user
id, no IP, no cookie.

`lib/analytics/funnel.ts` counts **sessions, not events** — someone who
backtracks and re-answers fires three step-views, and counting events would make
the confusing question look popular. Step order comes from the events themselves
(median reported index) rather than a fixed ladder, because the quiz branches by
track, drinks mode and the deep dive, and a fixed ladder would show phantom
drop-off wherever a cohort legitimately skipped a step.

---

## 5. The Top 25

`/founderhub/products/top-25` holds an **ordered roster** of up to 25 products — the
ones the quiz reaches for first.

Held as one list rather than as a number on each product, because "which
products should the quiz recommend?" is one decision about the range, not
twenty-five separate ones. As a per-product field it drifts: two things creep to
priority 10, nobody remembers why, and the shortlist stops being a shortlist.
With 25 places, adding something means taking something out, and the order is
visible on one screen.

The roster **does not restrict the catalogue.** Everything is still in the shop
and still swappable in a built stack. It stamps `topRank` onto products in
`catalogue/resolve.ts`, and `scoreProduct` adds
`topProductBase − (rank − 1) × topProductStep`, so #1 edges out #25 while every
rostered product beats an unrostered equivalent. The boost is deliberately
smaller than a goal match: it is a preference between products that could both
serve the user, never a reason to recommend the wrong thing. Nothing off the
roster is penalised, so an empty roster (the default) leaves scoring exactly as
it was.

Being on the roster is a promise that the product's data is maintained, so the
screen shows that promise kept or broken: readiness, cost, and margin against
the Good-price model, per entry.

---

## 6. Founder codes — buying from our own shop

`/founderhub/settings/codes` issues three kinds of code, for the three things we
actually want to do with our own storefront. All of them are **single-use** and
**expire 24 hours** after they are made.

| Kind | Prefix | Goods | Delivery | Minimum order |
| --- | --- | --- | --- | --- |
| Everything free | `FH-FREE-…` | £0.00 | £0.00 | waived |
| Cost price | `FH-COST-…` | what PowerBody charge us | what PowerBody charge us | waived |
| Below the minimum | `FH-MIN-…` | normal | normal | waived |

### Why cost price moves delivery *upwards*

The two halves move in opposite directions, and that is the point. Goods drop
from the shelf price to `unitCostOf` — and then **up again by the VAT we cannot
reclaim**, because while `vat.registered` is false PowerBody's VAT is money that
genuinely leaves the account (`costFromSupplierPrice`). A "cost price" that
ignored it would still lose us a fifth of the goods.

Delivery goes the other way. Our customer ladder is free over £100 and
subsidised below it; PowerBody charge us £3.25–£5.17 a parcel with **no
dropshipper free-shipping band at all**. Selling the goods at cost and shipping
them on our own promotional postage would put the loss straight back in the line
below, so a cost-price order ships at `quoteDelivery(...).supplierCost` — for
both zones, because Stripe fixes shipping options before a postcode exists.

A product with no recorded `cost` falls back to `defaultCostRatio`, so on those
lines "cost price" is the model's estimate rather than the invoice. The hub says
so where the code is issued.

### Why they are not partner codes

They live in their own domain (`lib/founder-codes`, migration v17) rather than
as a fourth `PartnerCode`. A partner code belongs to a counterparty, earns
commission, is redeemable on a first order only, and is never allowed under the
margin floor. These belong to us, earn nobody anything, and **set** prices
rather than discounting them — the floor is bypassed entirely, in both
directions: a free order cannot reach zero through `discountWithFloor` (which is
exactly what stops a partner's 100% doing the same), and a cost price would be
dragged *up* wherever the floor happened to sit above it.

Folding the two together would have meant the commission accrual, the
first-order rule and the margin floor each carrying an "unless it's a founder"
branch, and the one that got missed would be the expensive one. They do share
one thing deliberately: **the code box**. A code is a code to whoever is typing
it, so `/api/partner-code` answers for both and `/api/cart` takes both in the
same field.

### The fences

- **Single use, enforced by a claim rather than a counter.** `SqlEngine.run`
  reports no row count on either engine, so "increment if under the cap" cannot
  know whether it did. `founder_codes.claim_token` is written
  `WHERE claim_token IS NULL` and read back; two tabs racing the same 100%-off
  code both reach that line and exactly one of them wins. The claim is taken
  **before** the order is raised, and a checkout that fails afterwards releases
  it.
- **One-off orders only.** A code that made a *subscription* free would make
  every renewal free, long after the code expired — 24 hours means nothing
  against a recurring charge. `founderCodeWorksOn` refuses `subscription`, and
  refuses an unstated channel too (the opposite default to the partner codes,
  because the downside here is 100% off forever).
- **Typed, never inherited.** A partner's code is banked into a cookie for
  thirty days on purpose. A founder code is read only from what was typed at
  this checkout — a cookie that could silently make an order free weeks later,
  on somebody else's basket, is not worth building.
- **Rate-limited.** 40 bits of Crockford base32 is not guessable, but the box
  that checks it still has a per-IP brake (`guess-limit.ts`) so working through
  `FH-FREE-…` costs more than bandwidth. Per-instance and in-memory, with the
  same honest caveat as the hub's front door: a brake, not a lock.
- **Recorded at both ends.** The order carries `founderCode` and
  `founderCodeKind` plus an audit event; the code row carries the order that
  spent it and the founder who issued it. A £0.00 order in the financials is
  explained where it is read, rather than looking like a pricing fault.
- **Still reviewed.** Free to the buyer is not free to us. A founder order lands
  in the same queue as everything else — nothing reaches PowerBody unreviewed.

### The one path that books a paid order nobody paid for

Stripe cannot take £0.00; Checkout refuses a session under its minimum charge.
So a `free` code raises the order as **paid** directly and returns
`#founder-code` instead of a checkout URL. It is the only such path in the app,
and what authorises it is the claim above.

That order then reaches `/order/confirmation?order=…` with no `session_id`.
`resolveConfirmation` admits it on the **order's** evidence — carries a founder
code, is paid, never touched Stripe — never on the URL's, so `?order=` does not
become a way to read an ordinary order by id.

### The shop's minimum order, and where the code box went

`minOrderValue` is £15 and `/api/cart` has always enforced it server-side. Until
now the only way to discover that was to press **Checkout** and be refused — and
the code box that can waive it lived on the quiz and bundle screens only, so the
one journey where a small basket is normal was also the one with no way to say
anything about it.

The basket drawer now carries the box **whatever the basket is worth**, and
states the shortfall as a fact about the basket rather than as an error after a
failed attempt. Under a founder code the free-delivery progress bar stands down
— "£12 away from free delivery" describes a ladder that no longer applies — and
the drawer prices through the same `priceAtFounderTerms` the checkout bills
from, so the £0.00 on screen is the £0.00 on the card.
