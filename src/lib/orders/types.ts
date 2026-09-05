/**
 * Order domain types.
 *
 * An order is one purchase (shop, quiz stack, or a subscription delivery) that
 * we fulfil by dropshipping through PowerBody. The full document is stored as
 * JSON in the `orders` table with a few indexed columns for querying (see
 * `repo.ts`). Status walks: pending_payment → paid → submitted_to_supplier →
 * supplier_confirmed → shipped → delivered, with cancelled / refunded / failed
 * as terminal side-exits.
 */
import type { SupplierAddress } from '@/lib/supplier/types'

export type OrderChannel = 'shop' | 'quiz' | 'subscription'

export type OrderStatus =
  | 'pending_payment'
  | 'paid'
  | 'submitted_to_supplier'
  | 'supplier_confirmed'
  | 'shipped'
  | 'delivered'
  | 'cancelled'
  | 'refunded'
  | 'failed'

export interface OrderLine {
  /** Supplier SKU — needed to place the dropship order. Null if unknown. */
  sku: string | null
  productId: string
  title: string
  variantTitle?: string | null
  quantity: number
  /** What the customer paid per unit. */
  unitPrice: number
  /** What we pay the supplier per unit, ex VAT (margin tracking). Null if unknown. */
  supplierCost?: number | null
  /**
   * Shipped weight of one unit (g). Snapshotted onto the line because
   * PowerBody's delivery charge is weight-banded and their `createOrder` call
   * requires a weight — and because a product's weight can change under us,
   * while what we actually paid to ship this order cannot.
   */
  weightGrams?: number | null
}

/** An audit entry appended on every meaningful transition. */
export interface OrderEvent {
  at: string
  type: string
  detail?: string
}

/**
 * Where an order sits in the daily fulfilment review.
 *
 *   pending  — paid, waiting for a founder to look at it. The default, and the
 *              reason nothing reaches the supplier by accident.
 *   approved — a founder has confirmed it; only now may it be sent.
 *   held     — parked deliberately (a query on the address, a stock doubt).
 *              Stays out of the queue's "to do" count until released.
 *   rejected — will not be fulfilled as it stands; refund or cancel it.
 *
 * Orders written before this existed have no `review` at all, which reads as
 * `pending` — the safe default, so an old paid order surfaces for review rather
 * than being silently treated as approved.
 */
export type OrderReviewState = 'pending' | 'approved' | 'held' | 'rejected'

export interface OrderReview {
  state: OrderReviewState
  /** Who decided, when we know. */
  by?: string | null
  /** When the state was last set (ISO). */
  at?: string
  /** Free-text reason, shown in the queue. */
  note?: string | null
}

/**
 * The plan a subscription delivery came from, snapshotted onto the order.
 *
 * Subscription orders are reviewed in the same daily queue as one-off ones, but
 * the question being asked of them is different. A first box is a new member
 * committing to a recurring charge; a renewal is a plan that has already been
 * approved once. Telling them apart — and seeing what the member is actually
 * paying each month before waving the box through — is the whole point of this.
 *
 * Snapshotted rather than looked up when the queue renders, for the same reason
 * `billedAmount` and `partnerCode` are: a plan's price, minimum term and lines
 * all move, and what was true when this delivery was raised is what the review
 * has to be judged against. A plan cancelled tomorrow must not erase the terms
 * the box that shipped today went out under.
 */
export interface OrderSubscriptionContext {
  /** The subscription this delivery belongs to. */
  id: string
  /**
   * Which delivery this is: 0 is the box that ships at signup, 1 the first
   * renewal, and so on. This is the fact that makes a first box visible as one.
   */
  cycle: number
  /** The flat amount billed every month (£). */
  monthly: number
  /** Minimum commitment in months. 1 = none, cancel or pause any time. */
  minMonths: number
  /** Day of the month deliveries and charges land (1–28). */
  dispatchDayOfMonth: number
  /**
   * The first-month intro discount rate claimed at checkout (0–1), when any.
   * Only meaningful on cycle 0, and worth seeing there: it is the difference
   * between what this member paid to join and what they will pay from now on.
   */
  introDiscountRate?: number | null
  /** What the first month actually billed (£), after intro and partner discount. */
  firstMonth?: number | null
  /** When the plan started (ISO). */
  startedAt: string
}

