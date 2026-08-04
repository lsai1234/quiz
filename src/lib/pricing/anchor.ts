/**
 * Anchor pricing — what to actually put on the shelf.
 *
 * THE PROBLEM THIS SOLVES
 * ───────────────────────
 * `good-price.ts` works a price up from cost: add the goods, delivery, VAT, card
 * fees and returns, apply a target margin, and out comes a number. That is the
 * right method when you set the price — own-brand, or a bundle nobody can
 * price-match. It is the wrong method for reselling Optimum Nutrition, and it
 * showed: cost-plus produced prices roughly DOUBLE PowerBody's own RRP. £118 for
 * a whey they say should retail at £64.99. Nobody buys that, and an unsellable
 * price loses money just as surely as a thin one.
 *
 * THE MODEL
 * ─────────
 * The market sets the price, so we start from the supplier's RRP and add a
 * modest premium. The premium is deliberate and is the whole design: almost
 * everyone arrives through the quiz and buys a bundle, so the individual price
 * is the number the discount is measured against. Set it a little high and the
 * bundle becomes a visible saving; set it a lot high and we get caught, because
 * a customer can check the RRP in ten seconds.
 *
 *     list price   = RRP × (1 + premium)          ← the anchor
 *     bundle price = list × (1 − subscribe&save)  ← what they actually pay
 *     the bargain  = how far bundle price sits BELOW RRP
 *
 * COST-PLUS BECOMES THE FLOOR
 * ───────────────────────────
 * The Good-price model still runs, but its job changes from setting the price to
 * checking it. When the anchored price can't cover its costs the product is
 * flagged — the honest answer there is usually "don't sell this one on
 * subscription", not "charge double the market".
 *
 * Products with no RRP (own-brand, or a feed that didn't carry one) fall back to
 * cost-plus, because for those we really are the ones setting the price.
 */
import { getPricingConfig, type PricingConfig } from '@/lib/stack-blueprint/pricing'
import { goodPriceFor } from './good-price'
import { unitEconomics } from './unit-economics'

const round = (n: number) => Math.round(n * 100) / 100
const round4 = (n: number) => Math.round(n * 10000) / 10000

export interface AnchorInput {
  title?: string
  /** The supplier's recommended retail price (£ inc VAT). Null = no anchor available. */
  supplierRrp?: number | null
  /** What we pay the supplier, ex VAT (£). */
  cost?: number | null
  /** Servings per unit, for working out how often it ships. */
  servings?: number | null
  /** The price currently on the shelf (£ inc VAT), for comparison. */
  currentPrice?: number | null
  /**
   * How many products share the parcel this one ships in. Defaults to the
   * configured stack size, because that is how the quiz actually sells; pass 1
   * to price a product that genuinely ships on its own.
   */
  sharedParcelItems?: number | null
}

export interface AnchorResult {
  title: string
  /** Where the list price came from. */
  basis: 'rrp' | 'cost-plus'
  /** The supplier's RRP, when there was one (£). */
  rrp: number | null
  /** The list price to show (£ inc VAT). */
  listPrice: number
  /** What a member on the middle bundle actually pays (£). */
  bundlePrice: number
  /** How far the bundle price sits below RRP (0–1). Negative = above RRP. */
  bargainVsRrp: number | null
  /** Contribution at the bundle price (£), and its margin on net revenue. */
  contribution: number
  marginPct: number
  /** True when the anchored price still makes money at the deepest discount. */
  viable: boolean
  /**
   * What cost-plus says we would need to charge. When this is ABOVE the anchor,
   * the market will not pay what the product costs to sell — the product is the
   * problem, not the price.
   */
  costPlusFloor: number | null
  /** costPlusFloor − listPrice when the floor is higher, else null. */
  shortfall: number | null
  /** How far the current shelf price is from the anchor (£). */
  vsCurrentPrice: number | null
  /** Products assumed to share the parcel — the delivery cost is split this many ways. */
  sharedParcelItems: number
  /** What one shipment of this product carries in postage at that split (£). */
  deliveryShare: number
  /** Set when something about this product needs a decision. */
  warning: string | null
}

/**
 * How far above RRP the list price must sit for the bundle discount to land the
 * member on the target saving.
 *
 *     list × (1 − bundleRate) = rrp × (1 − targetBargain)
 *   ⇒ premium = (1 − targetBargain) / (1 − bundleRate) − 1
 *
 * Derived rather than configured, because a hand-set premium can contradict the
 * saving it is supposed to produce — at a 30% premium and a 15% bundle discount
 * the "discounted" price is 10% ABOVE RRP.
 */
