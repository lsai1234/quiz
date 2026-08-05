/**
 * What to put on the shelf.
 *
 * ONE RULE
 * ────────
 *     list price = what PowerBody charge us × 2, rounded down to .99
 *
 * That's it. A number we own, that we can explain in a sentence, and that works
 * for every product including the ones with no RRP on file.
 *
 * WHY NOT PRICE OFF THE SUPPLIER'S RRP
 * ────────────────────────────────────
 * This module used to. It worked backwards from PowerBody's recommended retail
 * price and added a small premium, which produced sensible prices — but it made
 * every price in the shop depend on somebody else's *suggestion*. An RRP is not
 * a fact: it varies by brand, PowerBody can change it, and some products don't
 * carry one at all. Hanging the whole catalogue off it meant a supplier feed
 * update could silently reprice the shop.
 *
 * Pricing from cost lands in the same place anyway. Across the catalogue their
 * RRP is about 1.94× their wholesale, so doubling what we pay puts us within a
 * few percent of the market — we just get there by our own rule.
 *
 * RRP PLAYS NO PART
 * ─────────────────
 * It is kept as a was-price and reported for interest, and nothing reads it. It
 * was briefly retained as a cross-check that flagged prices drifting above the
 * brand's own recommendation, but a flag nobody acts on is one more number on a
 * screen that already had too many.
 *
 * Whether a price WORKS is a separate question, answered by `./scenarios.ts` —
 * it runs the product through every route a customer can take and says which,
 * if any, lose money.
 */
import { getPricingConfig, type PricingConfig } from '@/lib/stack-blueprint/pricing'
import { unitEconomics } from './unit-economics'

const round = (n: number) => Math.round(n * 100) / 100
const round4 = (n: number) => Math.round(n * 10000) / 10000

/**
 * Round a price DOWN to a .99 ending.
 *
 * Down, not to nearest: rounding up nudges the price past the round number the
 * customer is comparing against, and on a discounted line it can turn a saving
 * into a markup. Landing a few pence under costs nothing.
 */
export function roundTo99(price: number): number {
  if (price <= 0) return 0
  return Math.max(0.99, Math.floor(price) - 0.01)
}

/** The shelf price for a product, from what the supplier charges us. */
export function listPriceFor(supplierCost: number, config: PricingConfig = getPricingConfig()): number {
  if (supplierCost <= 0) return 0
  const raw = supplierCost * config.listPricing.markupOnCost
  return config.listPricing.roundTo99 ? roundTo99(raw) : round(raw)
}

export interface ProductPriceInput {
  title?: string
  /** What we pay the supplier, ex VAT (£). The only input the price depends on. */
  cost?: number | null
  /** The supplier's RRP, when they publish one. Reported, never acted on. */
  supplierRrp?: number | null
  /** Servings per unit, for working out how often it ships. */
  servings?: number | null
  /** The price currently on the shelf (£ inc VAT), for comparison. */
  currentPrice?: number | null
  /**
   * Products sharing the parcel this one ships in. Defaults to the configured
   * stack size, because that is how the quiz sells; pass 1 to price a product
   * that genuinely ships alone.
   */
  sharedParcelItems?: number | null
}

export interface ProductPrice {
  title: string
  /** What we pay the supplier (£ ex VAT). */
  cost: number
  /** The shelf price (£ inc VAT). */
  listPrice: number
  /** What a subscriber on the middle bundle pays (£). */
  subscriberPrice: number
  /** What we keep on one month of this product at the subscriber price (£). */
  keeps: number
  /** keeps ÷ what we keep of the price (0–1). */
  marginPct: number
  /** True when the product makes money at the subscriber price. */
  viable: boolean
  /** This product's share of one delivery (£). */
  deliveryShare: number
  /** Products assumed to share the parcel. */
  sharedParcelItems: number
  /** The supplier's RRP, when there is one (£). */
  rrp: number | null
  /** How far our list price sits above their RRP (0–1). Negative = below.
   *  Reported for interest; nothing acts on it. */
  vsRrp: number | null
  /** How far the current shelf price is from the rule (£). */
  vsCurrentPrice: number | null
  /** Set when something about this product needs a decision. */
  warning: string | null
}

/** Price one product, and say whether it works. */
export function priceProduct(
  input: ProductPriceInput,
  config: PricingConfig = getPricingConfig(),
): ProductPrice {
  const title = input.title ?? 'Untitled'
  const cost = Math.max(0, input.cost ?? 0)
  const listPrice = listPriceFor(cost, config)

  // A big tub bills monthly but ships quarterly, and that decides its share of a
  // delivery charge.
  const shipEveryMonths = Math.min(
    config.maxDeliveryMonths,
    Math.max(1, Math.round((input.servings ?? 30) / 30)),
  )
  const parcelItems = Math.max(1, Math.round(input.sharedParcelItems ?? config.orderMix.itemsPerOrder ?? 1))

  const subscriberPrice = round(listPrice * (1 - config.levelSubscriptionDiscount.performance))

  // Price the whole SHIPMENT, then divide back to a month — slicing into months
  // first charges a full delivery every month on a tub that ships quarterly.
  const shipment = unitEconomics(
    { shelfPrice: subscriberPrice, supplierCost: cost, chargeDelivery: false, sharedParcelItems: parcelItems },
    config,
  )

  const rrp = input.supplierRrp != null && input.supplierRrp > 0 ? round(input.supplierRrp) : null
  const vsRrp = rrp != null ? round4((listPrice - rrp) / rrp) : null

  const keeps = round(shipment.contribution / shipEveryMonths)

  return {
    title,
    cost: round(cost),
    listPrice,
    subscriberPrice,
    keeps,
    marginPct: shipment.marginPct,
    viable: keeps > 0,
    deliveryShare: shipment.deliveryCost,
    sharedParcelItems: parcelItems,
    rrp,
    vsRrp,
    vsCurrentPrice: input.currentPrice != null ? round(listPrice - input.currentPrice) : null,
    warning: warningFor({ viable: keeps > 0, hasCost: cost > 0 }),
  }
}

function warningFor(p: { viable: boolean; hasCost: boolean }): string | null {
  if (!p.hasCost) return 'No supplier price on file, so we cannot price this product at all.'
  if (!p.viable) {
    return 'Loses money once it has carried its share of the postage. Usually best kept off subscription.'
  }
  return null
}

export interface CatalogueReview {
  rows: ProductPrice[]
  /** Products that lose money. */
  losing: number
  /** Products with no supplier price, so no price at all. */
  uncosted: number
  /** What we keep on an average product, as a share of its price (0–1). */
  averageMargin: number
  /** The markup rule in force. */
  markupOnCost: number
}

/** Run the rule over the whole catalogue, worst first. */
export function reviewCatalogue(
  products: ProductPriceInput[],
  config: PricingConfig = getPricingConfig(),
): CatalogueReview {
  const rows = products.map((p) => priceProduct(p, config)).sort((a, b) => a.marginPct - b.marginPct)
  return {
    rows,
    losing: rows.filter((r) => !r.viable).length,
    uncosted: rows.filter((r) => r.cost <= 0).length,
    averageMargin: rows.length > 0 ? round4(rows.reduce((s, r) => s + r.marginPct, 0) / rows.length) : 0,
    markupOnCost: config.listPricing.markupOnCost,
  }
}
