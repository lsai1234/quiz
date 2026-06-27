# Subscriptions — how it works & how it will plug into Shopify

This documents the subscription model the quiz builds today (running on mock
data) and exactly how it will map onto Shopify when you connect it later.

## The two offers

When the stack is revealed the customer chooses between:

- **One-off bundle** — buy the recommended stack once. Saving comes from
  per-product RRP markdowns (an explicit flat `bundleDiscount` knob also exists
  in `PRICING_CONFIG`, default 0).
- **Subscribe monthly** — a recurring plan. Every product is included; nothing
  is ever "unavailable". It bills **one flat amount every month** (the long-run
  average), with an **intro discount on the first month** and a **minimum term**.
  Defaults (all in `PRICING_CONFIG`): flat monthly, 50% off the first month,
  4-month minimum. Example for a 3–4×/week stack: **£60.05/mo, first month
  £30.03, 4-month minimum (£210.18 commitment), cancel anytime after.**

  The minimum term is what makes flat monthly billing safe: because the flat
  amount is the smoothed average, a customer can't cancel after one month having
  received a long-lasting item they haven't finished paying for.

All the logic lives in `src/lib/stack-blueprint/pricing.ts` and is fully unit
tested.

## How the monthly plan is sized (the protocol)

Each product has a **consumption protocol**:

- `cadence`: `daily` (protein, creatine, multivitamin…) or `per-workout`
  (pre-workout, electrolytes, BCAA). Derived from the stack slot when not set
  explicitly (energy/hydration → per-workout, else daily).
- `dosesPerUnit`: servings in one container (defaults from `daysOfSupply`).

From the quiz we get **training frequency** → `workoutsPerMonth`
(1-2x≈6, 3-4x≈15, 5-6x≈24, daily≈30).

For each line we compute how long one container lasts and ship it on the
nearest sensible cadence:

```
occasionsPerMonth = cadence === 'daily' ? 30 : workoutsPerMonth
monthsOneUnitLasts = dosesPerUnit / occasionsPerMonth
shipEveryMonths    = clamp(round(monthsOneUnitLasts), 1, maxDeliveryMonths)   // when ≥ 1 month
monthlyUnits       = unitsPerShipment / shipEveryMonths
pricePerDelivery   = unitsPerShipment × unitPrice × (1 − subscriptionDiscount)
monthlyPrice       = monthlyUnits     × unitPrice × (1 − subscriptionDiscount)
```

