/**
 * The Good-price model — supplier asset price in, sell price out.
 *
 * WHAT IT ANSWERS
 * ───────────────
 * The same product is sold at four different effective prices — one-off, one-off
 * inside a bundle tier, subscription, and subscription-with-a-first-month-offer
 * — and pricing off the average of those is how a catalogue goes broke slowly.
 *
 * So the model prices for the LEAST profitable path a member can take:
 *
 *   1. They land on the BIGGEST subscription bundle, which carries the deepest
 *      subscribe-&-save rate we offer (the whole point of the bundle is that the
 *      rate improves with size, so the largest is the worst case for us).
 *   2. They take the average first-month discount — not the headline 50% scratch
 *      card almost nobody wins, but the blended figure the business gives away.
 *   3. They cancel at the earliest point they are allowed to.
 *   4. We carry the delivery, because a subscription clearing the free-delivery
 *      threshold pays us nothing for postage — and PowerBody give dropshippers
 *      no free shipping, so that cost is on every single order.
 *
 * A price that profits there profits everywhere else by construction.
 *
 * WHAT CHANGED
 * ────────────
 * The model used to work on gross prices and a made-up delivery cost. It now
 * sits on `./unit-economics.ts`, so every scenario carries VAT, PowerBody's real
 * weight-banded rate card, card fees and a returns provision. Margins are on NET
 * revenue. The numbers are lower and they are true.
 *
 * It also reports the SPREAD rather than a single figure. One worst-case number
 * tells a founder whether a price is safe; three tell them what they are
 * actually pricing into, which is the difference between a warning and a
 * decision.
 */
import { getPricingConfig, type PricingConfig } from '@/lib/stack-blueprint/pricing'
import { unitEconomics, priceForMargin, type UnitEconomics } from './unit-economics'
import { shipmentWeight } from './delivery'

const round = (n: number) => Math.round(n * 100) / 100
const round4 = (n: number) => Math.round(n * 10000) / 10000
const roundUp = (n: number) => (Number.isFinite(n) ? Math.ceil(n * 100) / 100 : n)

/**
 * The deepest subscribe-&-save rate anyone can reach — the largest bundle's
 * fixed rate, or a subscription tier if one beats it.
 *
 * Deliberately ignores which bundle a specific product tends to land in: the
 * question is "could this price ever lose money", and the answer has to hold
 * for the member who found the best rate available.
 */
export function worstCaseSubscriptionRate(config: PricingConfig = getPricingConfig()): number {
  const levelRates = Object.values(config.levelSubscriptionDiscount)
  const tierRates = config.subscriptionTiers.map((t) => t.discountPct)
  return round4(Math.max(config.subscriptionDiscount, ...levelRates, ...tierRates, 0))
}

/** The rate a typical member actually gets — the middle bundle. */
export function typicalSubscriptionRate(config: PricingConfig = getPricingConfig()): number {
  return round4(config.levelSubscriptionDiscount.performance ?? config.subscriptionDiscount)
}

/** The months a price is judged over — the earliest a member can leave. */
export function pricingHorizonMonths(config: PricingConfig = getPricingConfig()): number {
  return Math.max(1, config.goodPricing.horizonMonths ?? config.minSubscriptionMonths)
}

export interface GoodPriceInput {
  /** What the supplier charges us for one unit, ex VAT — the asset price (£). */
  assetPrice: number
  /** Shipped weight of one unit (g). Null = the configured default, and we say so. */
  grams?: number | null
  /** VAT rate for the goods (0–1). Null = standard. */
  vatRate?: number | null
  /** Units in one shipment. Default 1. */
  unitsPerShipment?: number
  /** Months between shipments — a 90-serving tub on a daily dose ships quarterly. */
  shipEveryMonths?: number
  /** An existing shelf price to grade against the model (£ inc VAT). */
  listPrice?: number
}

/** How a member could be paying for this product. */
export type ScenarioId = 'one-off' | 'subscription-typical' | 'subscription-worst'

export interface Scenario {
  id: ScenarioId
  label: string
  /** What this path means, in a sentence. */
  description: string
  /** Discount applied to the shelf price on this path (0–1). */
  discount: number
  /** Extra first-month discount, where the path has one (0–1). */
  introDiscount: number
  /** The stack at the price being graded. */
  economics: UnitEconomics
  /** Effective monthly contribution over the horizon (£). */
  contribution: number
  marginPct: number
  profitable: boolean
}

