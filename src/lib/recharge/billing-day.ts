/**
 * The day of the month a plan is charged, which is also the day its box goes.
 *
 * Stripe bills a subscription on the anniversary of the moment it started (its
 * billing cycle anchor), and every renewal box is raised by that invoice
 * (`invoice.paid` in `payments/webhook`). So a plan's day is not something we
 * choose: it is the day it was bought, and Stripe's anchor is the record of it.
 *
 * Plans used to be saved as "the 15th" whatever day they were bought on, so the
 * hub's next charge, its delivery calendar and the order confirmation all named a
 * date on which nothing happened. The plan's day is now the day it starts
 * (`finalize`, `shop-plan`), and the webhook replaces it with Stripe's own anchor
 * once the subscription exists.
 *
 * Days are UK days: a plan bought at half past midnight on the 15th in summer is
 * a 15th plan, although it was still the 14th in UTC.
 */

const UK_DAY = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', day: 'numeric' })

/** The day of the month (1–31) a moment falls on in the UK. */
export function billingDayOf(at: Date | number): number {
  return Number(UK_DAY.format(typeof at === 'number' ? new Date(at) : at))
}

/** The same, from Stripe's `billing_cycle_anchor` (seconds since 1970). */
export function billingDayOfAnchor(anchorSeconds: number): number {
  return billingDayOf(anchorSeconds * 1000)
}

/**
 * The date a plan's day falls on in a given month: the day itself, or the
 * month's last day when the month is shorter, which is how Stripe bills a plan
 * started on the 29th, 30th or 31st.
 */
export function dayInMonth(day: number, year: number, monthIndex0: number): Date {
  const last = new Date(year, monthIndex0 + 1, 0).getDate()
  return new Date(year, monthIndex0, Math.min(Math.max(Math.round(day), 1), last))
}

/** The next date after `from` that the plan's day falls on. */
export function nextPlanDate(day: number, from: Date = new Date()): Date {
  const target = dayInMonth(day, from.getFullYear(), from.getMonth())
  return target > from ? target : dayInMonth(day, from.getFullYear(), from.getMonth() + 1)
}

/** "the 14th", "the 31st (or the month's last day)": how the plan's day is said. */
export function billingDayPhrase(day: number): string {
  const d = Math.min(Math.max(Math.round(day), 1), 31)
  const suffix = d % 10 === 1 && d !== 11 ? 'st' : d % 10 === 2 && d !== 12 ? 'nd' : d % 10 === 3 && d !== 13 ? 'rd' : 'th'
  return d > 28 ? `the ${d}${suffix} (or the last day of a shorter month)` : `the ${d}${suffix}`
}