Key property: **`monthlyPrice === pricePerDelivery / shipEveryMonths`** — the
headline £/mo always reconciles with the actual delivery schedule ("pay for
what ships"). Worked example for a 3–4×/week trainer:

| Product | Cadence | Servings | Ships | Per delivery | £/mo |
|---|---|---|---|---|---|
| Whey protein | daily | 30 | every 1 month | £29.74 | £29.74 |
| Creatine | daily | 100 | every 3 months | £16.99 | £5.66 |
| Pre-workout | per-workout (15/mo) | 30 | every 2 months | £25.49 | £12.75 |
| Electrolytes | per-workout (15/mo) | 30 | every 2 months | £15.29 | £7.65 |
| Omega-3 | daily | 90 | every 3 months | £12.74 | £4.25 |

Long-lasting products **stay the same product and ship less often** rather than
swapping to a smaller SKU. (A `subscriptionProductId` mapping to a different
monthly product is still supported for the portal, with de-duplication when two
slots resolve to the same product — but it is not used by default.)

- `subscriptionMinMonths` — minimum commitment, from `PRICING_CONFIG`
  (default 1 → "cancel anytime"), raised by any product's
  `minSubscriptionMonths` override.

## Pricing rules & profit guardrails (portal-controlled)

All discount/margin rules live in `PRICING_CONFIG` as data, ready for the portal
to edit. They're profit-aware so discounts can't quietly lose money.

**Tiered discounts (min order values).**
- `bundleTiers` — one-off bundle discounts that unlock at order-value (or item)
  thresholds; the best-qualifying tier wins. Defaults: £60+ → 7.5%, £90+ →
  12.5%, £120+ → 15%.
- `subscriptionTiers` — optional extra subscribe-&-save on top of the base
  `subscriptionDiscount` (15%) for bigger monthly orders. Empty by default.

**Margin protection.**
- Every product has a `cost` (cost of goods); when unset it's estimated as
  `price × defaultCostRatio` (0.35). Read from the `chrgd.cost` metafield live.
- `marginFloorPct` (0.15) — a discount never takes a line below
  `cost × (1 + floor)`, capped at list price. So a deep tier or sale can't sell
  below margin.

**Profit on cancel (the key one).** `calculatePricing` reports, for the portal:
- `subscriptionMonthlyMargin` — margin per month.
- `subscriptionCommittedMargin` — margin across the whole minimum term
  (committed revenue − cost of goods actually shipped during the term).
- `subscriptionProfitableOnCancel` — true when that committed margin is ≥ 0, i.e.
  even a customer who cancels at the earliest allowed point has been profitable.
  This is what couples the intro discount + minimum term + costs together: the
  portal can tune any of them and immediately see whether the offer still
  profits on the worst-case cancel.

**Minimum order to subscribe.** `minSubscriptionMonthly` (£25) — the flat monthly
must clear this for the Subscribe option to be offered.

These are PORTAL-facing numbers (margins aren't shown to customers); the final
phase exposes them as editable controls + a profitability readout.

## Product data → Shopify metafields

All of this is mock-first today and reads from `chrgd.*` metafields the moment
you go live. The Storefront query (`src/lib/shopify/operations.ts`), the mapper
(`src/lib/shopify/catalogue.ts`) and the seeder
(`scripts/seed-shopify-tags.mjs`) already handle:

| App field | Shopify metafield (`chrgd.*`) | Type |
|---|---|---|
| `subscriptionEligible` | `subscription_eligible` | boolean |
| `daysOfSupply` | `days_of_supply` | number_integer |
| `consumption.cadence` | `consumption_cadence` | `daily` / `per-workout` |
| `consumption.dosesPerUnit` | `doses_per_unit` | number_integer |
| `minSubscriptionMonths` | `min_subscription_months` | number_integer |
| `cost` | `cost` | number_decimal |
| `recommendationBasis` | `recommendation_basis` | `objective` / `subjective` |
| `effectOnset` | `effect_onset` | `immediate` / `short` / `long` / `none` |
| `subscriptionProductId` | `subscription_product_handle` | text (handle) |
| `isSubscriptionOnly` | `subscription_only` | boolean |

Run `node scripts/seed-shopify-tags.mjs` to write these to your products.

## Connecting Shopify subscriptions — decided approach: Recharge

The subscription engine and billing run on **Recharge** (Shopify subscription
app). We build **our own branded customer portal** (the Phase 3 hub) on top of
**Recharge's API** — Recharge owns the billing engine (card vaulting, recurring
charges, retries/dunning, Shopify order sync), we own the experience. We do NOT
rebuild billing ourselves.

### How the model maps to Recharge

The plan is a **flat-price monthly membership**, not lumpy per-delivery charges:

- **Flat monthly charge** = `StackPricing.subscriptionTotal` — a single
  recurring price (the smoothed average of all items). In Recharge this is one
  subscription billed monthly at a fixed price.
- **First-month intro** = `subscriptionFirstMonth` — a Recharge **first-order
  discount** (`introOffer.firstMonthDiscount`, default 50%).
- **Minimum term** = `subscriptionMinMonths` — Recharge **minimum cycles**
  before cancellation (default 4). This is enforced by Recharge refusing early
  cancellation (clearly disclosed at checkout), NOT by charging an exit fee.
- **What ships when** = each `SubscriptionLine`'s `shipEveryMonths` /
  `unitsPerShipment`. Items still arrive on their own cadence (whey monthly,
  creatine every 3 months…) even though billing is one flat monthly amount.
- **Commitment total** = `subscriptionMinTermTotal` — disclose this up front.

### Checkout (Phase 2 — built, mock-first)

The checkout flow is wired end to end and works today on mock data:

- `buildSubscriptionCheckout()` (in `checkout.ts`) turns the stack into the
  payload: recurring lines (`merchandiseId`, `sellingPlanId`, `quantity` =
  units/delivery, `deliveryIntervalMonths`, `pricePerDelivery`) plus the flat
  monthly / first month / minimum-term figures.
- `useStackCheckout` is plan-aware: one-off → `POST /api/cart`, subscription →
  `POST /api/subscribe`.
- `POST /api/subscribe` — in mock mode returns a confirmation; in live mode it
  creates a Shopify cart whose lines carry `sellingPlanId` + quantity, so
  Shopify checkout starts the subscription and **Recharge picks it up**.
- Variant `sellingPlanId` is read from Storefront `sellingPlanAllocations`
  (null until Recharge selling plans are configured).

To go live: configure Recharge selling plans on the products (so each variant
gets a selling-plan allocation), set `NEXT_PUBLIC_DATA_SOURCE=shopify`, and the
same flow creates real subscriptions. The intro discount, flat membership price
and minimum cycles are configured on the Recharge plan to match `PRICING_CONFIG`.

### The Phase 3 hub — built, mock-first

The subscriber hub lives at `/hub` and works today on mock data:

- **Login** — email sign-in gate (`HubLogin`). Live, this is Shopify Customer
  Account login; any email loads a sample subscription in mock mode.
- **Dashboard** (`SubscriptionDashboard`) — status, flat monthly, next dispatch
  date, payment method, and the stack with per-line delivery cadence.
- **Manage** — add or remove products, change how often each ships, skip a box,
  get one now, swap a product (`ChangeProductFlow`, same-slot alternatives),
  move the next box (send now / delay), change the dispatch day, pause/resume,
  and cancel (blocked until the minimum term is met, with months-left shown).
  See Phase 5 below for the flexibility model.
- **Billing** — links out to the Recharge billing portal (placeholder in mock).

The data layer (`src/lib/recharge/`) is shaped like a Recharge subscription
contract. `createMockSubscription` builds it from the quiz pricing engine, and
the mutation helpers (add / remove / cadence / skip / one-off / swap / dispatch
day / next-box date / pause / cancel) are pure functions.
The hub store (`src/lib/hub-store.tsx`) calls these today; when Recharge is
connected, each action calls Recharge's customer API instead — same surface.
(Skio/Awtomic are comparable alternatives, but Recharge is the chosen default.)

### Phase 4 — onset-aware feedback & keep-vs-change advice (built, mock-first)

The check-in is **adaptive and onset-aware** (`src/components/hub/CheckIn.tsx`,
engine in `src/lib/feedback.ts`). Two product axes drive it:

- **`recommendationBasis`** (`objective` | `subjective`) — *whether* feelings
  should drive a change.
- **`effectOnset`** (`immediate` | `short` | `long` | `none`) — *when* a benefit
  is even noticeable. `immediate` = pre-workout/electrolytes (same session);
  `short` = sleep/recovery/gut (~3 wks); `long` = omega-3, vitamin C/D, collagen,
  multivitamin (~6 wks, often barely felt); `none` = protein/creatine (never
  consciously felt). Derived from the stack slot, overridable via the
  `chrgd.effect_onset` metafield / the portal.

`buildCheckInQuestions` asks **only** about dimensions the current stack targets
**and** that are past their onset window — slow-build / unfelt items become
reassurance cards instead of questions, so a member is never asked to rate
something that can't be felt yet. `recommendForSubscription` returns a per-line
**phase**: `unfelt` (keep, works in the background), `too-early` (set
expectations + ETA, never judged), `working` (keep), `review` (the *only* phase
that suggests a change — past its window **and** the feeling stayed low), or
`check` (past its window, prompt a rating). This is what stops a vitamin C or
omega-3 being churned before it's had a fair chance.

The advice is deterministic (works offline); an AI pass via
`/api/personalise-stack` can refine the wording. Feedback history lives in the
hub store today; live it would persist in the app database.

**Interactive everywhere.** Each product card (`StackItemCard`) shows its phase
and — for felt, past-onset lines — an inline "Feeling it?" micro check-in
(`submitDimension`). After a check-in, `CheckInJourney` groups the stack into
*Worth a look* / *Working for you* / *Still settling in*, celebrating with
confetti when nothing needs a change.

**Change flow.** The **Change** action opens `ChangeProductFlow`: 1. **Why** —
reason chips. 2. **Pick** — replacements ranked for that reason
(`recommendReplacements`), each showing its monthly delta. 3. **Confirm** — the
pricing impact and when it applies. `computeSwapImpact` returns the new flat
monthly, the monthly delta and a one-off top-up/credit for the imminent box.

### Phase 5 — full flexibility (add / remove / move / one-off)

The hub lets a member reshape the stack and react to how fast they get through
things, with the money model kept exploit-proof. Pure helpers + impact previews
live in `src/lib/recharge/mock.ts`; the UI is `AddProductSheet` and
`LineManageSheet`.

- **Add** (`addLine` / `computeAddImpact`) — a new line sized & priced at the
  subscribe-&-save rate (margin-floored); the intro discount is **never**
  re-applied. Flat monthly rises by its amortised monthly.
- **Remove** (`removeLine` / `computeRemoveImpact`) — free before anything
  ships; once a delivery has gone out, a **pay-for-what-shipped settlement**
  (`lineSettlement = max(0, shippedValueToDate − paidToDate)`) recovers the value
  already sent that the member hasn't paid off. This kills the "add a 3-month tub,
  get it cheap on the smoothed rate, cancel" arbitrage.
- **Ship more / less often** (`setLineCadence`) — clamped `[1, maxDeliveryMonths]`;
  only the frequency changes, the per-unit price (and its floor) never moves; flat
  monthly is re-derived from `flatMonthlyOf`.
- **Get one now** (`oneOffCharge` / `computeOneOffImpact`) — a one-off at the full
  per-unit price, charged up front; the recurring plan is untouched.
- **Skip next** (`skipNextDelivery`) — pushes the next ship date out and banks a
  credit equal to the box value, so nobody pays for a box they didn't get.
- **Next-box date** (`sendNow` / `bringForward` / `delayDispatch`) — an explicit
  `nextDispatchOverride` for the upcoming delivery, on top of the day-of-month
  cadence.

Live, these map onto Recharge: add/remove = subscription line changes, settlement
and "get one now" = one-time line items, skip = a skipped charge with credit,
cadence = the line's order-interval, and the date controls = reschedule/charge-now.

### UK compliance note

Minimum terms and intro discounts are standard and fine, but disclose clearly
at checkout: the intro price, the ongoing price, the minimum term + total
commitment, and that cancellation is easy after the term (UK DMCC subscription
rules + Consumer Contracts Regs).