export interface GoodPriceResult {
  assumptions: {
    subscriptionDiscount: number
    typicalDiscount: number
    firstMonthDiscount: number
    horizonMonths: number
    absorbsDelivery: boolean
    grams: number
    weightKnown: boolean
    vatRegistered: boolean
  }
  /** What one month of this product costs us, before anyone is charged. */
  monthlyCost: { goods: number; delivery: number; total: number }
  /** Shelf price at which the worst case exactly breaks even (£ inc VAT). */
  breakEvenPrice: number | null
  /** Shelf price hitting the target margin on the worst case — the recommendation. */
  goodPrice: number | null
  /** What the member pays each month at that price, after the deepest discount. */
  goodPriceMonthlyNet: number
  /** The three ways this product can be bought, at `listPrice ?? goodPrice`. */
  scenarios: Scenario[]
  /** Grade of `input.listPrice`, when one was given. */
  atListPrice: {
    listPrice: number
    marginPct: number
    profitable: boolean
    meetsTarget: boolean
    vsGoodPrice: number
  } | null
}

/**
 * The effective shelf price a discounted path is really worth over the horizon.
 *
 * Every month carries the ongoing discount; the first month carries the intro
 * offer on top. Over H months that averages to
 * `P × (1 − d) × (H − dIntro) ÷ H` per month — not `P × (1 − d)`, which is the
 * mistake that makes an intro offer look free.
 */
function effectiveMonthlyPrice(
  listPrice: number,
  discount: number,
  introDiscount: number,
  horizonMonths: number,
): number {
  return round((listPrice * (1 - discount) * (horizonMonths - introDiscount)) / horizonMonths)
}

/** What one month of this product costs us, goods and postage both. */
export function landedMonthlyCost(input: GoodPriceInput, config: PricingConfig = getPricingConfig()) {
  const units = Math.max(1, input.unitsPerShipment ?? 1)
  const months = Math.max(1, input.shipEveryMonths ?? 1)
  const { grams } = shipmentWeight([{ weightGrams: input.grams ?? null, quantity: units }], config)
  // Reuse the real stack for one shipment so the cost basis can never drift
  // from what the waterfall shows.
  const shipment = unitEconomics(
    { shelfPrice: 0, supplierCost: input.assetPrice, grams: input.grams, vatRate: input.vatRate, quantity: units, chargeDelivery: false },
    config,
  )
  return {
    goods: round(shipment.productCost / months),
    delivery: round(shipment.deliveryCost / months),
    total: round((shipment.productCost + shipment.deliveryCost) / months),
    grams,
  }
}

export function goodPriceFor(input: GoodPriceInput, config: PricingConfig = getPricingConfig()): GoodPriceResult {
  const horizon = pricingHorizonMonths(config)
  const units = Math.max(1, input.unitsPerShipment ?? 1)
  const shipEvery = Math.max(1, input.shipEveryMonths ?? 1)
  const worstRate = worstCaseSubscriptionRate(config)
  const typicalRate = typicalSubscriptionRate(config)
  const intro = Math.min(1, Math.max(0, config.introOffer.effectiveFirstMonthDiscount))

  const { grams, weightKnown } = shipmentWeight([{ weightGrams: input.grams ?? null, quantity: units }], config)
  const monthlyCost = landedMonthlyCost(input, config)

  const economicsInput = {
    supplierCost: input.assetPrice,
    grams: input.grams,
    vatRate: input.vatRate,
    quantity: units,
    // The worst case is that we carry the postage, which is also what happens
    // on any subscription clearing the free-delivery threshold.
    chargeDelivery: !config.goodPricing.assumeFreeDelivery,
  }

  // Solve on the DISCOUNTED price the member actually pays, then gross it back
  // up to a shelf price. Solving on the shelf price and discounting afterwards
  // would hit the target margin on a price nobody pays.
  const discountFactor = (1 - worstRate) * ((horizon - intro) / horizon)
  const target = Math.min(0.95, Math.max(0, config.goodPricing.targetMarginPct))

  const netTarget = priceForMargin(target, economicsInput, config)
  const netBreakEven = priceForMargin(0, economicsInput, config)

  const goodPrice = netTarget != null && discountFactor > 0 ? roundUp(netTarget / discountFactor) : null
  const breakEvenPrice = netBreakEven != null && discountFactor > 0 ? roundUp(netBreakEven / discountFactor) : null

  const priceToGrade = input.listPrice ?? goodPrice ?? 0

  const build = (id: ScenarioId, label: string, description: string, discount: number, introDiscount: number): Scenario => {
    const effective = effectiveMonthlyPrice(priceToGrade, discount, introDiscount, horizon)
    const economics = unitEconomics({ ...economicsInput, shelfPrice: effective }, config)
    return {
      id,
      label,
      description,
      discount,
      introDiscount,
      economics,
      contribution: economics.contribution,
      marginPct: economics.marginPct,
      profitable: economics.contribution > 0,
    }
  }

  const scenarios: Scenario[] = [
    build('one-off', 'Bought once', 'Full shelf price, no plan. The best we do on a single sale.', 0, 0),
    build('subscription-typical', 'Typical subscriber', `The middle bundle's ${Math.round(typicalRate * 100)}% subscribe-&-save, past the first month.`, typicalRate, 0),
    build('subscription-worst', 'Worst case', `The largest bundle's ${Math.round(worstRate * 100)}% rate, the average first-month offer, cancelled at the earliest point.`, worstRate, intro),
  ]

  const worst = scenarios[2]

  return {
    assumptions: {
      subscriptionDiscount: worstRate,
      typicalDiscount: typicalRate,
      firstMonthDiscount: round4(intro),
      horizonMonths: horizon,
      absorbsDelivery: config.goodPricing.assumeFreeDelivery,
      grams,
      weightKnown,
      vatRegistered: config.vat.registered,
    },
    monthlyCost: { goods: monthlyCost.goods, delivery: monthlyCost.delivery, total: monthlyCost.total },
    breakEvenPrice,
    goodPrice,
    goodPriceMonthlyNet: goodPrice != null ? round((goodPrice * (1 - worstRate)) / shipEvery) : 0,
    scenarios,
    atListPrice:
      input.listPrice != null
        ? {
            listPrice: round(input.listPrice),
            marginPct: worst.marginPct,
            profitable: worst.profitable,
            meetsTarget: worst.marginPct >= target,
            vsGoodPrice: goodPrice != null ? round(input.listPrice - goodPrice) : 0,
          }
        : null,
  }
}

