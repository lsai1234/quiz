import { billingDayOf } from '@/lib/recharge/billing-day'
import type { CatalogueProduct } from '@/lib/catalogue/types'
import type { MemberSubscription, MemberSubscriptionLine, PlanRoutine } from '@/lib/recharge/types'
import { cleanRoutine, ESTIMATED_ROUTINE, rhythmFor, sizeFor } from '@/lib/recharge/routine'
import { bandFor, nextBand } from '@/lib/recharge/plan-rate'
import { discountWithFloor, formatGBP, getPricingConfig, unitCostOf, type PricingConfig } from '@/lib/stack-blueprint/pricing'
import { recurringDeliveryOption, type DeliveryOption } from '@/lib/pricing/delivery'
import { MAX_LINE_QTY } from '@/lib/basket/helpers'

/**
 * A shop basket, bought every month: a plan like any other.
 *
 * ── The terms ───────────────────────────────────────────────────────────────
 * The quiz's, all of them:
 *   saving       the plan saving, 13%, 15% or 20% by the plan's size, the
 *                quiz's own bands (`plan-rate`), on every product, never below
 *                the margin floor. It replaces the one-off basket saving, and
 *                is always more than it.
 *   rhythm       each product comes about when it would run out (`sizeConsumption`),
 *                as many at a time as are in the basket, worked out from the
 *                routine: the one they gave, or our estimate from the label
 *                (about three training days a week), said as an estimate.
 *   price        one flat monthly: each delivery's price over how often it
 *                comes. The first box has everything in it.
 *   minimum      `minSubscriptionMonthly` a month, as for a quiz plan
 *   term         none: cancel any time, as for a quiz plan
 *   delivery     a monthly delivery line under the free-delivery line
 *                (`recurringDeliveryOption`), as for a quiz plan
 *   the hub      opens with the plan and stays open while it runs
 *
 * It used to be the basket's one-off price, every product every month: no plan
 * saving, and a creatine tub that lasts three months sent every month.
 *
 * ── Who decides the price ───────────────────────────────────────────────────
 * The same function runs in the basket (to show the monthly) and on the server
 * (to charge it), from the catalogue each side has. The browser sends products,
 * quantities and the routine only; `finalizeCheckout` rebuilds the plan here and
 * ignores any figure that came with them.
 *
 * ── Unavailable products ────────────────────────────────────────────────────
 * A shop plan has no quiz answers, so nobody has told us what they can't have.
 * Swapping in "something similar" could pick a product they avoid, so a shop
 * plan's default is to take an unavailable product out and say so (`remove`).
 * The member can change that in the hub, as anyone can.
 */

export interface ShopPlanLineInput {
  productId: string
  variantId: string
  quantity: number
}

export type ShopPlanResult =
  | {
      ok: true
      subscription: MemberSubscription
      /** What is charged every month, before any delivery line. */
      monthly: number
      minMonths: number
      /** The monthly delivery line, when the plan is under the free line. */
      delivery: DeliveryOption | null
      /** What the plan saving takes off a month (£). */
      saving: number
      /** The plan saving, 0–1. */
      rate: number
      /** The next band up: its saving and the monthly it starts at, or null at the top. */
      nextBand: { rate: number; from: number } | null
      /** The routine it was sized from. */
      routine: PlanRoutine
    }
  | {
      ok: false
      reason: 'empty' | 'unavailable' | 'minimum'
      message: string
      monthly: number
      minimum: number
    }

const round = (n: number) => Math.round(n * 100) / 100

function variantLabel(v: { flavour: string | null; size: string | null; title: string }): string {
  const parts = [v.flavour, v.size].filter(Boolean)
  return parts.length > 0 ? parts.join(' · ') : v.title
}

/**
 * The minimum term for a shop plan: none. Members are promised they can cancel
 * any time (`calculatePricing` says why the settings no longer raise it).
 */
export function shopPlanMinMonths(): number {
  return 1
}

/** How the term reads, wherever a shop plan is offered. */
export function shopPlanTermLine(): string {
  return 'Cancel any time'
}

