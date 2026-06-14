# Subscriptions — how it works & how it will plug into Shopify

This documents the subscription model the quiz builds today (running on mock
data) and exactly how it will map onto Shopify when you connect it later.

## The two offers

When the stack is revealed the customer chooses between:

- **One-off bundle** — buy the recommended stack once. Saving comes from
  per-product RRP markdowns (an explicit flat `bundleDiscount` knob also exists
  in `PRICING_CONFIG`, default 0).
- **Subscribe monthly** — a recurring plan. Every product is included; nothing
  is ever "unavailable".

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

## Connecting Shopify subscriptions (Phase 2)

Shopify subscriptions are built on **selling plans**. Each `SubscriptionLine`
maps to a selling plan on a selling-plan group:

- **Delivery interval** = `shipEveryMonths` (a `MONTH` interval of N).
- **Quantity** = `unitsPerShipment`.
- **Price adjustment** = `subscriptionDiscount` (a percentage adjustment).
- **Billed per cycle** = `pricePerDelivery`.

Cart/checkout then attaches the chosen variant's `sellingPlanId` to the cart
line (the checkout validation already has the hook for this).

### Which plugin?

- **Shopify Subscriptions** (free, first-party) — supports selling plans, fixed
  delivery intervals and discounts. Enough for the MVP checkout in Phase 2.
- **Recharge / Skio / Loop / Awtomic / Bold** — third-party. Worth it when you
  need the richer **customer portal** (swap products, change dispatch date,
  pause/skip, manage payment) that the Phase 3 subscriber hub describes, plus
  dunning and analytics. **Recharge** or **Skio** are the usual choices for that
  depth and both expose an API the hub can drive.

Recommendation: ship Phase 2 on native Shopify Subscriptions; evaluate
Recharge/Skio before building the Phase 3 hub, since the hub's swap/dispatch/
direct-debit features lean heavily on the subscription app's customer API.
