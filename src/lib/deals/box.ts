/**
 * Member prices and the top-up box. Pure and server-safe; what reaches a
 * browser is `publicBox` (prices, never our costs).
 *
 *   One product   its member deal (`memberQuote`): the one-product calculator
 *                 (`quoteOffer`) with this kind's size from the Founders Hub as
 *                 the ceiling. Delivery first, then the deepest whole percent
 *                 up to that size that still keeps the floor.
 *   A box         each product at its own member percent, in one parcel.
 *                 Delivery is free at or over the founders' threshold, or
 *                 when every product's own deal already waived it; otherwise
 *                 the usual charge for a box that size. Then the whole box is
 *                 checked against the floor, as one order: one parcel, one
 *                 card fee. If it doesn't clear, delivery is charged; if it
 *                 still doesn't, the percentages come off; if even full price
 *                 doesn't, there is no box.
 */
import type { CatalogueProduct, CatalogueVariant } from '@/lib/catalogue/types'
import { offerProductFor, quoteOffer, floorFor, type OfferQuote, type OfferSettings as DealFloorSettings } from '@/lib/last-chance/economics'
import { customerDeliveryCharge } from '@/lib/pricing/delivery'
import { unitEconomics } from '@/lib/pricing/unit-economics'
import { revenueFromShelfPrice, vatRateFor } from '@/lib/pricing/vat'
import { getPricingConfig, type OneOffPricing, type PricingConfig } from '@/lib/stack-blueprint/pricing'
import { DEFAULT_MEMBER_DEALS, type MemberDealSettings } from '@/lib/offer/settings'

const round = (n: number) => Math.round(n * 100) / 100

/** The size ceiling for a product's kind (0–1). */
export function sizeFor(product: Pick<CatalogueProduct, 'swapGroup'>, deals: MemberDealSettings = DEFAULT_MEMBER_DEALS): number {
  return deals.pct[product.swapGroup] ?? deals.defaultPct
}

/** The one-product calculator's settings, with this kind's size as the ceiling. */
export function memberFloorSettings(product: Pick<CatalogueProduct, 'swapGroup'>, deals: MemberDealSettings, config: PricingConfig): DealFloorSettings {
  const size = sizeFor(product, deals)
  return { ...config.lastChance, maxDiscountPct: size, minDiscountPct: Math.min(config.lastChance.minDiscountPct, size) }
}

/** A member's deal on one product. */
export function memberQuote(
  product: CatalogueProduct,
  variant: CatalogueVariant,
  deals: MemberDealSettings = DEFAULT_MEMBER_DEALS,
  config: PricingConfig = getPricingConfig(),
): OfferQuote {
  return quoteOffer(offerProductFor(product, variant), config, memberFloorSettings(product, deals, config))
}

export type BoxDelivery = 'free' | 'over-threshold' | 'standard' | 'included' | 'reduced'

export interface BoxLine {
  productId: string
  variantId: string
  title: string
  /** Shelf price (£ inc VAT). */
  listPrice: number
  /** What it costs on its own at the ordinary checkout. */
  basePrice: number
  /** What it costs in this box. */
  offerPrice: number
  discountPct: number
}

export interface BoxQuote {
  lines: BoxLine[]
  /** Σ shelf prices. */
  subtotal: number
  /** Σ offer prices. */
  goods: number
  /** What the box's delivery would be at the ordinary checkout. */
  standardDelivery: number
  deliveryCharge: number
  delivery: BoxDelivery
  /** goods + delivery. */
  total: number
  /** Σ base prices + standard delivery. */
  normalTotal: number
  totalSaving: number
  /** The founders' threshold this box was judged against (£). */
  freeOver: number
  contribution: number
  floor: number
  viable: boolean
}

export type PublicBox = Omit<BoxQuote, 'contribution' | 'floor'>

export function publicBox(b: BoxQuote): PublicBox {
  const { contribution: _c, floor: _f, ...rest } = b
  return rest
}

/** A box's whole economics, as one order. */
function boxEconomics(
  items: { product: CatalogueProduct; variant: CatalogueVariant; offerPrice: number }[],
  deliveryCharge: number,
  config: PricingConfig,
  floorSettings: DealFloorSettings,
): { contribution: number; floor: number } {
  const goods = round(items.reduce((s, i) => s + i.offerPrice, 0))
  // Costs as the one-product calculator takes them: known, or estimated once from the shelf price.
  const cost = round(
    items.reduce((s, i) => {
      const known = i.variant.cost ?? i.product.cost ?? null
      if (known != null && known > 0) return s + known
      return s + revenueFromShelfPrice(i.variant.price, vatRateFor(i.product, config), config) * config.defaultCostRatio
    }, 0),
  )
  const grams = items.every((i) => i.product.weightGrams) ? items.reduce((s, i) => s + (i.product.weightGrams ?? 0), 0) : null
  const rates = [...new Set(items.map((i) => vatRateFor(i.product, config)))]
  const econ = unitEconomics({ shelfPrice: goods, supplierCost: cost, grams, vatRate: rates.length === 1 ? rates[0] : null, customerDelivery: deliveryCharge }, config)
  return { contribution: econ.contribution, floor: floorFor(econ.netRevenue, floorSettings) }
}

