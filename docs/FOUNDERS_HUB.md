# Founders Hub — structure, pricing model, and the supplier review queue

This is the current shape of the hub. Where an older phase spec
(`PHASE6_PORTAL_SPEC.md`, `POWERBODY_STRIPE_PLAN.md`, `BUNDLES_SPEC.md`,
`PRODUCT_CHANGES_SPEC.md`, `SUBSCRIPTIONS.md`) names a `/portal/*` route, this
document supersedes it — those specs record what was built at the time and are
left as history rather than rewritten.

---

## 1. Navigation

The top bar was fifteen tabs, which is a filing cabinet rather than a
navigation. It is now seven, with two of them carrying a sub-nav:

| Tab | Route | What lives there |
| --- | --- | --- |
| **Dashboard** | `/portal` | The business at a glance (see §4). |
| **Commerce** | `/portal/commerce` | Review queue · Single orders · Subscriptions · Financials |
| **Products** | `/portal/products` | Catalogue · Top 25 · Bundles · PowerBody · Dashboard · Readiness · Coverage |
| **Pricing** | `/portal/pricing` | Every pricing rule, in one place (see §2). |
| **Requires action** | `/portal/actions` | Product changes on live subscriptions. |
| **Emails** | `/portal/emails` | The outbox. |
| **Settings** | `/portal/settings` | Mock vs live data, supplier, payments. |

### Routes that moved

| Was | Now |
| --- | --- |
| `/portal/dashboard` | `/portal/products/dashboard` |
| `/portal/coverage` | `/portal/products/coverage` |
| `/portal/readiness` | `/portal/products/readiness` |
| `/portal/supplier` | `/portal/products/powerbody` |
| `/portal/bundles` | `/portal/products/bundles` |
| `/portal/orders` | `/portal/commerce/orders` |
| `/portal/subscriptions` | `/portal/commerce/subscriptions` |

### Routes that were removed

- **Bulk import** (`/portal/import`, `/api/portal/import`, `lib/portal/import.ts`,
  the Olivit CSV template). Products come from the PowerBody feed via
  `/portal/products/powerbody`, which maps, AI-fills and de-dupes them — the CSV
  path was a second, worse way to do the same thing.
- **Improvements backlog** (`/portal/backlog`, `/api/portal/backlog`,
  `lib/portal/backlog*.ts`). A to-do list inside the product it is a to-do list
  for; it belongs wherever the rest of the work is tracked.

`lib/portal/store.ts` keeps `imported` products — that is now the PowerBody
"add to catalogue" flow's storage, not the CSV importer's.

---

## 2. Pricing — one page, and the Good-price model

`/portal/pricing` is now the single home for every rule that decides a price:
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

### VAT (`lib/pricing/vat.ts`)

`vat.registered` is a pricing rule, not a display toggle — registered and
unregistered are genuinely different businesses. Registered: we hand VAT over on
sales and reclaim what PowerBody charge us, so costs are net. Unregistered: we
keep the whole shelf price but cannot reclaim, so their VAT is a permanent cost.
Per-product `vatRate` covers the handful of zero-rated items.

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
  mainland and Highlands into one honest number rather than overpricing the 96%.

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

`/portal/commerce/queue` groups everything paid-but-unsent by the day it was
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

`/portal` is ordered by what a founder can act on:

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

`/portal/products/top-25` holds an **ordered roster** of up to 25 products — the
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