export function premiumOverRrp(config: PricingConfig = getPricingConfig()): number {
  const bundleRate = config.levelSubscriptionDiscount.performance
  const target = Math.min(0.95, Math.max(0, config.anchor.targetBargainVsRrpPct))
  if (bundleRate >= 1) return 0
  return round4((1 - target) / (1 - bundleRate) - 1)
}

/**
 * Whether the anchor is still an anchor.
 *
 * Asking for a saving DEEPER than the bundle discount is arithmetically fine and
 * strategically incoherent: the premium goes negative, the list price drops
 * below RRP, and we are simply undercutting the market rather than anchoring
 * against it. Worth saying out loud rather than silently producing a low number.
 */
export function anchorCoherence(config: PricingConfig = getPricingConfig()): {
  coherent: boolean
  premium: number
  bundleRate: number
  reason: string | null
} {
  const bundleRate = config.levelSubscriptionDiscount.performance
  const premium = premiumOverRrp(config)
  if (premium >= 0) return { coherent: true, premium, bundleRate, reason: null }
  return {
    coherent: false,
    premium,
    bundleRate,
    reason:
      `A ${Math.round(config.anchor.targetBargainVsRrpPct * 100)}% saving can't come from a ` +
      `${Math.round(bundleRate * 100)}% bundle discount — the list price would have to sit BELOW RRP, ` +
      `which is undercutting the market rather than anchoring to it. Lower the target or deepen the bundle rate.`,
  }
}

/**
 * Round a price DOWN to a .99 ending.
 *
 * Down, not to nearest: rounding up can push the discounted price back above RRP
 * and quietly turn the member's saving into a markup. Landing a few pence under
 * the computed anchor costs nothing and keeps the promise exact.
 */
export function roundTo99(price: number): number {
  if (price <= 0) return 0
  return Math.max(0.99, Math.floor(price) - 0.01)
}

/** The list price implied by a supplier RRP. */
export function anchoredListPrice(rrp: number, config: PricingConfig = getPricingConfig()): number {
  const raw = rrp * (1 + premiumOverRrp(config))
  return config.anchor.roundTo99 ? roundTo99(raw) : round(raw)
}

/**
 * What to put on the shelf, and whether it works.
 *
 * The bundle price is checked at the MIDDLE bundle rate rather than the deepest.
 * The deepest rate is the right lens for "could this ever lose money" — which
 * `good-price.ts` already answers — but the wrong one for "is this a good
 * price", because most members are not on the biggest bundle and pricing the
 * shelf for the rarest customer is how the prices got too high in the first
 * place.
 */
export function anchorPrice(input: AnchorInput, config: PricingConfig = getPricingConfig()): AnchorResult {
  const title = input.title ?? 'Untitled'
  const hasRrp = input.supplierRrp != null && input.supplierRrp > 0

  // How often it ships — a big tub bills monthly but ships quarterly, and that
  // is what decides its share of a delivery charge.
  const shipEveryMonths = Math.min(
    config.maxDeliveryMonths,
    Math.max(1, Math.round((input.servings ?? 30) / 30)),
  )

  // Almost nothing ships alone. The quiz sells a stack, and PowerBody charge per
  // PARCEL on its total wholesale value — so a product in a three-item stack
  // carries a third of one delivery, and the stack may clear their free line and
  // carry none. Pricing each product as if it were posted on its own was adding
  // roughly £5 of phantom postage to a £30 tub and reporting healthy products as
  // loss-makers.
  const parcelItems = Math.max(1, Math.round(input.sharedParcelItems ?? config.orderMix.itemsPerOrder ?? 1))

  const costPlus = goodPriceFor(
    {
      assetPrice: input.cost ?? 0,
      shipEveryMonths,
      sharedParcelItems: parcelItems,
      // No cost on file means cost-plus has nothing to work from either.
      ...(input.cost == null ? {} : {}),
    },
    config,
  )
  const costPlusFloor = input.cost != null ? costPlus.goodPrice : null

  const listPrice = hasRrp
    ? anchoredListPrice(input.supplierRrp!, config)
    : (costPlusFloor ?? round(input.currentPrice ?? 0))

  const bundleRate = config.levelSubscriptionDiscount.performance
  const bundlePrice = round(listPrice * (1 - bundleRate))

  // Price the whole SHIPMENT, then divide back down to a month.
  //
  // Doing it the other way — slicing the price and the cost into months first —
  // charges a full delivery every month on a tub that only ships quarterly, and
  // makes big tubs look WORSE than small ones. That is backwards, and backwards
  // in exactly the direction that matters most here.
  const shipment = unitEconomics(
    {
      shelfPrice: bundlePrice,
      supplierCost: input.cost ?? null,
      chargeDelivery: false,
      sharedParcelItems: parcelItems,
    },
    config,
  )
  const economics = {
    contribution: round(shipment.contribution / shipEveryMonths),
    marginPct: shipment.marginPct,
  }

  const shortfall =
    costPlusFloor != null && costPlusFloor > listPrice ? round(costPlusFloor - listPrice) : null

  return {
    title,
    basis: hasRrp ? 'rrp' : 'cost-plus',
    rrp: hasRrp ? round(input.supplierRrp!) : null,
    listPrice,
    bundlePrice,
    bargainVsRrp: hasRrp ? round4((input.supplierRrp! - bundlePrice) / input.supplierRrp!) : null,
    contribution: economics.contribution,
    marginPct: economics.marginPct,
    viable: economics.contribution > 0,
    costPlusFloor,
    shortfall,
    vsCurrentPrice: input.currentPrice != null ? round(listPrice - input.currentPrice) : null,
    sharedParcelItems: parcelItems,
    deliveryShare: shipment.deliveryCost,
    warning: warningFor({ hasRrp, shortfall, viable: economics.contribution > 0, title }),
  }
}

