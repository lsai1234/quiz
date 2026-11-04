/**
 * Built around your day (Option 3): each product in the box placed on the
 * person's own day, at its "Best taken" moment.
 *
 *   The day      their wake and bed times, when they train and how often:
 *                from the consult (`dayFromConsult`), or the original quiz's
 *                training answers on a stated 7am–11pm day (`dayFromQuiz`).
 *   The moment   the product's `consumption.anchor` ("Best taken", set per
 *                product in the Founders Hub from the label); without one,
 *                its cadence decides (before training, or with breakfast).
 *   The clock    the moment placed on their day: breakfast just after waking,
 *                an hour before bed, half an hour before training, and so on.
 *                Moments with no time of their own (hot days, when you
 *                choose) sit in their own group.
 *
 * Pure, and the same on the results page, in the emailed guide and in the
 * calendar reminders. It never says why: see `./copy`.
 */
import type { CatalogueProduct, PourAnchor } from '@/lib/catalogue/types'
import type { QuizAnswers } from '@/lib/types'
import { shortNameOf } from '@/lib/catalogue/short-name'
import { ROUTINE_COPY } from './copy'

export interface RoutineDay {
  /** Minutes past midnight. */
  wake: number
  bed: number
  /** When they usually train, minutes past midnight; null when it varies or is unknown. */
  trainAt: number | null
  /** Sessions in a normal week; null when unknown. */
  trainDays: number | null
  /** Which days, Monday = 0, when they said; null otherwise. */
  trainWeekdays: number[] | null
  /** Wake and bed are the stated defaults, not theirs. */
  assumed: boolean
}

export const DEFAULT_WAKE = 7 * 60
export const DEFAULT_BED = 23 * 60

export type RoutineDays = 'every-day' | 'most-days' | 'training-days' | 'when-you-choose'

export interface RoutineItem {
  productId: string
  title: string
  anchor: PourAnchor
  /** On the clock, or null for a moment with no time of its own. */
  minutes: number | null
  /** The moment, in words ("With breakfast"). */
  moment: string
  days: RoutineDays
  /** How often, in words ("Every day", "On Mon, Wed, Fri"). */
  daysLabel: string
  /** How much, in words ("1 serving"). */
  amount: string
}

export interface RoutineMoment {
  /** Null for the untimed groups at the end. */
  minutes: number | null
  label: string
  items: RoutineItem[]
}

export interface Routine {
  day: RoutineDay
  items: RoutineItem[]
  /** By time of day, then the untimed groups. */
  moments: RoutineMoment[]
}

/** What the routine needs to know about a product. */
export type RoutineProduct = Pick<CatalogueProduct, 'id' | 'title' | 'shortName' | 'consumption' | 'stackSlots'>

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n))
const round5 = (n: number) => Math.round(n / 5) * 5

/* ── The day ─────────────────────────────────────────────────────────────── */

const QUIZ_TRAIN_AT: Record<NonNullable<QuizAnswers['trainingTime']>, number | null> = {
  morning: 8 * 60,
  lunchtime: 12 * 60 + 30,
  evening: 18 * 60 + 30,
  varies: null,
}
const QUIZ_TRAIN_DAYS: Record<NonNullable<QuizAnswers['trainingFrequency']>, number> = { '1-2x': 2, '3-4x': 3, '5-6x': 5, daily: 7 }

/** The original quiz asks when and how often they train, not when they sleep. */
export function dayFromQuiz(a: Pick<QuizAnswers, 'trainingTime' | 'trainingFrequency'>): RoutineDay {
  return {
    wake: DEFAULT_WAKE,
    bed: DEFAULT_BED,
    trainAt: a.trainingTime ? QUIZ_TRAIN_AT[a.trainingTime] : null,
    trainDays: a.trainingFrequency ? QUIZ_TRAIN_DAYS[a.trainingFrequency] : null,
    trainWeekdays: null,
    assumed: true,
  }
}

/** A day with nothing known: the stated defaults. */
export function defaultDay(): RoutineDay {
  return { wake: DEFAULT_WAKE, bed: DEFAULT_BED, trainAt: null, trainDays: null, trainWeekdays: null, assumed: true }
}

/** Keep a day from outside (a request body, storage) to sane values. */
export function normaliseDay(raw: unknown): RoutineDay {
  const d = (raw && typeof raw === 'object' ? raw : {}) as Partial<Record<keyof RoutineDay, unknown>>
  const minutes = (v: unknown, fallback: number | null) =>
    typeof v === 'number' && Number.isFinite(v) ? clamp(Math.round(v), 0, 1439) : fallback
  const weekdays = Array.isArray(d.trainWeekdays)
    ? [...new Set(d.trainWeekdays.filter((n): n is number => Number.isInteger(n) && n >= 0 && n <= 6))].sort()
    : null
  return {
    wake: minutes(d.wake, DEFAULT_WAKE)!,
    bed: minutes(d.bed, DEFAULT_BED)!,
    trainAt: minutes(d.trainAt, null),
    trainDays: typeof d.trainDays === 'number' && d.trainDays >= 0 && d.trainDays <= 14 ? Math.round(d.trainDays) : null,
    trainWeekdays: weekdays && weekdays.length > 0 ? weekdays : null,
    assumed: d.assumed !== false,
  }
}

