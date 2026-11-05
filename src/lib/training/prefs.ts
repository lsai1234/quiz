/**
 * The setup: checked when it arrives from a browser (`normalisePrefs`), and
 * filled in from what we already know (`prefillPrefs`): the training answers
 * from the quiz or the consult, carried on the order or plan as the guide
 * seed. Pure.
 */
import type { TrainingExperience, Goal } from '@/lib/types'
import type { TrainingSeed } from './seed'

export { normaliseTrainingSeed, type TrainingSeed } from './seed'
import type { RoutineDay } from '@/lib/routine'
import {
  ACTIVITY_KINDS,
  AREAS,
  EQUIPMENT,
  EXPERIENCES,
  FOCUSES,
  MINUTES,
  SPLITS,
  type ActivityChoice,
  type ActivityKind,
  type Equipment,
  type Experience,
  type Focus,
  type Minutes,
  type TrainingPrefs,
  type Weekday,
} from './types'
import { ACTIVITIES } from './library'

const oneOf = <T extends string | number>(list: readonly T[], v: unknown): T | null => (list.includes(v as T) ? (v as T) : null)

function weekdays(raw: unknown): Weekday[] {
  if (!Array.isArray(raw)) return []
  return [...new Set(raw.filter((n): n is Weekday => Number.isInteger(n) && n >= 0 && n <= 6))].sort((a, b) => a - b)
}

function activities(raw: unknown): ActivityChoice[] {
  if (!Array.isArray(raw)) return []
  const out: ActivityChoice[] = []
  for (const a of raw.slice(0, 10)) {
    if (!a || typeof a !== 'object') continue
    const r = a as Record<string, unknown>
    const kind = oneOf(ACTIVITY_KINDS, r.kind)
    const day = Number.isInteger(r.day) && (r.day as number) >= 0 && (r.day as number) <= 6 ? (r.day as Weekday) : null
    if (!kind || day === null) continue
    const minutes = typeof r.minutes === 'number' && Number.isFinite(r.minutes) ? Math.round(Math.min(180, Math.max(10, r.minutes)) / 5) * 5 : ACTIVITIES[kind].minutes
    if (out.some((o) => o.day === day && o.kind === kind)) continue
    out.push({ day, kind, minutes })
  }
  return out.sort((a, b) => a.day - b.day)
}

/** A setup from outside, made safe; null when it can't make a plan. */
export function normalisePrefs(raw: unknown): TrainingPrefs | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const minutes = oneOf(MINUTES, r.minutes)
  const focus = oneOf(FOCUSES, r.focus)
  const split = oneOf(SPLITS, r.split) ?? 'auto'
  const equipment = oneOf(EQUIPMENT, r.equipment)
  const experience = oneOf(EXPERIENCES, r.experience)
  if (!minutes || !focus || !equipment || !experience) return null
  const prefs: TrainingPrefs = {
    days: weekdays(r.days),
    minutes,
    focus,
    split,
    equipment,
    experience,
    avoid: Array.isArray(r.avoid) ? AREAS.filter((a) => (r.avoid as unknown[]).includes(a)) : [],
    activities: activities(r.activities),
    trainAt: typeof r.trainAt === 'number' && r.trainAt >= 0 && r.trainAt < 1440 ? Math.round(r.trainAt) : null,
  }
  if (prefs.days.length === 0 && prefs.activities.length === 0) return null
  return prefs
}

/** A setup with gaps: the ones we couldn't fill are for them to choose. */
export type PrefsDraft = Omit<TrainingPrefs, 'equipment' | 'experience' | 'focus'> & {
  focus: Focus
  equipment: Equipment | null
  experience: Experience | null
}

/** Spread a number of sessions over the week, a day apart where possible. */
export const SPREAD: Record<number, Weekday[]> = {
  1: [2],
  2: [0, 3],
  3: [0, 2, 4],
  4: [0, 1, 3, 4],
  5: [0, 1, 2, 4, 5],
  6: [0, 1, 2, 3, 4, 5],
  7: [0, 1, 2, 3, 4, 5, 6],
}

function focusFrom(seed: TrainingSeed | null, goals: readonly Goal[]): Focus {
  switch (seed?.focus) {
    case 'hypertrophy':
      return 'muscle'
    case 'powerlifting':
      return 'strength'
    case 'general':
      return 'allround'
    case 'football':
    case 'rugby':
    case 'basketball':
    case 'other':
      return 'fitness'
  }
  if (goals.includes('muscle') || goals.includes('bulking')) return 'muscle'
  if (goals.includes('cutting')) return 'fitness'
  const types = seed?.types ?? []
  if (types.length > 0 && types.every((t) => t === 'cardio')) return 'endurance'
  if (types.includes('hiit')) return 'fitness'
  if (goals.includes('performance')) return 'strength'
  return 'allround'
}

const EXPERIENCE_OF: Record<TrainingExperience, Experience> = { new: 'new', intermediate: 'some', experienced: 'experienced' }

/**
 * A first setup from their day (when and how often they train), their goals
 * and their training answers. Experience and kit are left for them when the
 * answers don't say.
 */
export function prefillPrefs(input: { day: RoutineDay | null; goals: readonly Goal[]; training: TrainingSeed | null }): PrefsDraft {
  const { day, goals, training } = input
  const types = training?.types ?? []
  const lifts = types.length === 0 || types.includes('strength') || types.includes('mixed')
  const cardio = types.includes('cardio')
  const sport = types.includes('sport')

  // Their usual training days, or their usual number spread over the week.
  const count = Math.min(7, Math.max(1, day?.trainWeekdays?.length ?? day?.trainDays ?? 3))
  const all: Weekday[] = (day?.trainWeekdays?.length ? (day.trainWeekdays as Weekday[]) : SPREAD[count]) ?? SPREAD[3]

  // Some of those days are for what they already do: a run, a match.
  const extra: ActivityKind[] = []
  if (sport) extra.push('sport')
  if (cardio) extra.push('jog')
  let days = [...all]
  const acts: ActivityChoice[] = []
  if (!lifts) {
    // No lifting: two short sessions, and their activities on the rest.
    const strengthDays = days.slice(0, Math.min(2, days.length))
    const rest = days.filter((d) => !strengthDays.includes(d))
    rest.forEach((d, i) => {
      const kind = extra[i % Math.max(1, extra.length)] ?? 'jog'
      acts.push({ day: d, kind, minutes: ACTIVITIES[kind].minutes })
    })
    days = strengthDays
  } else if (extra.length && days.length >= 4) {
    const take = Math.min(extra.length, days.length - 3)
    const moved = days.slice(-take)
    moved.forEach((d, i) => acts.push({ day: d, kind: extra[i], minutes: ACTIVITIES[extra[i]].minutes }))
    days = days.filter((d) => !moved.includes(d))
  }

  return {
    days,
    minutes: 45 as Minutes,
    focus: focusFrom(training, goals),
    split: 'auto',
    equipment: lifts && types.length > 0 ? 'gym' : null,
    experience: training?.experience ? EXPERIENCE_OF[training.experience] : null,
    avoid: [],
    activities: acts.sort((a, b) => a.day - b.day),
    trainAt: day?.trainAt ?? null,
  }
}