function warningFor(p: { hasRrp: boolean; shortfall: number | null; viable: boolean; title: string }): string | null {
  if (!p.viable) {
    return 'Loses money at the bundle price. The honest fix is usually to keep it off subscription, not to charge more than the market.'
  }
  if (p.shortfall != null) {
    return `Costs more to sell than the market will bear — cost-plus wants £${p.shortfall.toFixed(2)} more than the anchor. Thin, but not a loss.`
  }
  if (!p.hasRrp) {
    return 'No supplier RRP on file, so this is priced from cost rather than anchored to the market.'
  }
  return null
}

export interface AnchorAudit {
  rows: AnchorResult[]
  /** Products that lose money even at the anchored price. */
  losing: number
  /** Products where cost-plus wants more than the market will bear. */
  squeezed: number
  /** Products priced from cost because they have no RRP. */
  unanchored: number
  /** Average saving against RRP a member sees on the middle bundle (0–1). */
  averageBargain: number
  /** Average contribution margin across the catalogue at the bundle price (0–1). */
  averageMargin: number
  /** The margin the Good-price model is aiming at, for comparison. */
  targetMarginPct: number
  /** Products assumed to share each parcel. */
  sharedParcelItems: number
  /**
   * Set when the SETTING is the problem rather than the products.
   *
   * When most of the catalogue reads as "squeezed", cost-plus is not finding
   * two dozen bad products — it is telling you that reselling other people's
   * brands at their own RRP cannot yield an own-brand target margin. Saying that
   * once at the top is honest; repeating it on every row looks like an emergency
   * and trains you to ignore the flag that matters.
   */
  note: string | null
}

/** Run the anchor model over a catalogue, worst first. */
export function auditAnchors(
  products: AnchorInput[],
  config: PricingConfig = getPricingConfig(),
): AnchorAudit {
  const rows = products.map((p) => anchorPrice(p, config)).sort((a, b) => a.marginPct - b.marginPct)
  const bargains = rows.map((r) => r.bargainVsRrp).filter((b): b is number => b != null)
  const squeezed = rows.filter((r) => r.viable && r.shortfall != null).length
  const averageMargin =
    rows.length > 0 ? round4(rows.reduce((s, r) => s + r.marginPct, 0) / rows.length) : 0
  const target = config.goodPricing.targetMarginPct

  return {
    rows,
    losing: rows.filter((r) => !r.viable).length,
    squeezed,
    unanchored: rows.filter((r) => r.basis === 'cost-plus').length,
    averageBargain: bargains.length > 0 ? round4(bargains.reduce((s, b) => s + b, 0) / bargains.length) : 0,
    averageMargin,
    targetMarginPct: target,
    sharedParcelItems: Math.max(1, Math.round(config.orderMix.itemsPerOrder ?? 1)),
    note:
      rows.length >= 5 && squeezed > rows.length * 0.6
        ? `${squeezed} of ${rows.length} products come in under the ${Math.round(target * 100)}% target margin. ` +
          `That is the target, not the catalogue: resold brands are priced against their own RRP, and the market ` +
          `will not pay an own-brand margin for them. The catalogue averages ${Math.round(averageMargin * 100)}%. ` +
          `Either accept a lower target on resale, or make the money on bundle size and own-brand lines.`
        : null,
  }
}