/* ── The moment ──────────────────────────────────────────────────────────── */

export function anchorOf(p: RoutineProduct): PourAnchor {
  const set = p.consumption?.anchor
  if (set) return set
  if (p.consumption?.cadence === 'per-workout') return p.stackSlots.includes('protein') || p.stackSlots.includes('recovery') ? 'post-workout' : 'pre-workout'
  if (p.consumption?.cadence === 'as-needed') return 'run-down'
  return 'morning'
}

/** Where a moment sits on their day, or null when it has no time of its own. */
export function minutesFor(anchor: PourAnchor, day: RoutineDay): number | null {
  // A day that runs past midnight is measured from waking.
  const bed = day.bed <= day.wake ? day.bed + 1440 : day.bed
  const awake = (m: number) => clamp(m, day.wake, bed)
  switch (anchor) {
    case 'morning':
      return round5(awake(day.wake + 30)) % 1440
    case 'midday':
      return round5(awake(Math.max(13 * 60, day.wake + 4 * 60))) % 1440
    case 'evening':
      return round5(awake(clamp(bed - 4 * 60, 17 * 60 + 30, 20 * 60))) % 1440
    case 'wind-down':
      return round5(awake(bed - 60)) % 1440
    case 'pre-workout':
      return day.trainAt === null ? null : round5(day.trainAt - 30 + 1440) % 1440
    case 'post-workout':
      return day.trainAt === null ? null : round5(day.trainAt + 75) % 1440
    case 'hot-days':
    case 'run-down':
      return null
  }
}

function daysFor(p: RoutineProduct, anchor: PourAnchor): RoutineDays {
  if (anchor === 'pre-workout' || anchor === 'post-workout' || p.consumption?.cadence === 'per-workout') return 'training-days'
  if (p.consumption?.cadence === 'as-needed' || anchor === 'hot-days' || anchor === 'run-down') return 'when-you-choose'
  const perWeek = p.consumption?.daysPerWeek ?? 7
  return perWeek >= 7 ? 'every-day' : 'most-days'
}

function daysLabel(days: RoutineDays, day: RoutineDay): string {
  switch (days) {
    case 'every-day':
      return ROUTINE_COPY.everyDay
    case 'most-days':
      return ROUTINE_COPY.mostDays
    case 'when-you-choose':
      return ROUTINE_COPY.whenYouChoose
    case 'training-days':
      if (day.trainWeekdays?.length) return ROUTINE_COPY.trainingWeekdays(day.trainWeekdays.map((d) => ROUTINE_COPY.weekday[d]).join(', '))
      if (day.trainDays) return ROUTINE_COPY.trainingDaysCount(day.trainDays)
      return ROUTINE_COPY.trainingDays
  }
}

/* ── The routine ─────────────────────────────────────────────────────────── */

/**
 * The box on their day. `servings` is the plan's usage per occasion (light ½,
 * standard 1, heavy 2) by product id; 1 when not set.
 */
export function routineFor(products: readonly RoutineProduct[], day: RoutineDay, servings: Record<string, number> = {}): Routine {
  const items: RoutineItem[] = products.map((p) => {
    const anchor = anchorOf(p)
    const days = daysFor(p, anchor)
    return {
      productId: p.id,
      title: shortNameOf(p),
      anchor,
      minutes: minutesFor(anchor, day),
      moment: ROUTINE_COPY.moment[anchor],
      days,
      daysLabel: daysLabel(days, day),
      amount: ROUTINE_COPY.servings(servings[p.id] ?? 1),
    }
  })

  // Timed moments in the order of their day, from waking.
  const fromWake = (m: number) => (m - day.wake + 1440) % 1440
  const timed = new Map<string, RoutineMoment>()
  for (const item of items.filter((i) => i.minutes !== null)) {
    const key = `${item.minutes}|${item.moment}`
    const moment = timed.get(key) ?? { minutes: item.minutes, label: item.moment, items: [] }
    moment.items.push(item)
    timed.set(key, moment)
  }
  const moments = [...timed.values()].sort((a, b) => fromWake(a.minutes!) - fromWake(b.minutes!))

  const training = items.filter((i) => i.minutes === null && i.days === 'training-days')
  if (training.length) moments.push({ minutes: null, label: ROUTINE_COPY.noTimeTraining, items: training })
  const choose = items.filter((i) => i.minutes === null && i.days !== 'training-days')
  if (choose.length) moments.push({ minutes: null, label: ROUTINE_COPY.noTimeChoose, items: choose })

  return { day, items, moments }
}