/**
 * Grade a catalogue product against the model.
 *
 * Falls back to the configured cost ratio when a product has no cost, and to
 * the default weight when it has none recorded — so the audit covers the whole
 * catalogue rather than only the tidy half. Both fallbacks are reported, because
 * a guessed input makes a guessed verdict and the hub has to say which is which.
 */
export function auditProductPrice(
  product: {
    title: string
    basePrice: number
    cost?: number | null
    servings?: number | null
    weightGrams?: number | null
    vatRate?: number | null
    supplierRrp?: number | null
  },
  config: PricingConfig = getPricingConfig(),
): GoodPriceResult & {
  title: string
  costEstimated: boolean
  weightEstimated: boolean
  /** How our price compares with the supplier's RRP (0–1 under, negative = over). */
  vsRrpPct: number | null
} {
  const costEstimated = product.cost == null
  // The shelf price includes VAT, so an estimate taken from it must come off the
  // net price or it is a fifth too high before anything else happens.
  const netShelf = config.vat.registered
    ? product.basePrice / (1 + (product.vatRate ?? config.vat.standardRate))
    : product.basePrice
  const assetPrice = costEstimated ? round(netShelf * config.defaultCostRatio) : product.cost!

  // A tub bigger than a month's supply ships less often than it bills, capped by
  // the same rule the subscription scheduler uses so the two never disagree.
  const shipEveryMonths = Math.min(
    config.maxDeliveryMonths,
    Math.max(1, Math.round((product.servings ?? 30) / 30)),
  )

  const result = goodPriceFor(
    {
      assetPrice,
      grams: product.weightGrams,
      vatRate: product.vatRate,
      shipEveryMonths,
      listPrice: product.basePrice,
    },
    config,
  )

  return {
    ...result,
    title: product.title,
    costEstimated,
    weightEstimated: !result.assumptions.weightKnown,
    vsRrpPct:
      product.supplierRrp && product.supplierRrp > 0
        ? round4((product.supplierRrp - product.basePrice) / product.supplierRrp)
        : null,
  }
}

/**
 * Whether the catalogue can keep the PowerBody account open.
 *
 * They require a minimum monthly wholesale spend, and losing the account is a
 * bigger problem than any single price. Expressed as orders-per-month at a given
 * average order value, because that is the number a founder can actually
 * influence.
 */
export function supplierAccountCheck(
  averageOrderValue: number,
  ordersPerMonth: number,
  averageCostRatio: number,
  config: PricingConfig = getPricingConfig(),
): {
  minimumSpend: number
  projectedSpend: number
  ordersNeeded: number
  meetsMinimum: boolean
  targetOrderValue: number
  vsTargetOrderValue: number
} {
  const minimumSpend = config.supplierAccount.minimumMonthlySpend
  const spendPerOrder = Math.max(0.01, averageOrderValue * averageCostRatio)
  const projectedSpend = round(spendPerOrder * ordersPerMonth)
  return {
    minimumSpend,
    projectedSpend,
    ordersNeeded: Math.ceil(minimumSpend / spendPerOrder),
    meetsMinimum: projectedSpend >= minimumSpend,
    targetOrderValue: config.supplierAccount.targetOrderValue,
    vsTargetOrderValue: round(averageOrderValue - config.supplierAccount.targetOrderValue),
  }
}
