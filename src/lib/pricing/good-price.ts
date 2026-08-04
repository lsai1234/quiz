/**
 * The Good-price model — supplier asset price in, sell price out.
 *
 * WHY THIS EXISTS
 * ───────────────
 * Pricing off an average customer is how a catalogue goes broke slowly. The same
 * product is sold at four different effective prices — one-off, one-off inside a
 * bundle tier, subscription, and subscription-with-a-first-month-offer — and only
 * the last of those tells you whether the price actually works.
 *
 * So this model prices for the LEAST profitable path a member can take:
 *
 *   1. They land on the BIGGEST subscription bundle, which carries the deepest
 *      subscribe-&-save rate we offer (the whole point of the bundle is that the
 *      rate improves with size, so the largest bundle is the worst case for us).
 *   2. They take the average first-month discount — not the headline 50% scratch
 *      card, which almost nobody wins, but the blended figure the business
 *      actually gives away (`introOffer.effectiveFirstMonthDiscount`).
 *   3. They cancel at the earliest point they are allowed to.
 *   4. We carry the delivery, because a subscription that clears the free-delivery
 *      threshold pays us nothing for postage.
 *
 * A price that profits there profits everywhere else by construction, which is
 * what makes this safe to price a whole catalogue off.
 *
 * DELIVERY
 * ────────
 * Delivery is part of the model rather than an afterthought bolted on later,
 * because on a £20 tub the postage is the difference between a good margin and
 * no margin. The rate card lives in `PRICING_CONFIG.delivery` and the maths in
 * `./delivery.ts`; both are placeholders until the PowerBody contract is signed,
 * and swapping in the real numbers changes nothing here.
 *
 * Pure — every function takes its config, so the Founders Hub can preview an
 * unsaved rule change and the tests can pin exact numbers.
 */
import { getPricingConfig, type PricingConfig } from '@/lib/stack-blueprint/pricing'
import { customerDeliveryCharge, supplierDeliveryCost } from './delivery'

const round = (n: number) => Math.round(n * 100) / 100
const round4 = (n: number) => Math.round(n * 10000) / 10000
/** Prices round UP to the penny: rounding a floor down puts you under it. */
const roundUp = (n: number) => (Number.isFinite(n) ? Math.ceil(n * 100) / 100 : n)

/**
 * The deepest subscribe-&-save rate anyone can reach — the largest bundle's
 * fixed rate, or a subscription tier if one beats it.
 *
 * Deliberately ignores which bundle a specific product tends to land in: the
 * question this model answers is "could this price ever lose money", and the
 * answer has to hold for the member who found the best rate available.
 */
export function worstCaseSubscriptionRate(config: PricingConfig = getPricingConfig()): number {
  const levelRates = Object.values(config.levelSubscriptionDiscount)
  const tierRates = config.subscriptionTiers.map((t) => t.discountPct)
  return round4(Math.max(config.subscriptionDiscount, ...levelRates, ...tierRates, 0))
}

/** The months of revenue a price is judged over — the earliest a member can leave. */
export function pricingHorizonMonths(config: PricingConfig = getPricingConfig()): number {
  return Math.max(1, config.goodPricing.horizonMonths ?? config.minSubscriptionMonths)
}

export interface GoodPriceInput {
  /** What the supplier charges us for one unit — the asset price (£). */
  assetPrice: number
  /** Units in one shipment. Default 1. */
  unitsPerShipment?: number
  /** Months between shipments — a 90-serving tub on a daily dose ships quarterly. Default 1. */
  shipEveryMonths?: number
  /** An existing list price to grade against the model (£). Optional. */
  listPrice?: number
}

/** What one month of this product costs us before anyone is charged anything. */
export interface LandedCost {
  /** Goods, spread over the shipping cadence (£/month). */
  goods: number
  /** What the supplier charges us to deliver it, spread the same way (£/month). */
  delivery: number
  /** goods + delivery (£/month). */
  total: number
}

