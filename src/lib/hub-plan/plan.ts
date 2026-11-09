/**
 * The member hub on its own: £X a month, sold in the shop (Founders Hub →
 * Member hub → "Sell the hub on its own"). Pure rules and types, safe in the
 * browser.
 *
 *   Joining      a monthly card payment through Stripe, priced in the
 *                checkout like the box plans (nothing to set up in Stripe).
 *                Someone whose free days from a stack are still running joins
 *                now and pays from when those days end.
 *   A stack      any paid order brings 90 days free, as it does for everyone.
 *                A member's next payment waits until those days are used up,
 *                so nobody pays for a day a stack gives them: while paying,
 *                it moves back 90 days; while already on free days, it moves
 *                to the new order's 90th day if that is later.
 *   Cancelling   stops the next payment; the hub stays open to the end of the
 *                month paid for. Within 14 days of joining, the first payment
 *                is refunded and it ends now.
 *
 * Stack orders on their own never start a subscription: the 90 days they bring
 * end by themselves (`lib/hub/access.ts`).
 */

export type HubPlanStatus = 'pending' | 'active' | 'cancelling' | 'cancelled'

export interface HubPlan {
  v: 1
  userId: string
  email: string | null
  status: HubPlanStatus
  /** The monthly price they joined at (£). */
  monthly: number
  /** When they joined (the checkout completed); null while pending. */
  startedAt: string | null
  /** When the next payment is taken (ISO); null when ended or not known. */
  nextChargeAt: string | null
  /**
   * The free days a stack order brought, while they run (ISO): the next
   * payment waits until then. Null while they're paying month by month.
   */
  freeUntil: string | null
  /** The last moment the hub is paid up to, once cancelling or cancelled (ISO). */
  endsAt: string | null
  /** Paid at least once; the 14-day refund only applies after a payment. */
  lastPaymentIntentId: string | null
  stripeSubscriptionId: string | null
  stripeCustomerId: string | null
  cancelledAt: string | null
  /** A payment failed and Stripe is retrying it. */
  pastDue?: boolean
  updatedAt: string
}

export const HUB_FREE_DAYS = 90
/** Cancel within this many days of joining for a refund of the first payment. */
export const HUB_REFUND_DAYS = 14
/** Stripe needs a free period to end at least this far ahead to start one at checkout. */
export const MIN_TRIAL_MS = 2 * 86_400_000
const DAY = 86_400_000

const at = (iso: string | null | undefined) => (iso && Number.isFinite(Date.parse(iso)) ? Date.parse(iso) : null)

/** The hub is open on this plan: joined and not past the end of what's paid. */
export function hubPlanOpen(plan: Pick<HubPlan, 'status' | 'endsAt'> | null | undefined, now: Date): boolean {
  if (!plan) return false
  if (plan.status === 'active') return true
  if (plan.status === 'cancelling') {
    const end = at(plan.endsAt)
    return end === null || end > now.getTime()
  }
  return false
}

/**
 * Where the next payment goes after a paid order on `orderAt`, so no day a
 * stack gives free is paid for (see the header). Pure.
 */
export function nextChargeAfterOrder(
  plan: Pick<HubPlan, 'nextChargeAt' | 'freeUntil'>,
  orderAt: string,
  now: Date,
): { nextChargeAt: string; freeUntil: string } {
  const order = at(orderAt) ?? now.getTime()
  const orderEnds = order + HUB_FREE_DAYS * DAY
  const next = at(plan.nextChargeAt)
  const onFreeDays = (at(plan.freeUntil) ?? 0) > now.getTime()
  let moved: number
  if (next === null) moved = orderEnds
  else if (onFreeDays) moved = Math.max(next, orderEnds)
  // Paying: the month already paid for runs out first, then the 90 free days.
  else moved = Math.max(next + HUB_FREE_DAYS * DAY, orderEnds)
  const iso = new Date(moved).toISOString()
  return { nextChargeAt: iso, freeUntil: iso }
}

/**
 * When a new member's first payment should be taken, given the free days a
 * stack already gave them: null to take it now (none left, or too few for
 * Stripe to hold one).
 */
export function firstChargeAt(hubOpenUntil: string | null, now: Date): string | null {
  const until = at(hubOpenUntil)
  if (until === null || until - now.getTime() < MIN_TRIAL_MS) return null
  return new Date(until).toISOString()
}

/** Inside the refund window: joined within 14 days, and a payment was taken. */
export function refundable(plan: Pick<HubPlan, 'startedAt' | 'lastPaymentIntentId'>, now: Date): boolean {
  const started = at(plan.startedAt)
  return started !== null && Boolean(plan.lastPaymentIntentId) && now.getTime() - started <= HUB_REFUND_DAYS * DAY
}

export function newHubPlan(input: { userId: string; email: string | null; monthly: number }, now: Date): HubPlan {
  return {
    v: 1,
    userId: input.userId,
    email: input.email,
    status: 'pending',
    monthly: input.monthly,
    startedAt: null,
    nextChargeAt: null,
    freeUntil: null,
    endsAt: null,
    lastPaymentIntentId: null,
    stripeSubscriptionId: null,
    stripeCustomerId: null,
    cancelledAt: null,
    updatedAt: now.toISOString(),
  }
}

/** What the hub shows about it. */
export interface HubPlanView {
  status: HubPlanStatus
  monthly: number
  startedAt: string | null
  nextChargeAt: string | null
  /** The next payment waits for a stack's free days. */
  onFreeDays: boolean
  endsAt: string | null
  /** Cancelling now refunds the first payment. */
  refundable: boolean
  /** A card can be changed in Stripe's billing page. */
  canManageCard: boolean
  pastDue: boolean
}

export function hubPlanView(plan: HubPlan, now: Date, stripe: boolean): HubPlanView {
  return {
    status: plan.status,
    monthly: plan.monthly,
    startedAt: plan.startedAt,
    nextChargeAt: plan.status === 'active' ? plan.nextChargeAt : null,
    onFreeDays: (at(plan.freeUntil) ?? 0) > now.getTime(),
    endsAt: plan.endsAt,
    refundable: plan.status === 'active' && refundable(plan, now),
    canManageCard: stripe && Boolean(plan.stripeCustomerId) && plan.status !== 'cancelled',
    pastDue: Boolean(plan.pastDue) && plan.status === 'active',
  }
}
