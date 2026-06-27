import type { SwapGroup, StackSlot } from '@/lib/catalogue/types'

/** Subscription as the customer manages it — shaped like a Recharge subscription contract. */

export type SubscriptionStatus = 'active' | 'paused' | 'cancelled'

export interface MemberSubscriptionLine {
  /** Stable line id (Recharge subscription line id when live). */
  id: string
  productId: string
  productTitle: string
  variantTitle: string
  /** The stack slot this fulfils, e.g. "Protein". */
  slotTitle: string
  /** Primary stack slot — used to offer same-slot swap alternatives. */
  stackSlot: StackSlot
  /** Units per delivery. */
  quantity: number
  /** Delivery cadence in months. */
  deliveryIntervalMonths: number
  /** Amount billed each delivery. */
  pricePerDelivery: number
  swapGroup: SwapGroup
  /** When this line joined the subscription (ISO). Drives onset-aware advice. */
  addedAt: string
  /**
   * Deliveries of this line that have already shipped. Drives the
   * pay-for-what-shipped settlement when a line is removed mid-term, and the
   * "next ship" estimate. 0 for a freshly added line that hasn't shipped yet.
   */
  deliveriesMade: number
  /** Next scheduled ship date for this line (ISO), if it differs from the box default. */
  nextShipAt?: string
  /**
   * A one-off credit banked against the next payment (e.g. from skipping a
   * delivery). Stored on the line so it travels with it. Optional/0 = none.
   */
  pendingCredit?: number
}

export interface MemberSubscription {
  /** Recharge subscription/contract id when live. */
  id: string
  status: SubscriptionStatus
  customerEmail: string
  /** Flat amount billed every month. */
  flatMonthly: number
  /** Day of the month deliveries/charges land (1–28). */
  dispatchDayOfMonth: number
  /**
   * An explicit next-box date (ISO) that overrides the day-of-month rule for the
   * upcoming delivery only — set by "send now" / bring-forward / delay. Cleared
   * back to the day-of-month cadence after that delivery ships.
   */
  nextDispatchOverride?: string
  /** Minimum commitment in months. */
  minMonths: number
  /** Months the subscription has been active (drives the min-term guard). */
  monthsActive: number
  startedAt: string
  paymentMethod: { brand: string; last4: string } | null
  lines: MemberSubscriptionLine[]
}