export interface Order {
  id: string
  /**
   * Customer-facing reference, e.g. `CHRGD-7K4M2XQP`. Shown on the confirmation
   * screen and in support conversations; the internal `id` and every Stripe id
   * stay private (OC-F-020).
   *
   * Deliberately random rather than sequential. A counter would be friendlier to
   * read but tells anyone who buys twice how many orders you take, and lets a
   * stranger walk the range — which OC-E-007 exists to prevent.
   *
   * Optional so orders written before this existed still parse; `orderReference`
   * falls back to the internal id for those.
   */
  reference?: string
  channel: OrderChannel
  status: OrderStatus
  userId: string | null
  email: string | null
  currency: string
  subtotal: number
  shipping: number
  total: number
  lines: OrderLine[]
  shippingAddress: SupplierAddress | null
  // ── Payment (Stripe) ──
  stripeSessionId: string | null
  stripePaymentIntentId: string | null
  // ── Supplier fulfilment (PowerBody) ──
  /**
   * The founder's decision on whether this may be sent to the supplier. Absent
   * on orders written before the review queue existed — read it through
   * `reviewStateOf()` in `service.ts`, never directly, so those default to
   * `pending` rather than to nothing.
   */
  review?: OrderReview
  supplierOrderId: string | null
  supplierStatus: string | null
  /**
   * True when this order was "sent" with ordering in simulate mode — it walked
   * the whole flow but never reached PowerBody, and its `supplierOrderId` is a
   * local `SIM-…` handle rather than one of theirs.
   *
   * Absent on orders raised before the simulate/live switch existed, and on
   * orders not yet submitted. Recorded per-order rather than inferred from the
   * current setting because the setting changes and history must not: an order
   * simulated last week is still simulated after the switch is flipped to live.
   */
  supplierSimulated?: boolean
  trackingNumber: string | null
  /**
   * The partner code this order came in on, normalised (`SARAH20`), or absent.
   *
   * Snapshotted here rather than looked up later for the same reason
   * `supplierSimulated` is: a partner's code can be paused, retired or reissued,
   * and an order that came in on it stays theirs. This is what commission is
   * calculated from, so it is also what has to survive the code changing.
   */
  partnerCode?: string | null
  /**
   * What the partner's code took off this order, 0–1 — the code's own rate, not
   * the combined discount. Recorded because the rate on a code is editable and
   * the amount a customer actually got is not open to later revision.
   */
  partnerDiscountPct?: number | null
  /**
   * The founder code this order was bought on, if any — `FH-FREE-…`,
   * `FH-COST-…` or `FH-MIN-…`.
   *
   * A free or cost-price order looks exactly like an underpriced one in the
   * financials, and the difference between "we sold this at cost deliberately"
   * and "something is wrong with the pricing" is this field. It is also the
   * audit trail: the code row records which order spent it, and this records
   * which code the order was spent on, so the pair can be reconciled from
   * either end.
   *
   * Never a partner code, and never counted as one — no commission accrues on
   * an order bought by us.
   */
  founderCode?: string | null
  /** Which kind it was, so a screen can say so without a second lookup. */
  founderCodeKind?: 'free' | 'cost' | 'unlock' | null
  /**
   * The partner starter this order was bought on — a micro-influencer's own
   * free stack. See `lib/partner-starter`.
   *
   * Never a partner code and never counted as one: a partner's own purchases
   * earn them no commission, which is a term of the programme rather than a
   * gap. `/api/cart` does not even run the redemption when a starter is in play.
   */
  starterCode?: string | null
  /**
   * Whose it was.
   *
   * Stored alongside the code rather than resolved through it, because the
   * question asked of this field — "which partners have already had their
   * stack?" — is asked across orders and must survive the code itself being
   * tidied away.
   */
  starterPartnerId?: string | null
  /**
   * What the member was actually charged for the billing cycle this order
   * belongs to (£). Subscription orders only.
   *
   * Deliberately NOT `total`. `total` is the value of the goods in THIS box; on
   * a smoothed plan the two are different by design — a box carrying a
   * three-month tub is worth far more than that month's payment, and the boxes
   * in between are worth less. The exit settlement is those two columns summed
   * over a plan's life and subtracted, so both have to be written down at the
   * time. Neither can be honestly re-derived afterwards once a price has moved,
   * which is the whole failure this replaces.
   *
   * A cycle that dispatched nothing still carries this: it is the payment record
   * for that month, and the reason those empty orders are worth keeping.
   */
  billedAmount?: number | null
  /**
   * The plan behind this delivery. Subscription orders only, and absent on
   * subscription orders raised before this existed — the queue reads it
   * defensively so those still render, just without the plan detail.
   */
  subscription?: OrderSubscriptionContext | null
  // ── Audit ──
  events: OrderEvent[]
  createdAt: string
  updatedAt: string
  /**
   * Whether the purchase/conversion event has already been reported to
   * analytics. Server-side and on the order itself, NOT localStorage — a
   * refresh, a second device or a shared link must not each count as a sale
   * (OC-F-090).
   */
  analyticsReported?: boolean
}

/** What `createOrderFromCheckout` needs to raise a paid order. */
export interface CreateOrderInput {
  id?: string
  channel: OrderChannel
  userId?: string | null
  email?: string | null
  currency?: string
  lines: OrderLine[]
  shipping?: number
  shippingAddress?: SupplierAddress | null
  status?: OrderStatus
  stripeSessionId?: string | null
  stripePaymentIntentId?: string | null
  /** Attribution, when the buyer used a partner's code. Already validated. */
  partnerCode?: string | null
  partnerDiscountPct?: number | null
  /** The founder code this order was bought on — see `Order.founderCode`. */
  founderCode?: string | null
  founderCodeKind?: 'free' | 'cost' | 'unlock' | null
  /** The partner starter it was bought on — see `Order.starterCode`. */
  starterCode?: string | null
  starterPartnerId?: string | null
  /** What the cycle was billed at — see `Order.billedAmount`. */
  billedAmount?: number | null
  /** The plan behind this delivery — see `Order.subscription`. */
  subscription?: OrderSubscriptionContext | null
}
