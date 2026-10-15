/**
 * The deal the last-chance offer makes on one product — worked out for that
 * product, never a flat rate, and never at a loss.
 *
 * ── Why it is worked out ────────────────────────────────────────────────────
 * A single product ships alone, and alone is the worst case this business has:
 * PowerBody charge us £6.50 to post an order under £50 of wholesale, whatever
 * we charge the customer. Run through `unitEconomics` — the goods, both sides
 * of delivery, card fees, the returns provision and (when the switch in
 * settings says we pay it) VAT — a £29.99 product makes a healthy margin with
 * postage charged, a £19.99 one makes a few pounds, and a £12.99 one almost
 * nothing. A flat "25% off" would sell the cheap end at a loss.
 *
 * ── The order the levers are pulled in ──────────────────────────────────────
 * 1. Delivery goes first. Free delivery is the easiest thing to say yes to and
 *    the thing that most often stops a small order, so it is the lead.
 * 2. Then a percentage off the product: the deepest whole percent that still
 *    clears the floor, up to `maxDiscountPct`. Below `minDiscountPct` it is
 *    left off — "free delivery" reads as a deal, "free delivery and 2% off"
 *    reads as a rounding error.
 * 3. Where free delivery would sell at a loss, delivery is REDUCED instead, to
 *    the lowest of a few real-looking prices (£0.99, £1.49, …) that clears the
 *    floor. No percentage on top: delivery is the lever that matters most.
 * 4. If even that does not clear the floor — or full price itself does not —
 *    there is no deal, and the offer is not made.
 *
 * ── Priced on its own ───────────────────────────────────────────────────────
 * Nothing on the page above changes it: not the stack's bundle deal, not the
 * daily code, not a partner's code. The percentage comes off what the product
 * costs on its own at the ordinary checkout (`ordinaryPriceOf` — the shelf
 * price, less the bundle tier a single £50+ product earns anyway), so every
 * saving it states is one the customer would not otherwise have had. The
 * checkout bills exactly this figure and this delivery (the server re-runs
 * this same function first).
 *
 * ── The floor ───────────────────────────────────────────────────────────────
 * `config.lastChance`: at least `minContribution` (£) AND at least
 * `minMarginPct` of what we keep. The pound figure protects cheap products,
 * where a percentage of very little is very little; the percentage protects
 * dear ones, where a few pounds would be giving most of the margin away.
 *
 * ── Unknown costs ───────────────────────────────────────────────────────────
 * A product with no supplier cost on file is costed at the site-wide estimate
 * (`defaultCostRatio`, deliberately pessimistic) and its percentage is capped
 * at `uncostedMaxDiscountPct` — a guess is not a number to spend 25% against.
 *
 * Pure and client-safe: the card quotes with it and the server enforces with it.
 */
import {
  getPricingConfig,
  priceOneOffLines,
  unitCostOf,
  type OneOffPricing,
  type PricingConfig,
} from '@/lib/stack-blueprint/pricing'
import type { CatalogueProduct, CatalogueVariant } from '@/lib/catalogue/types'
import { customerDeliveryCharge, deliveryOptions, type DeliveryOption } from '@/lib/pricing/delivery'
import { unitEconomics } from '@/lib/pricing/unit-economics'
import { revenueFromShelfPrice, vatRateFor } from '@/lib/pricing/vat'

const round = (n: number) => Math.round(n * 100) / 100

export type OfferSettings = PricingConfig['lastChance']

/**
 * What a reduced delivery charge may be, cheapest first — prices a shop would
 * actually print, rather than the £1.27 the arithmetic lands on.
 */
export const REDUCED_DELIVERY_PRICES = [0.99, 1.49, 1.99, 2.49, 2.99, 3.49, 3.99] as const

export interface OfferProduct {
  /** Shelf price of the variant being offered (£ inc VAT). */
  price: number
  /** What PowerBody charge us for it (£ ex VAT), or null when unknown. */
  supplierCost: number | null
  grams?: number | null
  vatRate?: number | null
}

/** The offer inputs for a catalogue variant — the same fields the checkout and the order read. */
export function offerProductFor(
  product: Pick<CatalogueProduct, 'cost' | 'weightGrams' | 'vatRate'>,
  variant: Pick<CatalogueVariant, 'price'> & { cost?: number | null },
): OfferProduct {
  return {
    price: variant.price,
    supplierCost: variant.cost ?? product.cost ?? null,
    grams: product.weightGrams ?? null,
    vatRate: product.vatRate ?? null,
  }
}