export interface GoodPriceResult {
  /** The worst-case assumptions this was solved under. */
  assumptions: {
    subscriptionDiscount: number
    firstMonthDiscount: number
    horizonMonths: number
    /** True when we assumed we collect nothing for postage. */
    absorbsDelivery: boolean
  }
  landedCost: LandedCost
  /** Total cost over the horizon (£). */
  horizonCost: number
  /** Delivery we expect to collect over the horizon (£) — 0 in the default worst case. */
  horizonDeliveryCollected: number
  /** List price at which the worst case exactly breaks even (£). */
  breakEvenPrice: number
  /** List price that hits the target margin on the worst case — the recommendation (£). */
  goodPrice: number
  /** What that recommended price nets us per month after the deepest discount (£). */
  goodPriceMonthlyNet: number
  /** What the member pays for delivery at the recommended price (£ per shipment). */
  goodPriceDeliveryCharge: number
  /** Grade of `input.listPrice`, when one was given. */
  atListPrice: PriceVerdict | null
}

export interface PriceVerdict {
  listPrice: number
  /** Revenue over the horizon on the worst-case path (£). */
  revenue: number
  /** Cost over the horizon (£). */
  cost: number
  /** revenue − cost (£). */
  profit: number
  /** profit ÷ revenue (0–1). Negative when the price loses money. */
  marginPct: number
  /** True when the worst-case path still makes money. */
  profitable: boolean
  /** True when it also clears the target margin. */
  meetsTarget: boolean
  /** How far the list price is from the recommendation (£; negative = underpriced). */
  vsGoodPrice: number
}

/**
 * Revenue per £1 of list price over the horizon, on the worst-case path.
 *
 * Every month is discounted by the deepest subscribe-&-save rate; the first month
 * is discounted again by the average intro offer. So H months of revenue is
 * `(1 − dSub) × (H − dIntro)` per £1 of list price, not `(1 − dSub) × H`.
 */
function revenuePerListPound(config: PricingConfig): number {
  const dSub = worstCaseSubscriptionRate(config)
  const dIntro = Math.min(1, Math.max(0, config.introOffer.effectiveFirstMonthDiscount))
  const horizon = pricingHorizonMonths(config)
  return (1 - dSub) * (horizon - dIntro)
}

/** What one month of a product costs us, goods and postage both. */
export function landedMonthlyCost(input: GoodPriceInput, config: PricingConfig = getPricingConfig()): LandedCost {
  const units = Math.max(1, input.unitsPerShipment ?? 1)
  const months = Math.max(1, input.shipEveryMonths ?? 1)
  const goodsValue = round(input.assetPrice * units)
  const goods = round(goodsValue / months)
  const delivery = round(supplierDeliveryCost({ units, goodsValue }, config) / months)
  return { goods, delivery, total: round(goods + delivery) }
}

/**
 * Grade a list price against the worst case.
 *
 * `deliveryCollected` is what we expect the member to pay us for postage over the
 * horizon — zero in the default worst case, where the subscription clears the
 * free-delivery threshold and we carry it.
 */
export function verdictFor(
  listPrice: number,
  horizonCost: number,
  deliveryCollected: number,
  goodPrice: number,
  config: PricingConfig = getPricingConfig(),
): PriceVerdict {
  const revenue = round(listPrice * revenuePerListPound(config) + deliveryCollected)
  const profit = round(revenue - horizonCost)
  const marginPct = revenue > 0 ? round4(profit / revenue) : -1
  return {
    listPrice: round(listPrice),
    revenue,
    cost: round(horizonCost),
    profit,
    marginPct,
    profitable: profit > 0,
    meetsTarget: marginPct >= config.goodPricing.targetMarginPct,
    vsGoodPrice: round(listPrice - goodPrice),
  }
}

/**
 * The whole model: asset price in, recommended sell price out, with the workings
 * shown so a founder can see why rather than being handed a number.
 */
