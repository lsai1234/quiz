/**
 * Supplier price moves — the maths behind absorb vs pass on.
 *
 * Pure. Given what a product costs us now, what it costs us after the move, and
 * who's subscribed to it, this works out both sides of the decision so a founder
 * makes it with the numbers in front of them rather than a gut feel:
 *
 *   • **Absorb** — the member's price doesn't move, so our margin takes the hit.
 *     The number that matters is what the margin becomes, and whether it drops
 *     under the floor (or under water).
 *   • **Pass on** — our margin holds, and the member's monthly moves. The number
 *     that matters is by how much, per member, and when.
 *
 * Partial pass-on sits between the two: passing on half a 20% cost rise means
 * the member's price goes up 10% and we eat the rest.
 *
 * Nothing here writes anything or decides anything. The default stays `absorb`
 * (see `policy.ts`) precisely so that an unattended queue can't put anyone's
 * price up.
 */
import type { CatalogueProduct } from '@/lib/catalogue/types'
import type { MemberSubscription } from '@/lib/recharge/types'
import { discountWithFloor, getPricingConfig, unitCostOf, type PricingConfig } from '@/lib/stack-blueprint/pricing'
import { subRateOf } from '@/lib/recharge/mock'
import type { ChangeEvent, PriceMove } from './types'

const round = (n: number) => Math.round(n * 100) / 100
const roundPct = (n: number) => Math.round(n * 1000) / 1000

/** Gross margin on one unit, 0–1. Negative when we'd sell at a loss. */
export function marginPct(unitPrice: number, cost: number): number {
  if (unitPrice <= 0) return 0
  return roundPct((unitPrice - cost) / unitPrice)
}

/**
 * The list price that passes on `pct` of the supplier's move.
 *
 * Scales the member-facing price by the same proportion the cost moved, so
 * "pass on half of a 20% rise" means a 10% rise. Clamped to [0, 1]: a founder
 * can absorb all of it or pass all of it, never more than all of it.
 */
export function passOnListPrice(currentList: number, move: PriceMove, pct: number): number {
  const share = Math.min(1, Math.max(0, pct))
  return round(currentList * (1 + move.wholesaleDeltaPct * share))
}

/** True when selling at `listPrice` would breach the margin floor. */
export function breachesFloor(listPrice: number, cost: number, config: PricingConfig = getPricingConfig()): boolean {
  return listPrice < cost * (1 + config.marginFloorPct)
}

/** What one member's bill does under a given pass-on share. */
export interface MemberPriceImpact {
  userId: string
  email: string | null
  eventId: string
  lineId: string
  monthlyBefore: number
  monthlyAfter: number
  monthlyDelta: number
}

export interface PriceGroupImpact {
  productId: string
  productTitle: string
  sku: string | null
  move: PriceMove
  /** Members holding this product with an open price event. */
  affectedCount: number

  currentUnitPrice: number
  currentCost: number
  newCost: number
  /** Margin as things stand, and if we swallow the increase. */
  marginNow: number
  marginIfAbsorbed: number
  /** Absorbing would take this line under the margin floor. */
  absorbBreachesFloor: boolean
  /** Absorbing would sell it at a loss. */
  absorbLosesMoney: boolean

  /** The list price at the chosen pass-on share, and the margin it restores. */
  passOnPct: number
  passOnUnitPrice: number
  marginIfPassedOn: number
  /** Per-member consequences of passing it on. */
  members: MemberPriceImpact[]
  /** Total monthly movement across every affected member. */
  totalMonthlyDelta: number
}

export interface GroupInput {
  product: CatalogueProduct
  events: ChangeEvent[]
  /** The affected members' current plans, keyed by userId. */
  subscriptions: Map<string, MemberSubscription>
  /** 0 = absorb everything, 1 = pass all of it on. */
  passOnPct?: number
  config?: PricingConfig
}

/**
 * Both sides of the decision for one product, across everyone holding it.
 *
 * Per-member rather than blended, because the members aren't identical: they're
 * on different bundle rates and different quantities, so the same supplier rise
 * lands differently on each of them. A single averaged figure would hide exactly
 * the outlier a founder needs to see.
 */
export function summarisePriceGroup(input: GroupInput): PriceGroupImpact {
  const config = input.config ?? getPricingConfig()
  const pct = Math.min(1, Math.max(0, input.passOnPct ?? 1))
  const first = input.events[0]
  const move = first.price!

  const variant = input.product.variants.find((v) => v.available) ?? input.product.variants[0]
  const currentList = variant?.price ?? input.product.basePrice
  const currentCost = unitCostOf(input.product, currentList, config)
  const newCost = move.newWholesale

  const passOnUnitPrice = passOnListPrice(currentList, move, pct)

  const members: MemberPriceImpact[] = []
  for (const event of input.events) {
    const sub = input.subscriptions.get(event.userId)
    const line = sub?.lines.find((l) => l.id === event.lineId)
    if (!sub || !line) continue

    // Re-price at the member's own bundle rate, floored — their subscribe-&-save
    // survives a supplier increase rather than quietly evaporating with it.
    const discounted = discountWithFloor(passOnUnitPrice, subRateOf(sub, config), newCost, config)
    const perDelivery = round(line.quantity * discounted)
    const monthlyAfter = round(
      sub.flatMonthly - line.pricePerDelivery / line.deliveryIntervalMonths + perDelivery / line.deliveryIntervalMonths,
    )

    members.push({
      userId: event.userId,
      email: event.customerEmail,
      eventId: event.id,
      lineId: event.lineId,
      monthlyBefore: sub.flatMonthly,
      monthlyAfter,
      monthlyDelta: round(monthlyAfter - sub.flatMonthly),
    })
  }

  return {
    productId: first.productId,
    productTitle: first.productTitle,
    sku: first.sku,
    move,
    affectedCount: input.events.length,

    currentUnitPrice: round(currentList),
    currentCost: round(currentCost),
    newCost: round(newCost),
    marginNow: marginPct(currentList, currentCost),
    marginIfAbsorbed: marginPct(currentList, newCost),
    absorbBreachesFloor: breachesFloor(currentList, newCost, config),
    absorbLosesMoney: newCost >= currentList,

    passOnPct: pct,
    passOnUnitPrice,
    marginIfPassedOn: marginPct(passOnUnitPrice, newCost),
    members,
    totalMonthlyDelta: round(members.reduce((sum, m) => sum + m.monthlyDelta, 0)),
  }
}

/**
 * The smallest pass-on share that keeps the line above the margin floor, or null
 * when absorbing it entirely is already fine.
 *
 * Useful as a suggestion: "absorbing this drops you to 4% — pass on 40% and
 * you're back above the floor" is a more helpful prompt than an all-or-nothing
 * choice.
 */
export function minimumPassOnPct(
  currentList: number,
  move: PriceMove,
  config: PricingConfig = getPricingConfig(),
): number | null {
  if (!breachesFloor(currentList, move.newWholesale, config)) return null
  if (move.wholesaleDeltaPct <= 0) return null

  const needed = move.newWholesale * (1 + config.marginFloorPct)
  // currentList × (1 + delta × share) ≥ needed
  const share = (needed / currentList - 1) / move.wholesaleDeltaPct
  return Math.min(1, Math.max(0, Math.ceil(share * 100) / 100))
}
