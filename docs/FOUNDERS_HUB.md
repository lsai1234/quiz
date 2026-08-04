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

### The model

`lib/pricing/good-price.ts` turns a supplier asset price into a sell price by
pricing for the **least profitable path a member can take**, not the average one:

1. They land on the **biggest bundle**, which carries the deepest
   subscribe-&-save rate we offer (`worstCaseSubscriptionRate` — the max of the
   base rate, every per-level bundle rate, and any subscription tier).
2. They take the **average first-month discount**
   (`introOffer.effectiveFirstMonthDiscount`) — the blended figure the business
   actually gives away, not the headline 50% scratch card almost nobody wins.
3. They **cancel at the earliest point** (`minSubscriptionMonths`, overridable
   via `goodPricing.horizonMonths`).
4. **We carry the delivery**, because a subscription that clears the
   free-delivery threshold pays us nothing for postage.

A price that profits under all four profits everywhere else by construction,
which is what makes it safe to price a catalogue off.

```
r          = 1 − deepest subscribe-&-save
H          = horizon in months
dIntro     = average first-month discount
cost       = H × (goods + supplier delivery), per month
breakEven  = cost ÷ (r × (H − dIntro))
goodPrice  = breakEven ÷ (1 − targetMarginPct)
```

Both prices round **up** to the penny: rounding a floor down puts you under it.

The page also runs the model over the whole catalogue, listing anything that
loses money or sits under target on the worst case.

### Delivery (`lib/pricing/delivery.ts`)

Two different numbers hide behind "delivery" and confusing them is how a
catalogue goes quietly unprofitable: what the **supplier charges us** and what
we **charge the member**. On a subscription over the free-delivery threshold the
second is zero, and the gap (`absorbed`) is a real cost the sell price must
carry.

The rate card lives in `PRICING_CONFIG.delivery` — parcel cost, per-unit cost,
units per parcel, the supplier's free-shipping threshold, and our customer
charge. **The figures are placeholders until the PowerBody contract is signed.**
The shape is what matters: plugging the real rate card in is an edit on the
Pricing page and nothing else, and it reprices the whole model.

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

- Revenue counts orders that were **paid for and not given back** (refunded and
  cancelled orders are reported separately, not netted silently).
- Cost counts the **goods and the postage we carry** — the supplier's delivery
  charge less whatever the member paid.
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
