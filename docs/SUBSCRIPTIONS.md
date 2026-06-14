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

### The Phase 3 hub

Built as our own UI calling Recharge's customer API: swap products, change the
dispatch date, pause/skip, update payment. Recharge handles the billing and
sync underneath. (Skio/Awtomic are comparable alternatives if Recharge's API
ever proves limiting, but Recharge is the chosen default.)

### UK compliance note

Minimum terms and intro discounts are standard and fine, but disclose clearly
at checkout: the intro price, the ongoing price, the minimum term + total
commitment, and that cancellation is easy after the term (UK DMCC subscription
rules + Consumer Contracts Regs).
