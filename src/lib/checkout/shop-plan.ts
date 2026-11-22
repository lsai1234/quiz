import type { CatalogueProduct } from '@/lib/catalogue/types'
import type { MemberSubscription, MemberSubscriptionLine } from '@/lib/recharge/types'
import { formatGBP, getPricingConfig, priceOneOffLines, unitCostOf, type PricingConfig } from '@/lib/stack-blueprint/pricing'
import { recurringDeliveryOption, type DeliveryOption } from '@/lib/pricing/delivery'
import { MAX_LINE_QTY } from '@/lib/basket/helpers'

/**
 * A shop basket, bought every month.
 *
 * ── The terms ───────────────────────────────────────────────────────────────
 * The quiz's, apart from the discount:
 *   price        what the same basket costs bought once, savings included
 *                (`priceOneOffLines`, the function `/api/cart` bills from), and
 *                no subscribe-&-save rate on top
 *   minimum      `minSubscriptionMonthly` a month, as for a quiz plan
 *   term         the configured minimum, raised by any product that needs
 *                longer (`minSubscriptionMonths`), as for a quiz plan
 *   delivery     a monthly delivery line under the free-delivery line
 *                (`recurringDeliveryOption`), as for a quiz plan
 *   the hub      opens with the plan and stays open while it runs, as for any
 *                plan (`lib/hub/access`): member prices on top-ups come with it
 *
 * ── Who decides the price ───────────────────────────────────────────────────
 * The same function runs in the basket (to show the monthly) and on the server
 * (to charge it), from the catalogue each side has. The browser sends products
 * and quantities only; `finalizeCheckout` rebuilds the plan here and ignores
 * any figure that came with them.
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
      /** The saving the basket earns, as on a one-off (the £50+ tier). */
      saving: number
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

/** The minimum term for these products: the setting, raised by any that need longer. */
export function shopPlanMinMonths(products: Pick<CatalogueProduct, 'minSubscriptionMonths'>[], config: PricingConfig = getPricingConfig()): number {
  return Math.max(1, config.minSubscriptionMonths, ...products.map((p) => p.minSubscriptionMonths ?? 0))
}

/** How the term reads, wherever a shop plan is offered. */
export function shopPlanTermLine(minMonths: number): string {
  return minMonths > 1 ? `Minimum ${minMonths} months, then cancel any time` : 'Cancel any time'
}

export function buildShopPlan(
  input: ShopPlanLineInput[],
  catalogue: CatalogueProduct[],
  config: PricingConfig = getPricingConfig(),
  now: Date = new Date(),
): ShopPlanResult {
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

  const priced = priceOneOffLines(
    resolved.map(({ product, variant, quantity }) => ({ price: variant.price, cost: unitCostOf(product, variant.price, config), quantity })),
    config,
  )
  const monthly = round(priced.total)
  if (monthly < minimum) {
    return {
      ok: false,
      reason: 'minimum',
      message: `Monthly plans start at ${formatGBP(minimum).replace(/\.00$/, '')} a month. This basket is ${formatGBP(monthly)}.`,
      monthly,
      minimum,
    }
  }

  const startedAt = now.toISOString()
  const lines: MemberSubscriptionLine[] = resolved.map(({ product, variant, quantity }, i) => ({
    id: `line-${i}-${product.id}`,
    productId: product.id,
    productTitle: product.title,
    variantTitle: variantLabel(variant),
    sku: variant.sku ?? null,
    variantId: variant.id,
    slotTitle: product.category,
    stackSlot: product.stackSlots[0],
    quantity,
    deliveryIntervalMonths: 1,
    pricePerDelivery: round(priced.lines[i].lineTotal),
    swapGroup: product.swapGroup,
    addedAt: startedAt,
    deliveriesMade: 1,
    allowSubstitution: false,
  }))

  const minMonths = shopPlanMinMonths(resolved.map((r) => r.product), config)
  const subscription: MemberSubscription = {
    id: `shop-${now.getTime()}`,
    status: 'active',
    customerEmail: '',
    flatMonthly: monthly,
    subscriptionDiscountRate: 0,
    dispatchDayOfMonth: 15,
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
    saving: round(priced.discount),
  }
}
