import type { SwapGroup, StackSlot } from '@/lib/catalogue/types'
import type { UsageLevel } from '@/lib/stack-blueprint/pricing'

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
  /**
   * How much the member gets through, on the friendly journey scale. Drives the
   * quantity + cadence above (we do the maths). Defaults to 'standard'.
   */
  usageLevel?: UsageLevel
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
  /**
   * Whether the member allows a same-category substitution for this line if the
   * product goes out of stock at the supplier. `true` → we swap in the closest
   * in-stock product from the same `swapGroup`; `false` → we hold/skip and
   * contact them. Defaults to allowed (see the stock-alerts journey). Optional
   * so existing stored subscriptions read back unchanged.
   */
  allowSubstitution?: boolean
}

export interface MemberSubscription {
  /** Recharge subscription/contract id when live. */
  id: string
  status: SubscriptionStatus
  customerEmail: string
  /** Flat amount billed every month. */
  flatMonthly: number
  /**
   * The fixed subscribe-&-save discount rate (0–1) for this member's bundle.
   * Added lines and swaps are priced at this rate so the bundle's advertised
   * discount carries through the whole subscription. Defaults to the base rate.
   */
  subscriptionDiscountRate?: number
  /** Day of the month deliveries/charges land (1–28). */
  dispatchDayOfMonth: number
  /**
   * An explicit next-box date (ISO) that overrides the day-of-month rule for the
   * upcoming delivery only — set by "send now" / bring-forward / delay. Cleared
   * back to the day-of-month cadence after that delivery ships.
   */
  nextDispatchOverride?: string
  /** Minimum commitment in months. 1 = none, cancel or pause any time. */
  minMonths: number
  /**
   * The first-month intro discount (0–1) the member claimed at checkout — the
   * rate they revealed on their scratch card. Re-validated server-side when the
   * checkout is finalized (see `claimIntroDiscount`), so this is the granted
   * rate, not the one the browser asked for. 0 = none claimed.
   */
  introDiscountRate?: number
  /** Amount actually billed for the first month, after `introDiscountRate`. */
  firstMonth?: number
  /** Months the subscription has been active (drives the min-term guard). */
  monthsActive: number
  startedAt: string
  paymentMethod: { brand: string; last4: string } | null
  lines: MemberSubscriptionLine[]
  /** When a snooze ends and deliveries resume (ISO). Set while paused via snooze. */
  snoozeUntil?: string
  /** Total months snoozed — defers the minimum term so a snooze never sidesteps it. */
  snoozedMonths?: number
  /** Reason captured if the member cancelled (for retention insight). */
  cancelReason?: string
  /**
   * Per-delivery edits made from the calendar, keyed by delivery id (`YYYY-MM`).
   * The flat monthly is unaffected — skips bank a credit, added items are
   * one-offs — so this only changes WHAT ships WHEN, never the recurring price.
   */
  deliveryOverrides?: Record<string, DeliveryOverride>
  /** Stripe subscription id, set once the member checks out via Stripe. */
  stripeSubscriptionId?: string
  /** Stripe customer id — used to open the billing portal. */
  stripeCustomerId?: string
}

/** A member's edit to a single scheduled delivery (from the calendar). */
export interface DeliveryOverride {
  /** Skip this box entirely (credits its value to the next payment). */
  skipped?: boolean
  /** Move this box to an explicit date (ISO). */
  dateOverride?: string
  /** Product ids added to this box as a one-off (full price). */
  addedProductIds?: string[]
  /** Recurring line ids pulled out of this box only. */
  removedLineIds?: string[]
}