export function buildShopPlan(
  input: ShopPlanLineInput[],
  catalogue: CatalogueProduct[],
  config: PricingConfig = getPricingConfig(),
  now: Date = new Date(),
  routineInput?: unknown,
): ShopPlanResult {
  const routine: PlanRoutine = cleanRoutine(routineInput) ?? ESTIMATED_ROUTINE
  const minimum = config.minSubscriptionMonthly
  const wanted = (Array.isArray(input) ? input : [])
    .filter((l) => l && typeof l.productId === 'string' && typeof l.variantId === 'string')
    .map((l) => ({ ...l, quantity: Math.min(MAX_LINE_QTY, Math.max(1, Math.floor(Number(l.quantity) || 0))) }))

  if (wanted.length === 0) {
    return { ok: false, reason: 'empty', message: 'Your basket is empty.', monthly: 0, minimum }
  }

  const resolved: Array<{ product: CatalogueProduct; variant: CatalogueProduct['variants'][number]; quantity: number }> = []
  const unavailable: string[] = []
  for (const l of wanted) {
    const product = catalogue.find((p) => p.id === l.productId)
    const variant = product?.variants.find((v) => v.id === l.variantId)
    if (!product || !variant || !variant.available) {
      unavailable.push(product?.title ?? 'A product')
      continue
    }
    resolved.push({ product, variant, quantity: l.quantity })
  }
  if (unavailable.length > 0) {
    const names = unavailable.join(', ')
    return {
      ok: false,
      reason: 'unavailable',
      message: unavailable.length === 1
        ? `${names} isn’t available right now. Take it out of your basket to make the rest monthly.`
        : `Some of your basket isn’t available right now: ${names}. Take them out to make the rest monthly.`,
      monthly: 0,
      minimum,
    }
  }

  /* Each product sized to the routine: as many at a time as are in the basket
     (more, for one that wouldn't last a month), about as often as that runs out. */
  const sized = resolved.map(({ product, variant, quantity }) => {
    const sizing = sizeFor(product, routine, 'standard', config)
    const units = Math.max(quantity, sizing.unitsPerShipment)
    return { product, variant, units, every: rhythmFor(sizing.monthsOneUnitLasts, units, config), lastsMonths: sizing.monthsOneUnitLasts }
  })

  // The plan saving for a plan this size: the quiz's own bands.
  const listMonthly = round(sized.reduce((sum, l) => sum + (l.variant.price * l.units) / l.every, 0))
  const band = bandFor(listMonthly, config)
  const priced = sized.map((l) => {
    const unit = discountWithFloor(l.variant.price, band.rate, l.variant.cost ?? unitCostOf(l.product, l.variant.price, config), config, l.product.vatRate)
    return { ...l, pricePerDelivery: round(unit * l.units) }
  })
  const monthly = round(priced.reduce((sum, l) => sum + l.pricePerDelivery / l.every, 0))
  if (monthly < minimum) {
    return {
      ok: false,
      reason: 'minimum',
      message: `Monthly plans start at ${formatGBP(minimum).replace(/\.00$/, '')} a month. This basket comes to ${formatGBP(monthly)} a month.`,
      monthly,
      minimum,
    }
  }

  const startedAt = now.toISOString()
  const lines: MemberSubscriptionLine[] = priced.map(({ product, variant, units, every, lastsMonths, pricePerDelivery }, i) => ({
    id: `line-${i}-${product.id}`,
    productId: product.id,
    productTitle: product.title,
    variantTitle: variantLabel(variant),
    sku: variant.sku ?? null,
    variantId: variant.id,
    slotTitle: product.category,
    stackSlot: product.stackSlots[0],
    quantity: units,
    deliveryIntervalMonths: every,
    usageLevel: 'standard',
    lastsMonths,
    rhythm: 'routine',
    pricePerDelivery,
    swapGroup: product.swapGroup,
    addedAt: startedAt,
    deliveriesMade: 1,
    allowSubstitution: false,
  }))

  const minMonths = shopPlanMinMonths()
  const subscription: MemberSubscription = {
    id: `shop-${now.getTime()}`,
    status: 'active',
    customerEmail: '',
    flatMonthly: monthly,
    subscriptionDiscountRate: band.rate,
    routine,
    // The day it starts is the day Stripe bills it, and so the day each box goes (`billing-day`).
    dispatchDayOfMonth: billingDayOf(now),
    source: 'shop',
    minMonths,
    introDiscountRate: 0,
    firstMonth: monthly,
    monthsActive: 0,
    startedAt,
    paymentMethod: null,
    defaultChangePolicy: 'remove',
    lines,
  }

  return {
    ok: true,
    subscription,
    monthly,
    minMonths,
    delivery: recurringDeliveryOption(monthly, config),
    saving: round(listMonthly - monthly),
    rate: band.rate,
    nextBand: (() => {
      const up = nextBand(listMonthly, config)
      return up ? { rate: up.band.rate, from: up.band.from } : null
    })(),
    routine,
  }
}