/**
 * What this product costs bought on its own through the ordinary checkout —
 * the shop's automatic bundle tier included (a £50+ product earns it alone).
 *
 * This is the price the deal comes off and is measured against. Measured
 * against the shelf price instead, a £59.99 tub would claim a saving of 8% it
 * would have had anyway — "you save £17.95" on an order that saves £13.15.
 */
export function ordinaryPriceOf(product: OfferProduct, config: PricingConfig = getPricingConfig()): number {
  const cost = product.supplierCost ?? unitCostOf({ basePrice: product.price }, product.price, config)
  return priceOneOffLines([{ price: round(product.price), cost, quantity: 1 }], config, 0).total
}

/**
 * What the deal does to delivery.
 * - `free` — we waive the mainland charge this product would carry alone.
 * - `reduced` — we cut it.
 * - `included` — at this price delivery is free anyway; nothing to waive.
 * - `standard` — no deal on delivery (only ever on a quote that is not viable).
 */
export type DeliveryDeal = 'free' | 'reduced' | 'included' | 'standard'

export interface OfferQuote {
  /** Shelf price (£ inc VAT). */
  listPrice: number
  /**
   * What it costs on its own through the ordinary checkout (`ordinaryPriceOf`)
   * — the shelf price, less the bundle tier where a single one earns it. The
   * percentage comes off this, and every saving is measured from it.
   */
  basePrice: number
  /** What the product sells for in this deal (£ inc VAT). */
  offerPrice: number
  /** Whole percent off `basePrice`, e.g. 15. 0 when the deal is delivery alone. */
  discountPct: number
  /** discountPct as a fraction (0–1). */
  rate: number
  /** Off the product: basePrice − offerPrice (£). */
  saving: number
  /** What mainland delivery would cost on this product alone, at full price (£). */
  standardDelivery: number
  /** What mainland delivery costs in this deal (£). The Highlands surcharge still applies up there. */
  deliveryCharge: number
  deliveryDeal: DeliveryDeal
  /** standardDelivery − deliveryCharge (£). */
  deliverySaving: number
  /**
   * basePrice + standardDelivery: what the ordinary checkout would charge for
   * it delivered, without the deal (£).
   */
  normalTotal: number
  /** offerPrice + deliveryCharge: what it costs delivered with it (£). */
  total: number
  /** normalTotal − total (£). A deal is only made when this is at least £1. */
  totalSaving: number
  /** What the business keeps after every cost, in this deal (£). */
  contribution: number
  /** contribution ÷ net revenue. */
  marginPct: number
  /** The floor this order had to clear (£). */
  floor: number
  /**
   * True only when there IS a deal — something comes off the delivered price —
   * and the order still clears the floor and the checkout's minimum. False
   * means no offer is made.
   */
  viable: boolean
  costKnown: boolean
}

/** The contribution an order has to clear: the larger of the pound and percentage floors. */
export function floorFor(netRevenue: number, settings: OfferSettings = getPricingConfig().lastChance): number {
  return round(Math.max(settings.minContribution, settings.minMarginPct * netRevenue))
}

