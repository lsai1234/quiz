/**
 * The daily fulfilment review queue.
 *
 * Nothing is asked of the supplier until a founder has confirmed it, so every
 * paid order lands here first — one-off (shop / quiz) and subscription renewals
 * alike. The queue is grouped by the DAY the order was paid, because that is how
 * the review actually gets done: sit down once a day, clear yesterday, send.
 *
 * Pure — the caller does the reads and hands the orders in. That keeps the
 * grouping, the counts and the money testable without a database, and lets the
 * dashboard reuse the same summary the queue page shows.
 */
import { reviewStateOf } from './service'
import type { Order, OrderReviewState } from './types'

const round = (n: number) => Math.round(n * 100) / 100

/** Which half of the business an order came from. */
export type QueueKind = 'one-off' | 'subscription'

export function queueKindOf(order: Pick<Order, 'channel'>): QueueKind {
  return order.channel === 'subscription' ? 'subscription' : 'one-off'
}

export interface QueueOrder {
  id: string
  reference: string | null
  kind: QueueKind
  channel: string
  status: string
  email: string | null
  total: number
  currency: string
  /** What the goods cost us, where we know it — the margin on this order. */
  supplierCost: number | null
  itemCount: number
  /** Lines with no SKU can't be dropshipped; they need a decision, not a send. */
  linesWithoutSku: number
  hasShippingAddress: boolean
  review: OrderReviewState
  reviewNote: string | null
  createdAt: string
}

export interface QueueDay {
  /** ISO date (YYYY-MM-DD) the orders were raised on. */
  date: string
  orders: QueueOrder[]
  /** Orders still waiting on a decision. */
  pending: number
  /** Approved but not yet sent to the supplier. */
  approved: number
  held: number
  rejected: number
  /** Value of the day's orders (£). */
  total: number
}

export interface FulfilmentQueue {
  days: QueueDay[]
  /** Total waiting on a decision across every day — the number that matters. */
  pending: number
  /** Approved and ready to send. */
  readyToSend: number
  held: number
  rejected: number
  /** Pending orders that can't be dropshipped as they stand (missing SKU or address). */
  blocked: number
  oneOff: number
  subscription: number
  /** Value of everything in the queue (£). */
  total: number
}

function toQueueOrder(order: Order): QueueOrder {
  const costKnown = order.lines.every((l) => l.supplierCost != null)
  return {
    id: order.id,
    reference: order.reference ?? null,
    kind: queueKindOf(order),
    channel: order.channel,
    status: order.status,
    email: order.email,
    total: round(order.total),
    currency: order.currency,
    supplierCost: costKnown
      ? round(order.lines.reduce((s, l) => s + (l.supplierCost ?? 0) * l.quantity, 0))
      : null,
    itemCount: order.lines.reduce((s, l) => s + l.quantity, 0),
    linesWithoutSku: order.lines.filter((l) => !l.sku).length,
    hasShippingAddress: Boolean(order.shippingAddress?.line1),
    review: reviewStateOf(order),
    reviewNote: order.review?.note ?? null,
    createdAt: order.createdAt,
  }
}

/** True when an order needs a decision before it could be sent at all. */
function isBlocked(o: QueueOrder): boolean {
  return o.linesWithoutSku > 0 || !o.hasShippingAddress
}

/**
 * Group unfulfilled orders into the day-by-day review.
 *
 * `kind` narrows to one side of the business — the hub shows one-off and
 * subscription queues separately, because the questions you ask of a renewal
 * ("has anything on this plan gone out of stock?") differ from the ones you ask
 * of a first order ("is this address real?").
 */
export function buildFulfilmentQueue(orders: Order[], kind?: QueueKind): FulfilmentQueue {
  const rows = orders.map(toQueueOrder).filter((o) => (kind ? o.kind === kind : true))

  const byDate = new Map<string, QueueOrder[]>()
  for (const row of rows) {
    const date = row.createdAt.slice(0, 10)
    byDate.set(date, [...(byDate.get(date) ?? []), row])
  }

  const days: QueueDay[] = [...byDate.entries()]
    // Newest day first: today's orders are the ones being worked.
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([date, dayOrders]) => ({
      date,
      orders: [...dayOrders].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      pending: dayOrders.filter((o) => o.review === 'pending').length,
      approved: dayOrders.filter((o) => o.review === 'approved').length,
      held: dayOrders.filter((o) => o.review === 'held').length,
      rejected: dayOrders.filter((o) => o.review === 'rejected').length,
      total: round(dayOrders.reduce((s, o) => s + o.total, 0)),
    }))

  return {
    days,
    pending: rows.filter((o) => o.review === 'pending').length,
    readyToSend: rows.filter((o) => o.review === 'approved').length,
    held: rows.filter((o) => o.review === 'held').length,
    rejected: rows.filter((o) => o.review === 'rejected').length,
    blocked: rows.filter((o) => o.review === 'pending' && isBlocked(o)).length,
    oneOff: rows.filter((o) => o.kind === 'one-off').length,
    subscription: rows.filter((o) => o.kind === 'subscription').length,
    total: round(rows.reduce((s, o) => s + o.total, 0)),
  }
}
