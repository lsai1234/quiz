/**
 * The subscription clock.
 *
 * `monthsActive` and `deliveriesMade` are the two inputs the pay-for-what-shipped
 * settlement runs on, and until now nothing advanced them: both were written once
 * by `buildMemberSubscription` and then frozen for the life of the subscription.
 * A member six months in still looked, to every piece of billing maths, like one
 * who had just signed up.
 *
 * Stripe's invoice stream is the honest source of truth for "how many cycles has
 * this member actually paid for", so that is what drives this module — see
 * `lib/payments/webhook.ts`. Everything here is pure; the webhook does the I/O.
 *
 * ── Semantics of `monthsActive` ───────────────────────────────────────────────
 * It counts billing cycles completed **after** the first one. A subscription is
 * created with `monthsActive: 0`, having already paid its first month at signup
 * (the `subscription_create` invoice). The first RENEWAL takes it to 1.
 *
 * That reading is what the rest of the codebase already assumes:
 *   • `paidToDateOf`  = firstMonth + monthsActive × flatMonthly
 *   • `deliveriesInMonths(months, every)` = floor(months / every) + 1 — the `+ 1`
 *     is the box that shipped at signup.
 * Getting this off by one silently mis-states every settlement, so it is pinned
 * by tests rather than left to a comment.
 */
import type { MemberSubscription, MemberSubscriptionLine } from './types'

/**
 * How many deliveries of a line have shipped by `monthsActive`.
 *
 * Derived rather than accumulated, deliberately. An accumulator drifts the moment
 * an event is replayed, a line is substituted, or a webhook is redelivered;
 * deriving it from the cycle count and the line's own cadence means it is always
 * consistent with what the member has been billed, and a swap that keeps the line
 * id keeps its delivery history for free.
 *
 * `joinedAtMonth` is the cycle the line was added on (0 for everything created at
 * signup), so a product added in month four isn't credited with the four boxes
 * that shipped before it existed.
 */
export function deliveriesMadeFor(
  line: Pick<MemberSubscriptionLine, 'deliveryIntervalMonths' | 'joinedAtMonth'>,
  monthsActive: number,
): number {
  const cyclesOnPlan = monthsActive - (line.joinedAtMonth ?? 0)
  if (cyclesOnPlan < 0) return 0
  return Math.floor(cyclesOnPlan / Math.max(1, line.deliveryIntervalMonths)) + 1
}

/**
 * Advance the subscription by one paid billing cycle.
 *
 * Called once per renewal invoice. Idempotency is the caller's job and is keyed
 * off the invoice id (see the webhook) — this function has no way to know it has
 * already run for a given invoice, and must not guess.
 *
 * A cancelled subscription never advances: Stripe should not be invoicing it, and
 * if it somehow does, inflating `monthsActive` would quietly shrink a settlement
 * that has already been calculated and shown to someone.
 */
export function advanceCycle(sub: MemberSubscription): MemberSubscription {
  if (sub.status === 'cancelled') return sub
  const monthsActive = sub.monthsActive + 1
  return {
    ...sub,
    monthsActive,
    lines: sub.lines.map((line) => ({
      ...line,
      deliveriesMade: deliveriesMadeFor(line, monthsActive),
    })),
  }
}

/**
 * Re-derive `deliveriesMade` across every line without moving the clock.
 *
 * For repairing a subscription whose stored counts drifted before this module
 * existed, and for use after a mutation that changes a line's cadence.
 */
export function syncDeliveryCounts(sub: MemberSubscription): MemberSubscription {
  return {
    ...sub,
    lines: sub.lines.map((line) => ({
      ...line,
      deliveriesMade: deliveriesMadeFor(line, sub.monthsActive),
    })),
  }
}
