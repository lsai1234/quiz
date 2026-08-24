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
import { deliverability } from '@/lib/pricing/zones'
import { customerDeliveryCharge } from '@/lib/pricing/delivery'
import type { Order, OrderReviewState } from './types'

const round = (n: number) => Math.round(n * 100) / 100

/** Which half of the business an order came from. */
export type QueueKind = 'one-off' | 'subscription'

export function queueKindOf(order: Pick<Order, 'channel'>): QueueKind {
  return order.channel === 'subscription' ? 'subscription' : 'one-off'
}

/**
 * What a founder needs to know about the plan before approving one of its boxes.
 *
 * Read off the order's own snapshot rather than the live subscription, so the
 * terms shown are the ones this delivery was raised under.
 */
export interface QueueSubscription {
  id: string
  /** 0 is the box that ships at signup. */
  cycle: number
  /**
   * True for the very first box on a plan — a new member, a new recurring
   * charge, and the approval that matters most. Called out separately because
   * "cycle 0" is not a thing anyone should have to translate at 8am.
   */
  isFirstBox: boolean
  /** The flat amount billed every month (£) from here on. */
  monthly: number
  /** Minimum commitment in months. 1 = none. */
  minMonths: number
  /** Day of the month the charge and the box land. */
  dispatchDayOfMonth: number
  /**
   * What this cycle's invoice actually charged (£), where we recorded it. On a
   * first box with an intro discount this is deliberately below `monthly` — the
   * gap is the discount, and seeing both is how it gets sanity-checked.
   */
  billed: number | null
  /** The first-month intro discount rate (0–1), on a first box that used one. */
  introDiscountRate: number | null
}

/**
 * The plan behind a subscription order, or null when there isn't one to show.
 *
 * Null covers two cases that both want the same handling: a one-off order, and
 * a subscription order raised before the context was snapshotted. Neither is an
 * error — the row still renders, it just has no plan detail to add.
 */
function subscriptionOf(order: Order): QueueSubscription | null {
  const sub = order.subscription
  if (!sub) return null
  return {
    id: sub.id,
    cycle: sub.cycle,
    isFirstBox: sub.cycle === 0,
    monthly: round(sub.monthly),
    minMonths: sub.minMonths,
    dispatchDayOfMonth: sub.dispatchDayOfMonth,
    billed: order.billedAmount != null ? round(order.billedAmount) : null,
    introDiscountRate: sub.introDiscountRate ?? null,
  }
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
  /**
   * Set when PowerBody will not dropship to this address at all — Northern
   * Ireland, Guernsey, Jersey, or anywhere outside the UK on a UK account.
   *
   * These look like ordinary orders: a Belfast address is a UK address, in
   * PowerBody's own Zone 2, and nothing about it warns you until the supplier
   * refuses it. Catching it here is the difference between a refund and a
   * customer waiting for a parcel that was never coming.
   */
  undeliverableReason: string | null
  /** Which zone the address falls in — Zone 2 costs us more to ship to. */
  deliveryZone: string | null
  /**
   * Set when they paid a mainland delivery rate and then gave a Highlands
   * address (£, what is missing).
   *
   * Stripe fixes its shipping options when the SESSION is created, before the
   * customer has typed an address, so the zone is self-selected and nothing
   * stops someone picking the cheaper one. This is the check on that pick — the
   * order is still perfectly sendable, it just cost us more than it collected,
   * and a number on the screen is how that gets noticed rather than blended
   * into a monthly margin figure.
   */
  deliveryShortfall: number | null
  review: OrderReviewState
  reviewNote: string | null
  /** The plan behind this box, on subscription orders that carry one. */
  subscription: QueueSubscription | null
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
  /** Pending orders going somewhere PowerBody will not ship at all. */
  undeliverable: number
  oneOff: number
  subscription: number
  /**
   * Pending FIRST boxes — new members whose opening delivery has not been
   * approved yet.
   *
   * Counted separately from `subscription` because the two are different jobs. A
   * renewal is a plan already signed off once, and the review is "has anything
   * gone out of stock?". A first box is a person who has just started paying
   * every month, and the review is "should this plan exist at all?" — which is
   * worth being told about rather than having to spot in a list.
   */
  firstBoxes: number
  /** Value of everything in the queue (£). */
  total: number
  /**
   * Committed monthly value of the pending first boxes (£) — what approving
   * them all signs up, per month, from here on.
   */
  firstBoxMonthly: number
}

/**
 * An order that has been sent and is now the supplier's problem — until it isn't.
 *
 * Sending is not the end of the job. The moment an order is submitted it drops
 * out of the review queue entirely, which used to mean the only evidence it had
 * been accepted was that the button had stopped erroring. This is the other half
 * of "send it": a short list of what is out there, what the supplier last said
 * about it, and how long it has been saying that.
 */
