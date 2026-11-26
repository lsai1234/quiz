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
import { nextPlanDate } from './billing-day'

type CadenceFields = Pick<MemberSubscriptionLine, 'deliveryIntervalMonths' | 'joinedAtMonth' | 'cadenceFrom'>

/**
 * The cycle of the next box that hasn't gone yet: the first one a change can
 * still reach.
 *
 * Cycles count calendar months from the plan's start (0 is the box at signup),
 * and `monthsActive` is the last one paid for. The two normally agree that the
 * next box is `monthsActive + 1`; where they don't (a plan whose day has started
 * but whose renewal hasn't been paid yet, or a plan with no Stripe behind it,
 * whose clock never advances), the later of the two is the box still to come.
 */
export function nextBoxCycle(
  sub: Pick<MemberSubscription, 'startedAt' | 'dispatchDayOfMonth' | 'monthsActive' | 'nextDispatchOverride'>,
  now: Date = new Date(),
): number {
  const override = sub.nextDispatchOverride ? new Date(sub.nextDispatchOverride) : null
  const next = override && !Number.isNaN(override.getTime()) ? override : nextPlanDate(sub.dispatchDayOfMonth, now)
  const start = new Date(sub.startedAt)
  const from = Number.isNaN(start.getTime()) ? now : start
  const byCalendar = (next.getFullYear() - from.getFullYear()) * 12 + (next.getMonth() - from.getMonth())
  return Math.max(sub.monthsActive + 1, byCalendar)
}

/**
 * How many deliveries of a line have shipped by `monthsActive`.
 *
 * Derived rather than accumulated, deliberately. An accumulator drifts the moment
 * an event is replayed, a line is substituted, or a webhook is redelivered;
 * deriving it from the cycle count and the line's own cadence means it is always
 * consistent with what the member has been billed, and a swap that keeps the line
 * id keeps its delivery history for free.
 *
 * `joinedAtMonth` is the cycle of the line's first box (0 for everything created
 * at signup, the next box for a product added later), so a product added in
 * month four isn't credited with the four boxes that shipped before it existed.
 *
 * Once the member has changed how often it comes, it counts from `cadenceFrom`
 * instead (`withInterval`): the deliveries made by then, the box the next one
 * is in, and every `deliveryIntervalMonths` after that. Before that box it
 * stands still, so nothing ships between the change and the next one. (Months
 * before the change aren't replayed: nothing asks about them once they've
 * shipped, and the stored `deliveriesMade` already holds their count.)
 */
export function deliveriesMadeFor(line: CadenceFields, monthsActive: number): number {
  const every = Math.max(1, line.deliveryIntervalMonths)
  const from = line.cadenceFrom
  if (from) {
    if (monthsActive >= from.cycle) return from.made + 1 + Math.floor((monthsActive - from.cycle) / every)
    return monthsActive >= from.last ? from.made : Math.max(0, from.made - 1)
  }
  const cyclesOnPlan = monthsActive - (line.joinedAtMonth ?? 0)
  if (cyclesOnPlan < 0) return 0
  return Math.floor(cyclesOnPlan / every) + 1
}

/** The cycle of the line's latest delivery at or before `upTo`, or null if it hasn't had one. */
export function lastDeliveryCycle(line: CadenceFields, upTo: number): number | null {
  const every = Math.max(1, line.deliveryIntervalMonths)
  const from = line.cadenceFrom
  if (from) {
    if (upTo >= from.cycle) return from.cycle + Math.floor((upTo - from.cycle) / every) * every
    return upTo >= from.last ? from.last : null
  }
  const joined = line.joinedAtMonth ?? 0
  if (upTo < joined) return null
  return joined + Math.floor((upTo - joined) / every) * every
}

/**
 * The line, coming every `every` months, counted from its last delivery.
 *
 * Changing how often something comes used to keep counting from the plan's
 * start, so a tub that came every 2 months, changed to every 3 in month 3, came
 * again in month 3, one month after the last; and the other way a change could
 * leave a long gap. Now the next one comes `every` months after the last, or in
 * the next box if that's already passed. A line that hasn't had its first box
 * yet keeps it where it is.
 *
 * `nextCycle` is the next box still to come (`nextBoxCycle`). Pure; the server
 * works this out itself from the stored line (`reprice`), so the schedule can't
 * be set from the browser.
 */
export function withInterval<L extends CadenceFields>(line: L, every: number, nextCycle: number): L {
  const months = Math.max(1, Math.round(every))
  if (months === Math.max(1, line.deliveryIntervalMonths)) return line
  const made = deliveriesMadeFor(line, nextCycle - 1)
  const last = lastDeliveryCycle(line, nextCycle - 1)
  if (made === 0 || last == null) return { ...line, deliveryIntervalMonths: months }
  return { ...line, deliveryIntervalMonths: months, cadenceFrom: { cycle: Math.max(last + months, nextCycle), made, last } }
}

/** The first box at or after `fromCycle` this line is due in (within `horizon` cycles). */
export function nextDueCycle(line: CadenceFields, fromCycle: number, horizon = 24): number | null {
  for (let c = fromCycle; c < fromCycle + horizon; c++) if (shipsAtCycle(line, c)) return c
  return null
}

/**
 * Whether a line actually dispatches at a given billing cycle.
 *
 * The cadence gate. `deliveriesMadeFor` is a running total, so a line ships on
 * exactly the cycles where that total goes up — which is cycle 0, and then every
 * `deliveryIntervalMonths` after the cycle it joined on.
 *
 * This is what makes the flat monthly honest. The whole reason a three-month tub
 * costs a third of its price each month is that it arrives once every three
 * months; dispatching it monthly would send three times the product for the same
 * money, and would make the exit settlement — which bills against this exact
 * model — describe something that never happened.
 */
export function shipsAtCycle(line: CadenceFields, cycle: number): boolean {
  return deliveriesMadeFor(line, cycle) > deliveriesMadeFor(line, cycle - 1)
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
