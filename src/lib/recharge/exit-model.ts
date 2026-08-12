/**
 * What leaving costs, month by month — the model behind decision D-9.
 *
 * `cancelSettlement` answers "what is owed right now". This answers the question
 * that decides whether the settlement is a good idea at all: **across the plans
 * the quiz actually builds, how big is the balance relative to what the member
 * has paid, and when is it worst?**
 *
 * That distinction matters because the arithmetic being correct is not the same
 * as the outcome being sellable. A month-one settlement can exceed the first
 * bill — in the worked example published in the terms it is £80 against £70
 * paid — and a member who is asked for more than they have ever paid, however
 * correctly, disputes it. Chargebacks arrive before revenue does.
 *
 * Pure and dependency-light on purpose: it runs over any `MemberSubscription`,
 * so it can be pointed at the persona fixtures, at seed bundles, or at real
 * plans out of the database without changing anything.
 */
import type { MemberSubscription } from './types'
import { syncDeliveryCounts } from './clock'
import { cancelSettlement, paidToDateOf, shippedValueOf } from './mock'

const round = (n: number) => Math.round(n * 100) / 100

/** The member's position if they cancelled at the end of a given cycle. */
export interface ExitPoint {
  /** Billing cycles completed after the first — `monthsActive`. 0 = they have
   *  paid the signup month and nothing else. */
  month: number
  /** Retail value of everything dispatched by now (£). */
  shipped: number
  /** Everything they have paid by now, including the discounted first month (£). */
  paid: number
  /** The balance owed to leave (£). Zero once payments have caught up. */
  settlement: number
  /**
   * Settlement as a multiple of what they have paid.
   *
   * The number that actually predicts a complaint. Above 1 means we are asking
   * for more than they have ever given us, which reads as a penalty however it
   * is worded. `null` when nothing has been paid at all.
   */
  ratioToPaid: number | null
}

/** The whole curve, from signup to the point the balance clears. */
export interface ExitCurve {
  points: ExitPoint[]
  /** The point with the highest `settlement`. */
  worst: ExitPoint
  /** The first month at which the balance is zero — when leaving becomes free. */
  clearsAtMonth: number | null
  /** Highest `ratioToPaid` reached, ignoring months with nothing paid. */
  peakRatio: number | null
}

/**
 * The subscription as it would stand after `month` completed cycles.
 *
 * Only the clock moves. Prices, lines and cadences are held at today's values,
 * which is the right simplification for a forecast — it is deliberately NOT how
 * a real settlement should be computed once a plan has history behind it, since
 * a plan whose price moved must be settled against what was actually charged.
 */
export function subscriptionAtMonth(sub: MemberSubscription, month: number): MemberSubscription {
  return syncDeliveryCounts({ ...sub, monthsActive: Math.max(0, month) })
}

export function exitPointAt(sub: MemberSubscription, month: number): ExitPoint {
  const at = subscriptionAtMonth(sub, month)
  const paid = paidToDateOf(at)
  const settlement = cancelSettlement(at)
  return {
    month,
    shipped: shippedValueOf(at),
    paid,
    settlement,
    ratioToPaid: paid > 0 ? round(settlement / paid) : null,
  }
}

/**
 * Walk the plan's whole life and report where leaving hurts most.
 *
 * `months` should comfortably exceed the longest cadence in the plan, or the
 * curve stops before the balance has had a chance to clear and `clearsAtMonth`
 * reads as "never" when it isn't.
 */
export function exitCurve(sub: MemberSubscription, months = 12): ExitCurve {
  const points: ExitPoint[] = []
  for (let m = 0; m <= months; m++) points.push(exitPointAt(sub, m))

  const worst = points.reduce((a, b) => (b.settlement > a.settlement ? b : a), points[0])
  const cleared = points.find((p) => p.settlement <= 0.005)
  const ratios = points.map((p) => p.ratioToPaid).filter((r): r is number => r != null)

  return {
    points,
    worst,
    clearsAtMonth: cleared?.month ?? null,
    peakRatio: ratios.length > 0 ? Math.max(...ratios) : null,
  }
}

/**
 * Apply an intro discount to the first month and nothing else.
 *
 * A scratch card makes the settlement BIGGER, which is the counter-intuitive
 * part and the reason this is modelled separately: the discount reduces what
 * they paid without reducing what we sent, so the whole of it lands in the
 * shortfall. The deepest card on offer is therefore also the worst exit.
 */
export function withIntroDiscount(sub: MemberSubscription, rate: number): MemberSubscription {
  const clamped = Math.min(1, Math.max(0, rate))
  return {
    ...sub,
    introDiscountRate: clamped,
    firstMonth: round(sub.flatMonthly * (1 - clamped)),
  }
}

/**
 * Cap the settlement at a share of what the member has paid.
 *
 * One of the three levers named in D-9, expressed here so it can be modelled
 * before it is adopted. It is a deliberate write-off of genuinely owed money in
 * exchange for the balance never reading as a penalty — the trade is a smaller
 * recovery on a small number of early cancellations against not having to defend
 * "you owe us more than you have ever paid us" on any of them.
 */
export function cappedSettlement(point: ExitPoint, maxShareOfPaid: number | null): number {
  if (maxShareOfPaid == null) return point.settlement
  return round(Math.min(point.settlement, point.paid * Math.max(0, maxShareOfPaid)))
}
