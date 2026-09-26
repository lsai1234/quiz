/**
 * The training answer, and everything that counts it.
 *
 * Two ways to answer, because weeks aren't all the same:
 *
 *   days     "Same most weeks": Monday to Sunday, and each day can hold more
 *            than one thing (gym in the morning, football at night).
 *   average  "It varies": no fixed days, just about how many sessions of each
 *            kind in a typical week, averaged over the last month or so.
 *            A tracker read fills this, from several weeks at once.
 *
 * Nothing else reads the shape directly: it asks these helpers for sessions a
 * week and counts by type, so both modes mean the same thing to the engine.
 */

export type Activity = 'gym' | 'cardio' | 'sport'

export const ACTIVITIES: Activity[] = ['gym', 'cardio', 'sport']

export interface TrainingAnswer {
  mode: 'days' | 'average'
  /** Monday first, seven entries; an empty day is a rest day. Used in `days` mode. */
  days: Activity[][]
  /** Sessions in a typical week, by kind. Used in `average` mode. */
  average: Record<Activity, number>
}

export const REST_DAYS: Activity[][] = Array.from({ length: 7 }, () => [])
export const NO_SESSIONS: Record<Activity, number> = { gym: 0, cardio: 0, sport: 0 }

/** A "same most weeks" answer from one activity (or rest) a day — the old shape, and handy in tests. */
export function trainingDays(week: (Activity | 'rest')[]): TrainingAnswer {
  return { mode: 'days', days: week.map((d) => (d === 'rest' ? [] : [d])), average: { ...NO_SESSIONS } }
}

/** An "it varies" answer. */
export function trainingAverage(average: Partial<Record<Activity, number>>): TrainingAnswer {
  return { mode: 'average', days: REST_DAYS.map(() => []), average: { ...NO_SESSIONS, ...average } }
}

/** Sessions of each kind in a typical week. */
export function countsByType(t: TrainingAnswer | null): Record<Activity, number> {
  if (!t) return { ...NO_SESSIONS }
  if (t.mode === 'average') return { ...NO_SESSIONS, ...t.average }
  const out = { ...NO_SESSIONS }
  for (const day of t.days) for (const a of day) out[a] += 1
  return out
}

/** Sessions in a typical week, all kinds together. */
export function sessionsPerWeek(t: TrainingAnswer | null): number {
  const c = countsByType(t)
  return c.gym + c.cardio + c.sport
}

/** Days with any training on them: exact for `days`, estimated for `average`. */
export function activeDays(t: TrainingAnswer | null): number {
  if (!t) return 0
  if (t.mode === 'days') return t.days.filter((d) => d.length > 0).length
  return Math.min(7, Math.round(sessionsPerWeek(t)))
}

/** Answered, and nothing in it. */
export function isRestWeek(t: TrainingAnswer | null): boolean {
  return t !== null && sessionsPerWeek(t) === 0
}

/** A number of sessions as people say it: "3", "2.5", "about 4". */
export function sessionsLabel(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1).replace(/\.0$/, '')
}