export function goodPriceFor(input: GoodPriceInput, config: PricingConfig = getPricingConfig()): GoodPriceResult {
  const horizon = pricingHorizonMonths(config)
  const landedCost = landedMonthlyCost(input, config)
  const horizonCost = round(landedCost.total * horizon)
  const perPound = revenuePerListPound(config)
  const target = Math.min(0.95, Math.max(0, config.goodPricing.targetMarginPct))

  // Shipments the member receives over the horizon — what delivery is charged on.
  const shipments = Math.max(1, Math.ceil(horizon / Math.max(1, input.shipEveryMonths ?? 1)))

  const solve = (deliveryCollected: number) => {
    // Revenue must cover cost, less whatever postage we collected on top.
    const needed = Math.max(0, horizonCost - deliveryCollected)
    if (perPound <= 0) return { breakEven: Infinity, good: Infinity }
    const breakEven = needed / perPound
    return { breakEven, good: breakEven / (1 - target) }
  }

  // Pass 1 assumes we collect nothing for postage — the honest worst case.
  let deliveryCollected = 0
  let solved = solve(deliveryCollected)

  // Pass 2, only when the founder has said not to assume free delivery: re-solve
  // with what the member would actually be charged at the pass-1 price. One
  // refinement is enough — the charge is a flat rate, so it can only move the
  // price down, and a price that lands back above the free-delivery threshold
  // simply falls through to the conservative pass-1 answer.
  if (!config.goodPricing.assumeFreeDelivery && Number.isFinite(solved.good)) {
    const monthlyNet = solved.good * (1 - worstCaseSubscriptionRate(config))
    const perShipment = customerDeliveryCharge(monthlyNet * Math.max(1, input.shipEveryMonths ?? 1), config)
    if (perShipment > 0) {
      deliveryCollected = round(perShipment * shipments)
      solved = solve(deliveryCollected)
    }
  }

  const breakEvenPrice = roundUp(solved.breakEven)
  const goodPrice = roundUp(solved.good)
  const goodPriceMonthlyNet = round(goodPrice * (1 - worstCaseSubscriptionRate(config)))

  return {
    assumptions: {
      subscriptionDiscount: worstCaseSubscriptionRate(config),
      firstMonthDiscount: round4(config.introOffer.effectiveFirstMonthDiscount),
      horizonMonths: horizon,
      absorbsDelivery: deliveryCollected === 0,
    },
    landedCost,
    horizonCost,
    horizonDeliveryCollected: deliveryCollected,
    breakEvenPrice,
    goodPrice,
    goodPriceMonthlyNet,
    goodPriceDeliveryCharge: customerDeliveryCharge(
      goodPriceMonthlyNet * Math.max(1, input.shipEveryMonths ?? 1),
      config,
    ),
    atListPrice:
      input.listPrice != null
        ? verdictFor(input.listPrice, horizonCost, deliveryCollected, goodPrice, config)
        : null,
  }
}

/**
 * Grade a catalogue product against the model.
 *
 * Falls back to the configured cost ratio when a product has no cost set, so the
 * audit covers the whole catalogue rather than only the tidy half — but says so,
 * because an estimated cost makes an estimated verdict.
 */
export function auditProductPrice(
  product: { title: string; basePrice: number; cost?: number | null; servings?: number | null },
  config: PricingConfig = getPricingConfig(),
): GoodPriceResult & { title: string; costEstimated: boolean } {
  const costEstimated = product.cost == null
  const assetPrice = costEstimated ? round(product.basePrice * config.defaultCostRatio) : product.cost!
  // A tub bigger than a month's supply ships less often than it bills, capped by
  // the same rule the subscription scheduler uses so the two never disagree.
  const shipEveryMonths = Math.min(
    config.maxDeliveryMonths,
    Math.max(1, Math.round((product.servings ?? 30) / 30)),
  )
  return {
    title: product.title,
    costEstimated,
    ...goodPriceFor({ assetPrice, shipEveryMonths, listPrice: product.basePrice }, config),
  }
}
