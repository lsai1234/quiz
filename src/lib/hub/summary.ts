/**
 * What a member has with us, said plainly: the plan (what's on it, what it
 * costs, when the next box comes) and what they bought once. One summary, read
 * by the hub's "What you have" (`WhatYouHave`) and by the shop, which asks
 * whether a product is already on someone's plan and offers their next box
 * instead of a second plan (`/api/hub/next-box`).
 *
 * The same whichever way they came in: a plan from the quiz or the consult, a
 * bundle, a shop basket every month, or orders bought one at a time. Pure, so
 * the words are tested without a database.
 */
import type { CatalogueProduct } from '@/lib/catalogue/types'
import type { MemberSubscription, PlanSource } from '@/lib/recharge/types'
import type { Order } from '@/lib/orders/types'
import { buildDeliverySchedule, nextDelivery, upcomingBoxesForLine } from '@/lib/recharge/schedule'
import { recurringDeliveryOption } from '@/lib/pricing/delivery'

export interface PlanSummary {
  status: 'active' | 'paused' | 'cancelled'
  source: PlanSource | null
  /** The plan's monthly, postage included (what the payment is). */
  monthly: number
  /** The day of the month it's charged and the box goes. */
  day: number
  /** Billed by Stripe, so its day is Stripe's and extras go on its payments. */
  billed: boolean
  /** What's on it. */
  lines: { productId: string; title: string; variant: string | null; quantity: number; every: number; next: string | null }[]
  /** The next box that ships, with what's in it (extras included). */
  nextBox: { id: string; date: string; items: string[]; extras: number } | null
  /** When it ended, for a cancelled plan. */
  endedAt: string | null
}

export interface OrderSummary {
  reference: string
  createdAt: string
  total: number
  status: string
  /** A box from their plan, or bought once. */
  kind: 'plan-box' | 'once'
  items: string[]
  /** For "Buy again": what to put back in the basket. Bonus gifts are never in it. */
  lines: { productId: string; variantId: string | null; title: string; quantity: number }[]
}

const round = (n: number) => Math.round(n * 100) / 100

export function planSummary(sub: MemberSubscription | null, catalogue: CatalogueProduct[], now: Date = new Date()): PlanSummary | null {
  if (!sub) return null
  const postage = recurringDeliveryOption(sub.flatMonthly)?.price ?? 0
  const box = sub.status === 'active' ? nextDelivery(buildDeliverySchedule(sub, catalogue, 3, now)) : null
  return {
    status: sub.status === 'paused' ? 'paused' : sub.status === 'cancelled' ? 'cancelled' : 'active',
    source: sub.source ?? null,
    monthly: round(sub.flatMonthly + postage),
    day: sub.dispatchDayOfMonth,
    billed: Boolean(sub.stripeSubscriptionId),
    lines: sub.lines.map((l) => ({
      productId: l.productId,
      title: l.productTitle,
      variant: l.variantTitle || null,
      quantity: l.quantity,
      every: Math.max(1, l.deliveryIntervalMonths),
      // When it next really comes: due, its box not skipped, not taken out of it.
      next: sub.status === 'active' ? upcomingBoxesForLine(sub, l.id, 1, now)[0]?.date ?? null : null,
    })),
    nextBox: box
      ? { id: box.id, date: box.date, items: box.items.map((i) => i.productTitle), extras: box.items.filter((i) => i.oneOff).length }
      : null,
    endedAt: sub.status === 'cancelled' ? sub.cancelledAt ?? null : null,
  }
}

/** The variant an order line was for, by SKU, then by its label. */
function variantIdOf(line: Order['lines'][number], catalogue: CatalogueProduct[]): string | null {
  const product = catalogue.find((p) => p.id === line.productId)
  if (!product) return null
  const bySku = line.sku ? product.variants.find((v) => v.sku === line.sku) : null
  if (bySku) return bySku.id
  const label = (line.variantTitle ?? '').toLowerCase()
  const byLabel = label ? product.variants.find((v) => [v.flavour, v.size].filter(Boolean).join(' · ').toLowerCase() === label || v.title.toLowerCase() === label) : null
  return byLabel?.id ?? null
}

export function orderSummary(order: Order, catalogue: CatalogueProduct[]): OrderSummary {
  const lines = order.lines.filter((l) => !l.bonus)
  return {
    reference: order.reference ?? order.id.slice(0, 8).toUpperCase(),
    createdAt: order.createdAt,
    total: order.total,
    status: order.status,
    kind: order.channel === 'subscription' ? 'plan-box' : 'once',
    items: lines.map((l) => l.title),
    lines: lines.map((l) => ({ productId: l.productId, variantId: variantIdOf(l, catalogue), title: l.title, quantity: Math.max(1, l.quantity) })),
  }
}

export { everyLabel } from './line-facts'

/** What the plan is, in a few words, from where it came from. */
export function planKindLabel(source: PlanSource | null): string {
  switch (source) {
    case 'shop':
      return 'Your shop basket, every month'
    case 'bundle':
      return 'Your bundle, every month'
    case 'answers':
      return 'Your stack, built from your answers'
    default:
      return 'Your monthly plan'
  }
}