/** The best deal on one product that still leaves the business a profit. */
export function quoteOffer(
  product: OfferProduct,
  config: PricingConfig = getPricingConfig(),
  settings: OfferSettings = config.lastChance,
): OfferQuote {
  const costKnown = product.supplierCost != null && product.supplierCost > 0
  const listPrice = round(product.price)
  const basePrice = listPrice > 0 ? ordinaryPriceOf(product, config) : 0
  // Delivery bands on the undiscounted value, as the checkout does.
  const standardDelivery = listPrice > 0 ? customerDeliveryCharge(listPrice, 'uk-1', config) : 0
  const normalTotal = round(basePrice + standardDelivery)
  // With no cost on file, estimate it ONCE, from the shelf price — the way
  // `unitEconomics` would at full price. Left to `unitEconomics` at each
  // discounted price, the guessed cost would fall with every percent off,
  // which PowerBody's never does, and the floor would let too much go.
  const supplierCost = costKnown
    ? product.supplierCost!
    : round(revenueFromShelfPrice(listPrice, vatRateFor(product, config), config) * config.defaultCostRatio)

  const at = (pct: number, deliveryCharge: number, deliveryDeal: DeliveryDeal): OfferQuote => {
    const offerPrice = round(basePrice * (1 - pct / 100))
    const econ = unitEconomics(
      {
        shelfPrice: offerPrice,
        supplierCost,
        grams: product.grams ?? null,
        vatRate: product.vatRate ?? null,
        customerDelivery: deliveryCharge,
      },
      config,
    )
    const total = round(offerPrice + deliveryCharge)
    return {
      listPrice,
      basePrice,
      offerPrice,
      discountPct: pct,
      rate: pct / 100,
      saving: round(basePrice - offerPrice),
      standardDelivery,
      deliveryCharge,
      deliveryDeal,
      deliverySaving: round(standardDelivery - deliveryCharge),
      normalTotal,
      total,
      totalSaving: round(normalTotal - total),
      contribution: econ.contribution,
      marginPct: econ.marginPct,
      floor: floorFor(econ.netRevenue, settings),
      viable: false,
      costKnown,
    }
  }
  const clears = (q: OfferQuote) => q.contribution >= q.floor && q.offerPrice >= config.minOrderValue
  // A deal is a deal: it beats the ordinary checkout by at least a pound.
  const deal = (q: OfferQuote): OfferQuote => ({ ...q, viable: clears(q) && q.totalSaving >= 1 })

  const full = at(0, standardDelivery, 'standard')
  // Nothing to give away when the order does not pay its way at full price.
  if (listPrice <= 0 || !clears(full)) return full

  // 1. Delivery first.
  let deliveryDeal: DeliveryDeal
  if (standardDelivery <= 0) {
    deliveryDeal = 'included'
  } else if (clears(at(0, 0, 'free'))) {
    deliveryDeal = 'free'
  } else {
    // 3. Free would lose money: cut it as far as the floor allows, and stop there.
    const reduced = REDUCED_DELIVERY_PRICES.filter((p) => p < standardDelivery)
      .map((p) => at(0, p, 'reduced'))
      .find(clears)
    return reduced ? deal(reduced) : full
  }

  // 2. Then the deepest whole percent off that still clears the floor.
  const cap = Math.floor(
    Math.min(settings.maxDiscountPct, costKnown ? 1 : settings.uncostedMaxDiscountPct) * 100 + 1e-9,
  )
  const least = Math.max(1, Math.ceil(settings.minDiscountPct * 100 - 1e-9))
  for (let pct = cap; pct >= least; pct--) {
    const q = at(pct, 0, deliveryDeal)
    if (clears(q)) return deal(q)
  }
  return deal(at(0, 0, deliveryDeal))
}

/** The deal in a few words — for the order's audit trail and analytics. */
export function describeDeal(q: Pick<OfferQuote, 'deliveryDeal' | 'discountPct' | 'deliveryCharge' | 'standardDelivery'>): string {
  const parts: string[] = []
  if (q.deliveryDeal === 'free') parts.push(`free delivery (was £${q.standardDelivery.toFixed(2)})`)
  if (q.deliveryDeal === 'reduced') parts.push(`delivery £${q.deliveryCharge.toFixed(2)} (was £${q.standardDelivery.toFixed(2)})`)
  if (q.discountPct > 0) parts.push(`${q.discountPct}% off`)
  return parts.join(' + ') || 'no deal'
}

/** A quote without the business's own figures — what may go back to a browser. */
export type PublicOfferQuote = Omit<OfferQuote, 'contribution' | 'marginPct' | 'floor' | 'costKnown'>

export function publicQuote(q: OfferQuote): PublicOfferQuote {
  const { contribution: _c, marginPct: _m, floor: _f, costKnown: _k, ...rest } = q
  return rest
}

/**
 * The order's pricing, from the deal alone — no tier, no code, no floor but
 * the deal's own. The same shape `priceOneOffLines` returns, so the checkout
 * bills from one object whichever path priced it.
 */
export function priceOfferOrder(q: OfferQuote): OneOffPricing {
  return {
    lines: [{ unitPrice: q.listPrice, discountedUnitPrice: q.offerPrice, quantity: 1, lineTotal: q.offerPrice }],
    subtotal: q.listPrice,
    total: q.offerPrice,
    discount: round(q.listPrice - q.offerPrice),
    tierPct: 0,
    tierLabel: null,
    partnerPct: 0,
    combinedPct: q.rate,
  }
}

/**
 * The delivery choices on an offer order: the deal's mainland charge, and the
 * same plus the Highlands surcharge up there — our cost in Zone 2 never goes
 * away, which is why the surcharge applies to the free band everywhere else too.
 */
export function offerDeliveryOptions(q: OfferQuote, config: PricingConfig = getPricingConfig()): DeliveryOption[] {
  return deliveryOptions(q.listPrice, config).map((o) => {
    const price = round(q.deliveryCharge + (o.zone === 'uk-2' ? config.delivery.zone2Surcharge : 0))
    return {
      ...o,
      price,
      label: o.zone === 'uk-1' && price === 0 ? 'Free UK mainland delivery' : o.label,
    }
  })
}