/** A top-up box of member deals: one each, in one parcel. */
export function quoteBox(
  items: { product: CatalogueProduct; variant: CatalogueVariant }[],
  deals: MemberDealSettings = DEFAULT_MEMBER_DEALS,
  config: PricingConfig = getPricingConfig(),
): BoxQuote {
  const quotes = items.map((i) => ({ ...i, quote: memberQuote(i.product, i.variant, deals, config) }))
  const freeOver = deals.topUpFreeOver
  const lines = (pctOff: boolean): BoxLine[] =>
    quotes.map((q) => ({
      productId: q.product.id,
      variantId: q.variant.id,
      title: q.product.title,
      listPrice: q.quote.listPrice,
      basePrice: q.quote.basePrice,
      offerPrice: pctOff ? q.quote.offerPrice : q.quote.basePrice,
      discountPct: pctOff ? q.quote.discountPct : 0,
    }))

  // One product: its own deal, exactly as the one-product checkout prices it.
  if (quotes.length === 1) {
    const q = quotes[0].quote
    const delivery: BoxDelivery = q.deliveryDeal === 'free' ? 'free' : q.deliveryDeal === 'reduced' ? 'reduced' : q.deliveryDeal === 'included' ? 'included' : 'standard'
    return {
      lines: lines(true),
      subtotal: q.listPrice,
      goods: q.offerPrice,
      standardDelivery: q.standardDelivery,
      deliveryCharge: q.deliveryCharge,
      delivery,
      total: q.total,
      normalTotal: q.normalTotal,
      totalSaving: q.totalSaving,
      freeOver,
      contribution: q.contribution,
      floor: q.floor,
      viable: q.viable,
    }
  }

  const subtotal = round(quotes.reduce((s, q) => s + q.quote.listPrice, 0))
  const baseGoods = round(quotes.reduce((s, q) => s + q.quote.basePrice, 0))
  const standardDelivery = customerDeliveryCharge(baseGoods, 'uk-1', config)
  const normalTotal = round(baseGoods + standardDelivery)
  // The floor a box keeps: the strictest of its products' own.
  const floorSettings = quotes
    .map((q) => memberFloorSettings(q.product, deals, config))
    .reduce((a, b) => ({ ...a, minContribution: Math.max(a.minContribution, b.minContribution), minMarginPct: Math.max(a.minMarginPct, b.minMarginPct) }))

  const attempt = (pctOff: boolean, charge: 'deal' | 'standard'): BoxQuote => {
    const ls = lines(pctOff)
    const goods = round(ls.reduce((s, l) => s + l.offerPrice, 0))
    let delivery: BoxDelivery
    let deliveryCharge: number
    if (standardDelivery <= 0) {
      delivery = 'included'
      deliveryCharge = 0
    } else if (charge === 'deal' && goods >= freeOver) {
      delivery = 'over-threshold'
      deliveryCharge = 0
    } else if (charge === 'deal' && quotes.every((q) => q.quote.deliveryDeal === 'free' || q.quote.deliveryDeal === 'included')) {
      delivery = 'free'
      deliveryCharge = 0
    } else {
      delivery = 'standard'
      deliveryCharge = customerDeliveryCharge(goods, 'uk-1', config)
    }
    const econ = boxEconomics(
      quotes.map((q, i) => ({ product: q.product, variant: q.variant, offerPrice: ls[i].offerPrice })),
      deliveryCharge,
      config,
      floorSettings,
    )
    const total = round(goods + deliveryCharge)
    const clears = econ.contribution >= econ.floor && goods >= config.minOrderValue
    return {
      lines: ls,
      subtotal,
      goods,
      standardDelivery,
      deliveryCharge,
      delivery,
      total,
      normalTotal,
      totalSaving: round(normalTotal - total),
      freeOver,
      contribution: econ.contribution,
      floor: econ.floor,
      viable: clears && round(normalTotal - total) >= 1,
    }
  }
  // Deals and free delivery; then deals with delivery charged; then delivery alone. Full price is no deal.
  for (const [pctOff, charge] of [[true, 'deal'], [true, 'standard'], [false, 'deal']] as const) {
    const q = attempt(pctOff, charge)
    if (q.viable) return q
  }
  return { ...attempt(false, 'standard'), viable: false }
}

/** The box's pricing in the shape the checkout bills from (lines in the order given). */
export function priceBoxOrder(b: BoxQuote): OneOffPricing {
  return {
    lines: b.lines.map((l) => ({ unitPrice: l.listPrice, discountedUnitPrice: l.offerPrice, quantity: 1, lineTotal: l.offerPrice })),
    subtotal: b.subtotal,
    total: b.goods,
    discount: round(b.subtotal - b.goods),
    tierPct: 0,
    tierLabel: null,
    partnerPct: 0,
    combinedPct: b.subtotal > 0 ? round(1 - b.goods / b.subtotal) : 0,
  }
}

/** A box in a few words, for the order's audit trail. */
export function describeBox(b: BoxQuote): string {
  const items = b.lines.map((l) => `${l.title}${l.discountPct ? ` ${l.discountPct}% off` : ''}`).join(', ')
  const delivery = b.deliveryCharge === 0 ? 'free delivery' : `delivery £${b.deliveryCharge.toFixed(2)}`
  return `member deal: ${items}; ${delivery} (£${b.total.toFixed(2)} delivered, usually £${b.normalTotal.toFixed(2)})`
}
