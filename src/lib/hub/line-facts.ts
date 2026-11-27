/**
 * One product on a plan, said the same way everywhere: how often it comes, how
 * many at a time, when the next one is, and how long one lasts. The hub's plan
 * list, its product sheet and "What you have" all read these, so a product is
 * never "every 3 months" in one place and "quarterly" in another. Pure.
 */

/** Days in an average month, for turning months of supply into days. */
const DAYS_PER_MONTH = 30.44

/**
 * "every month", "every 2 months", or "about every 11 weeks" for a rhythm that
 * isn't a whole number of months (a tub that lasts 2½ months comes in the box
 * before it runs out, two or three months apart).
 */
export function everyLabel(months: number): string {
  const m = Math.max(1, Math.round(Number(months) * 100) / 100 || 1)
  if (Number.isInteger(m)) return m === 1 ? 'every month' : `every ${m} months`
  return `about every ${Math.round((m * DAYS_PER_MONTH) / 7)} weeks`
}

/** "2 at a time", or nothing for one. */
export function countLabel(quantity: number): string | null {
  return quantity > 1 ? `${quantity} at a time` : null
}

/** "2 at a time, every 3 months", or "every month" for one. */
export function rhythmLabel(quantity: number, months: number): string {
  const count = countLabel(quantity)
  return count ? `${count}, ${everyLabel(months)}` : everyLabel(months)
}

/** A period of days in words: days under two weeks, weeks after that. */
function daysInWords(days: number): string {
  if (days < 14) return `${days} ${days === 1 ? 'day' : 'days'}`
  return `${Math.round(days / 7)} weeks`
}

/** "about 11 weeks": how long one lasts, or null where we don't know. */
export function lastsLabel(lastsMonths: number | null | undefined): string | null {
  if (typeof lastsMonths !== 'number' || !Number.isFinite(lastsMonths) || lastsMonths <= 0) return null
  const weeks = Math.max(1, Math.round((lastsMonths * DAYS_PER_MONTH) / 7))
  return `about ${weeks} ${weeks === 1 ? 'week' : 'weeks'}`
}

/** How a rhythm fits how fast someone gets through it. */
export interface SupplyFit {
  /** About when they run out (within three days), short of it, or with some spare. */
  kind: 'on-time' | 'short' | 'spare'
  /** How far off, in days, per delivery. */
  days: number
}

/**
 * How `quantity` every `months` fits a product that lasts `lastsMonths`: what
 * each delivery supplies against the gap to the next one. Null where we don't
 * know how long it lasts.
 */
export function supplyFit(lastsMonths: number | null | undefined, quantity: number, months: number): SupplyFit | null {
  if (typeof lastsMonths !== 'number' || !Number.isFinite(lastsMonths) || lastsMonths <= 0) return null
  const gapDays = Math.round((Math.max(1, quantity) * lastsMonths - Math.max(1, months)) * DAYS_PER_MONTH)
  if (Math.abs(gapDays) <= 3) return { kind: 'on-time', days: Math.abs(gapDays) }
  return gapDays < 0 ? { kind: 'short', days: -gapDays } : { kind: 'spare', days: gapDays }
}

/** The fit as one plain sentence. */
export function supplyFitSentence(fit: SupplyFit): string {
  switch (fit.kind) {
    case 'on-time':
      return 'Each one comes about when you run out.'
    case 'short':
      return `You’d run out about ${daysInWords(fit.days)} before each one comes.`
    case 'spare':
      return `You’ll have about ${daysInWords(fit.days)} spare each time.`
  }
}

/** "Mon 15 December": a box's date, as the hub says it. */
export function boxDateLabel(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'long' })
}

/** "15 Dec": a short date for lists. */
export function shortBoxDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}
