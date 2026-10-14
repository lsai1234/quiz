/**
 * What the last-chance offer can afford to take off — per product, never a
 * flat rate.
 *
 * ── Why the discount is worked out, not chosen ──────────────────────────────
 * A single product ships alone, and alone is the worst case this business has:
 * PowerBody charge us £6.50 to post an order under £50 of wholesale and we
 * collect £4.95 (or £2.95 from £40), so the parcel itself loses money before
 * the goods are counted. Run through `unitEconomics` — VAT, the goods, both
 * sides of delivery, card fees and the returns provision — a £34.99 protein
 * makes about £8 at full price, a £19.99 creatine about £3, and a £12.99
 * vitamin well under £1. A flat 25% would sell the cheap end at a loss.
 *
 * So the offer walks down a short ladder and takes the deepest rung that still
 * leaves the order above the floor — and offers nothing off when even full
 * price does not clear it. The figure on the card is therefore a promise the
 * checkout can keep: the server re-runs this same function before charging.
 *
 * ── The floor ───────────────────────────────────────────────────────────────
 * At least £3.00 of contribution AND at least 10% of what we keep. The pound
 * figure protects cheap products, where a percentage of very little is very
 * little; the percentage protects dear ones, where £3 would be giving most of
 * the margin away.
 *
 * ── Unknown costs ───────────────────────────────────────────────────────────
 * A product with no supplier cost on file is costed at the site-wide estimate
 * (`defaultCostRatio`, deliberately pessimistic), and its discount is capped at
 * 10% on top — a guess is not a number to spend 20% against.
 *
 * Pure and client-safe: the card quotes with it and the server enforces with it.
 */
import { getPricingConfig, priceOneOffLines, unitCostOf, type PricingConfig } from '@/lib/stack-blueprint/pricing'
import type { CatalogueProduct, CatalogueVariant } from '@/lib/catalogue/types'
import { customerDeliveryCharge } from '@/lib/pricing/delivery'
import { unitEconomics } from '@/lib/pricing/unit-economics'

const round = (n: number) => Math.round(n * 100) / 100

/** The rungs, deepest first. Never 25%: that is the daily code's, and this sells alone. */
export const OFFER_LADDER = [0.2, 0.15, 0.1, 0.05] as const

export interface OfferFloor {
  /** Minimum contribution per order (£). */
  minContribution: number
  /** Minimum contribution as a share of net revenue (0–1). */
  minMarginPct: number
}

export const OFFER_FLOOR: OfferFloor = { minContribution: 3, minMarginPct: 0.1 }

/** The deepest a product with no cost on file may go. */
export const UNCOSTED_MAX_DISCOUNT = 0.1

export interface OfferProduct {
  /** Shelf price of the variant being offered (£ inc VAT). */
  price: number
  /** What PowerBody charge us for it (£ ex VAT), or null when unknown. */
  supplierCost: number | null
  /**
   * The cost the checkout's margin floor reads (`unitCostOf`). Usually the same
   * figure; kept separate so the quote prices through `priceOneOffLines`
   * exactly as `/api/cart` will. Defaults to `supplierCost`, then an estimate.
   */
  floorCost?: number
  grams?: number | null
  vatRate?: number | null
}

/** The offer inputs for a catalogue variant — the same fields the checkout and the order read. */
export function offerProductFor(
  product: Pick<CatalogueProduct, 'cost' | 'basePrice' | 'weightGrams' | 'vatRate'>,
  variant: Pick<CatalogueVariant, 'price'> & { cost?: number | null },
  config: PricingConfig = getPricingConfig(),
): OfferProduct {
  return {
    price: variant.price,
    supplierCost: variant.cost ?? product.cost ?? null,
    floorCost: unitCostOf(product, variant.price, config),
    grams: product.weightGrams ?? null,
    vatRate: product.vatRate ?? null,
  }
}

