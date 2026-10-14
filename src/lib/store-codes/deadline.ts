/**
 * When a store code ends, in the shop's own time — for the Founders Hub's "ends"
 * control and the countdown at checkout.
 *
 * ── Why London, and why midnight ────────────────────────────────────────────
 * "Ends tonight" means tonight in the UK, whichever clock the server or the
 * customer's phone happens to be on. Store codes end at the midnight closing a
 * London calendar day, so the founders pick a day rather than a timestamp, and
 * the hour the clocks change is handled here once rather than by everyone who
 * reads an end date.
 *
 * Client-safe: no server imports. The checkout countdown formats with the same
 * functions the hub sets the date with, so the two cannot describe one deadline
 * in different words.
 */

export const SHOP_TZ = 'Europe/London'

const PARTS = new Intl.DateTimeFormat('en-GB', {
  timeZone: SHOP_TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
})

interface Wall { y: number; m: number; d: number; h: number; mi: number; s: number }

/** The London wall clock at an instant. */
function wall(ms: number): Wall {
  const parts = PARTS.formatToParts(ms)
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0)
  return { y: get('year'), m: get('month'), d: get('day'), h: get('hour'), mi: get('minute'), s: get('second') }
}

const iso = (y: number, m: number, d: number) =>
  `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`

/** The London calendar date of an instant, as `YYYY-MM-DD`. */
export function londonDate(at: Date | number): string {
  const w = wall(typeof at === 'number' ? at : at.getTime())
  return iso(w.y, w.m, w.d)
}

/** Whether a string is a real `YYYY-MM-DD` date. */
export function isIsoDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [y, m, d] = value.split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1, d))
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d
}

/** A `YYYY-MM-DD` date moved by whole days. Calendar arithmetic, so no clock is involved. */
export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1, d + days))
  return iso(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate())
}

/**
 * The instant London's day `date` ends: the midnight going into the next day.
 *
 * Found by taking that midnight as if it were UTC and taking London's offset off
 * it. The offset is read at the guess itself, which is safe because the UK
 * changes its clocks at 01:00 UTC, never across a midnight.
 */
export function londonEndOfDay(date: string): Date {
  const [y, m, d] = addDays(date, 1).split('-').map(Number)
  const guess = Date.UTC(y, m - 1, d)
  const w = wall(guess)
  const offset = Date.UTC(w.y, w.m - 1, w.d, w.h, w.mi, w.s) - guess
  return new Date(guess - offset)
}

/** Whether an instant falls exactly on a London midnight. */
function isMidnight(ms: number): boolean {
  const w = wall(ms)
  return w.h === 0 && w.mi === 0 && w.s === 0
}

/** "Sun 19 Oct" — the shape a day is named in when it is not today or tomorrow. */
export function shortDay(date: string): string {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC',
  })
}

/**
 * When a deadline is, said the way a person would: "tonight at midnight",
 * "tomorrow at midnight", "Sun 19 Oct at midnight" — or with the time, for an
 * end that is not a midnight ("today at 18:00").
 *
 * A midnight belongs to the day it closes, so a code ending at 00:00 on the
 * 14th ends "tonight" all through the 13th.
 */
export function describeDeadline(endsAt: Date | string, now: Date | number = Date.now()): string {
  const end = new Date(endsAt).getTime()
  const midnight = isMidnight(end)
  const day = londonDate(midnight ? end - 1 : end)
  const today = londonDate(now)
  const time = midnight ? 'midnight' : (() => {
    const w = wall(end)
    return `${String(w.h).padStart(2, '0')}:${String(w.mi).padStart(2, '0')}`
  })()
  const when =
    day === today ? (midnight ? 'tonight' : 'today')
      : day === addDays(today, 1) ? 'tomorrow'
        : shortDay(day)
  return `${when} at ${time}`
}

export interface TimeLeft {
  /** Milliseconds, never below zero. */
  ms: number
  days: number
  hours: number
  minutes: number
  seconds: number
}

export function timeLeft(endsAt: Date | string, now: Date | number = Date.now()): TimeLeft {
  const ms = Math.max(0, new Date(endsAt).getTime() - new Date(now).getTime())
  const total = Math.floor(ms / 1000)
  return {
    ms,
    days: Math.floor(total / 86400),
    hours: Math.floor((total % 86400) / 3600),
    minutes: Math.floor((total % 3600) / 60),
    seconds: total % 60,
  }
}

const two = (n: number) => String(n).padStart(2, '0')

/**
 * The countdown's face: `04:12:33` inside a day, `2d 04h` beyond one.
 *
 * Seconds only when they matter — a ticking second on a deadline three days off
 * is noise that reads as pressure.
 */
export function clockFace(t: TimeLeft): string {
  if (t.days > 0) return `${t.days}d ${two(t.hours)}h`
  return `${two(t.hours)}:${two(t.minutes)}:${two(t.seconds)}`
}

/** The same amount in words, for the sentence beside the clock: "4h 12m", "2 days". */
export function wordsLeft(t: TimeLeft): string {
  if (t.days >= 2) return `${t.days} days`
  if (t.days === 1) return `1 day ${t.hours}h`
  if (t.hours > 0) return `${t.hours}h ${t.minutes}m`
  if (t.minutes > 0) return `${t.minutes} min`
  return 'under a minute'
}