export interface InFlightOrder {
  id: string
  reference: string | null
  kind: QueueKind
  email: string | null
  total: number
  currency: string
  /** The supplier's own handle for it — a `SIM-…` id when this was simulated. */
  supplierOrderId: string | null
  /** Where the supplier says it is (`received`, `processing`, `shipped`…). */
  supplierStatus: string | null
  /** Our mapped status. */
  status: string
  trackingNumber: string | null
  /** True when this went to the mock rather than to PowerBody. */
  simulated: boolean
  /** When it was sent (ISO), from the audit trail. */
  sentAt: string | null
  /**
   * Whole days since it was sent, or null when we can't tell.
   *
   * The number that matters on this screen. An order the supplier has said
   * nothing about for four days is the failure this list exists to catch — it
   * looks identical to a healthy one in every other column.
   */
  daysWaiting: number | null
  /**
   * True when it has been sitting unacknowledged long enough to chase — still
   * only `received` after two days. Not an error, just the thing to look at.
   */
  stalled: boolean
}

/** When the supplier was told about this order, from its own audit trail. */
function sentAtOf(order: Order): string | null {
  const sent = [...order.events].reverse().find((e) => e.type === 'submitted_to_supplier')
  return sent?.at ?? null
}

/** Whole days between an ISO timestamp and now. */
function daysSince(iso: string | null, now: Date): number | null {
  if (!iso) return null
  const then = Date.parse(iso)
  if (Number.isNaN(then)) return null
  return Math.floor((now.getTime() - then) / 86_400_000)
}

/**
 * Everything currently with the supplier, longest-waiting first.
 *
 * Sorted that way on purpose: this list is read to find what is stuck, and the
 * order that has been waiting longest is the one most likely to be.
 */
export function buildInFlightList(orders: Order[], now: Date = new Date()): InFlightOrder[] {
  return orders
    .map((order) => {
      const sentAt = sentAtOf(order)
      const daysWaiting = daysSince(sentAt, now)
      return {
        id: order.id,
        reference: order.reference ?? null,
        kind: queueKindOf(order),
        email: order.email,
        total: round(order.total),
        currency: order.currency,
        supplierOrderId: order.supplierOrderId,
        supplierStatus: order.supplierStatus,
        status: order.status,
        trackingNumber: order.trackingNumber,
        simulated: order.supplierSimulated === true,
        sentAt,
        daysWaiting,
        // Only ever about an order the supplier has not moved off "received".
        // Once it is processing or shipped it is progressing, however slowly,
        // and flagging that as stuck would train the flag to be ignored.
        stalled:
          order.status === 'submitted_to_supplier' && daysWaiting != null && daysWaiting >= 2,
      }
    })
    .sort((a, b) => (a.sentAt ?? '').localeCompare(b.sentAt ?? ''))
}

/**
 * What this order should have collected for delivery, minus what it did.
 *
 * Only ever reports a Zone 2 order that paid a Zone 1 rate. An order that
 * overpaid is not a problem to flag, and an order with no address has bigger
 * ones — both come back null.
 */
function shortfallOn(order: Order, zone: string | null): number | null {
  if (zone !== 'uk-2') return null
  const due = customerDeliveryCharge(order.subtotal, 'uk-2')
  const paid = order.shipping ?? 0
  const short = round(due - paid)
  return short > 0 ? short : null
}

function toQueueOrder(order: Order): QueueOrder {
  const costKnown = order.lines.every((l) => l.supplierCost != null)
  const reach = order.shippingAddress ? deliverability(order.shippingAddress) : null
  return {
    undeliverableReason: reach?.excluded ? reach.reason : null,
    deliveryZone: reach?.zone ?? null,
    deliveryShortfall: shortfallOn(order, reach?.zone ?? null),
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
    subscription: subscriptionOf(order),
    createdAt: order.createdAt,
  }
}

/** True when an order needs a decision before it could be sent at all. */
function isBlocked(o: QueueOrder): boolean {
  return o.linesWithoutSku > 0 || !o.hasShippingAddress || o.undeliverableReason != null
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
  const rows = orders
    // A subscription cycle can legitimately dispatch nothing — every line a
    // multi-month item that is not due this month. The order still exists as the
    // record that the invoice was processed, but there is no box, so it is not
    // queue work. Dropped here rather than in the SQL because "has lines" is a
    // domain fact, not a storage one.
    .filter((o) => o.lines.length > 0)
    .map(toQueueOrder)
    .filter((o) => (kind ? o.kind === kind : true))

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

  const pendingFirstBoxes = rows.filter((o) => o.review === 'pending' && o.subscription?.isFirstBox)

  return {
    days,
    pending: rows.filter((o) => o.review === 'pending').length,
    readyToSend: rows.filter((o) => o.review === 'approved').length,
    held: rows.filter((o) => o.review === 'held').length,
    rejected: rows.filter((o) => o.review === 'rejected').length,
    blocked: rows.filter((o) => o.review === 'pending' && isBlocked(o)).length,
    undeliverable: rows.filter((o) => o.review === 'pending' && o.undeliverableReason != null).length,
    oneOff: rows.filter((o) => o.kind === 'one-off').length,
    subscription: rows.filter((o) => o.kind === 'subscription').length,
    firstBoxes: pendingFirstBoxes.length,
    total: round(rows.reduce((s, o) => s + o.total, 0)),
    firstBoxMonthly: round(
      pendingFirstBoxes.reduce((s, o) => s + (o.subscription?.monthly ?? 0), 0),
    ),
  }
}
