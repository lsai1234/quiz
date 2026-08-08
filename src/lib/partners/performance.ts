/**
 * What a partner has actually brought in.
 *
 * Counted from the orders themselves rather than a running total kept somewhere,
 * so it cannot drift: an order refunded in the Stripe dashboard stops counting
 * the moment its status changes, without anything having to remember to
 * decrement a tally.
 *
 * This is NOT the commission ledger. Nothing here is money owed — that needs the
 * return window, a confirmed state and a stored rate, and it lands in phase 3.
 * What this answers is the question a founder has now: is this partner working?
 *
 * Server-only.
 */
import { listOrdersByPartnerCode } from '@/lib/orders/repo'
import type { Order } from '@/lib/orders/types'

export interface PartnerPerformance {
  code: string
  /** Orders that were paid for and not reversed. */
  orders: number
  /** Their gross value (£). */
  revenue: number
  /** How many of those started a subscription rather than being a one-off. */
  subscriptions: number
  /** Orders refunded or cancelled — shown, not silently dropped. */
  reversed: number
  /** Most recent qualifying order (ISO), or null. */
  lastOrderAt: string | null
}

/** Statuses that mean the money came in and stayed in. */
const COUNTS = new Set(['paid', 'submitted_to_supplier', 'supplier_confirmed', 'shipped', 'delivered'])
const REVERSED = new Set(['refunded', 'cancelled'])

export function summarise(code: string, orders: Order[]): PartnerPerformance {
  let count = 0
  let revenue = 0
  let subscriptions = 0
  let reversed = 0
  let lastOrderAt: string | null = null

  for (const order of orders) {
    if (REVERSED.has(order.status)) {
      reversed += 1
      continue
    }
    // A pending_payment order is somebody at a payment page, not a sale.
    if (!COUNTS.has(order.status)) continue

    count += 1
    revenue += order.total
    if (order.channel === 'subscription') subscriptions += 1
    if (!lastOrderAt || order.createdAt > lastOrderAt) lastOrderAt = order.createdAt
  }

  return {
    code,
    orders: count,
    revenue: Math.round(revenue * 100) / 100,
    subscriptions,
    reversed,
    lastOrderAt,
  }
}

export async function performanceFor(code: string): Promise<PartnerPerformance> {
  return summarise(code, await listOrdersByPartnerCode(code))
}

/** Every code a partner holds, added up. */
export async function performanceForCodes(codes: string[]): Promise<PartnerPerformance[]> {
  return Promise.all(codes.map((c) => performanceFor(c)))
}