export interface OfferQuote {
  listPrice: number
  /** What the product sells for in this offer (£ inc VAT). */
  offerPrice: number
  /** Whole percent off, e.g. 15. 0 when no rung clears the floor. */
  discountPct: number
  /** The ladder rung used (0–1) — what the checkout applies, as a code's rate would be. */
  rate: number
  saving: number
  /** What the customer pays for delivery on this order (UK mainland). */
  deliveryCharge: number
  /** offerPrice + deliveryCharge. */
  total: number
  /**
   * What the whole order costs less than at full price, delivery included. The
   * same as `saving` while delivery is banded on the list price, as it is; kept
   * separate so a change there can never turn a headline saving into none.
   */
  totalSaving: number
  /** What the business keeps after every cost, at the offer price (£). */
  contribution: number
  /** contribution ÷ net revenue. */
  marginPct: number
  /** The floor this order had to clear (£). */
  floor: number
  /**
   * False when the order cannot be made at a profit — even full price is under
   * the floor — or is under the checkout's minimum order. The offer is not made.
   */
  viable: boolean
  costKnown: boolean
}

/** The contribution an order has to clear: the larger of the pound and percentage floors. */
export function floorFor(netRevenue: number, floor: OfferFloor = OFFER_FLOOR): number {
  return round(Math.max(floor.minContribution, floor.minMarginPct * netRevenue))
}

/**
 * The deepest safe discount on one product, and the order it makes.
 *
 * Delivery is charged — and modelled — on the list price, which is what the
 * checkout bands on (the undiscounted subtotal), so the postage on the card is
 * the postage on the charge and a discount can never be eaten by a higher band.
 */
export function quoteOffer(
  product: OfferProduct,
  opts: { floor?: OfferFloor; ladder?: readonly number[] } = {},
  config: PricingConfig = getPricingConfig(),
): OfferQuote {
  const floor = opts.floor ?? OFFER_FLOOR
  const ladder = [...(opts.ladder ?? OFFER_LADDER)].sort((a, b) => b - a)
  const costKnown = product.supplierCost != null && product.supplierCost > 0
  const listPrice = round(product.price)

  const floorCost = product.floorCost ?? product.supplierCost ?? round(listPrice * config.defaultCostRatio)

  const at = (rate: number): OfferQuote => {
    // Priced by the checkout's own function, so the bundle tier and the margin
    // floor land exactly as they will on the card charge: a one-product order
    // over the tier line earns the tier anyway, and the deeper of the two wins.
    const offerPrice = priceOneOffLines([{ price: listPrice, cost: floorCost, quantity: 1 }], config, rate).total
    const econ = unitEconomics(
      {
        shelfPrice: offerPrice,
        supplierCost: costKnown ? product.supplierCost : null,
        grams: product.grams ?? null,
        vatRate: product.vatRate ?? null,
        // The checkout bands delivery on the undiscounted subtotal — for one
        // product, its list price — so the discount never moves the postage.
        freeDeliveryBasis: listPrice,
      },
      config,
    )
    const deliveryCharge = customerDeliveryCharge(listPrice, 'uk-1', config)
    const fullTotal = round(listPrice + customerDeliveryCharge(listPrice, 'uk-1', config))
    const need = floorFor(econ.netRevenue, floor)
    return {
      listPrice,
      offerPrice,
      discountPct: listPrice > 0 ? Math.round(((listPrice - offerPrice) / listPrice) * 100) : 0,
      rate,
      saving: round(listPrice - offerPrice),
      deliveryCharge,
      total: round(offerPrice + deliveryCharge),
      totalSaving: round(fullTotal - (offerPrice + deliveryCharge)),
      contribution: econ.contribution,
      marginPct: econ.marginPct,
      floor: need,
      viable: econ.contribution >= need && offerPrice >= config.minOrderValue,
      costKnown,
    }
  }

  if (listPrice <= 0) return { ...at(0), viable: false }

  for (const rate of ladder) {
    if (rate <= 0) continue
    if (!costKnown && rate > UNCOSTED_MAX_DISCOUNT) continue
    const quote = at(rate)
    // A discount has to be worth having on the order as a whole — at least £1
    // and most of what it says — or it is a headline, not an offer.
    const worthIt = quote.totalSaving >= Math.max(1, quote.saving * 0.75)
    if (quote.viable && worthIt) return quote
  }
  return at(0)
}
