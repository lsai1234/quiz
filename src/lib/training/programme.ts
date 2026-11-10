/**
 * Programmes (Phase 3): an 8- or 12-week block on top of the week they have.
 * Pure; safe in the browser.
 *
 *   8 weeks    foundation 1–3 · lighter 4 · build 5–7 · test 8
 *   12 weeks   foundation 1–3 · lighter 4 · build 5–7 · lighter 8 · build 9–11 · test 12
 *
 * The sessions stay theirs and stay changeable. A lighter week is the "not
 * feeling it" version of every session (a set fewer, the low end of the
 * range), put back the Monday after. The test week asks for one best set on
 * each session's first lift, to set against week 1. Progression itself is
 * what it always was: how it felt and what they logged (`./progress`).
 */
import type { Programme, TrainingPlan } from './types'

export type WeekKind = 'foundation' | 'build' | 'lighter' | 'test'
export const PROGRAMME_WEEKS = [8, 12] as const

const DAY = 86_400_000

/** Week n of w: what kind of week it is. */
export function weekKind(n: number, weeks: Programme['weeks']): WeekKind {
  if (n >= weeks) return 'test'
  if (n % 4 === 0) return 'lighter'
  return n < 4 ? 'foundation' : 'build'
}

/** Which week of the programme a Monday falls in (1-based), or null outside it. */
export function programmeWeek(p: Pick<Programme, 'weeks' | 'startedOn'>, monday: string): number | null {
  const n = Math.round((Date.parse(`${monday}T12:00:00Z`) - Date.parse(`${p.startedOn}T12:00:00Z`)) / (7 * DAY)) + 1
  return n >= 1 && n <= p.weeks ? n : null
}

/** The Monday of week n. */
export function weekStarts(p: Pick<Programme, 'startedOn'>, n: number): string {
  return new Date(Date.parse(`${p.startedOn}T12:00:00Z`) + (n - 1) * 7 * DAY).toISOString().slice(0, 10)
}

export interface ProgrammeStatus {
  weeks: Programme['weeks']
  /** This week's number, or null once it's over. */
  week: number | null
  kind: WeekKind | null
  /** Every week, with its kind, for the strip. */
  strip: { n: number; kind: WeekKind; now: boolean; past: boolean }[]
  /** Past the last week and not yet closed. */
  finished: boolean
}

export function programmeStatus(p: Programme, monday: string): ProgrammeStatus {
  const week = programmeWeek(p, monday)
  const finished = week === null && monday > weekStarts(p, p.weeks)
  return {
    weeks: p.weeks,
    week,
    kind: week ? weekKind(week, p.weeks) : null,
    strip: Array.from({ length: p.weeks }, (_, i) => ({ n: i + 1, kind: weekKind(i + 1, p.weeks), now: week === i + 1, past: week ? i + 1 < week : finished })),
    finished,
  }
}

/**
 * Starts this week as week 1. Rolling into a lighter week makes every
 * session lighter (`applyProgrammeWeek`); nothing else about the week moves.
 */
export function startProgramme(plan: TrainingPlan, weeks: Programme['weeks'], monday: string): TrainingPlan {
  return { ...plan, programme: { weeks, startedOn: monday, endedOn: null } }
}

/** For a lighter week: each strength session as its lighter version, its full one kept to go back to. */
export function applyProgrammeWeek(plan: TrainingPlan): TrainingPlan {
  const p = plan.programme
  if (!p || p.endedOn) return plan
  const n = programmeWeek(p, plan.weekOf)
  if (!n || weekKind(n, p.weeks) !== 'lighter') return plan
  return {
    ...plan,
    sessions: plan.sessions.map((s) => {
      if (s.type !== 'strength' || s.lighter) return s
      const exercises = s.exercises.map((x) => {
        const sets = Math.max(1, x.sets - 1)
        return { ...x, sets, high: x.low, doneSets: Math.min(x.doneSets, sets) }
      })
      return { ...s, exercises, lighter: { exercises: s.exercises } }
    }),
  }
}

/**
 * Week 1 against the test week, lift by lift: the best set logged in each.
 * Only lifts logged in both; nothing made up for the rest.
 */
export function testComparison(plan: TrainingPlan): { exerciseId: string; first: { weightKg: number | null; reps: number | null }; test: { weightKg: number | null; reps: number | null }; up: boolean }[] {
  const p = plan.programme
  if (!p) return []
  const w1 = [weekStarts(p, 1), weekStarts(p, 2)]
  const wt = [weekStarts(p, p.weeks), weekStarts(p, p.weeks + 1)]
  const score = (e: { weightKg: number | null; reps: number | null }) => (e.weightKg ?? 0) * 1000 + (e.reps ?? 0)
  const best = <T extends { on: string; weightKg: number | null; reps: number | null }>(es: T[], [from, to]: string[]) =>
    es.filter((e) => e.on >= from && e.on < to).reduce<T | null>((a, b) => (!a || score(b) > score(a) ? b : a), null)
  const out = []
  for (const [id, entries] of Object.entries(plan.log ?? {})) {
    const a = best(entries, w1)
    const b = best(entries, wt)
    if (a && b) out.push({ exerciseId: id, first: { weightKg: a.weightKg, reps: a.reps }, test: { weightKg: b.weightKg, reps: b.reps }, up: score(b) > score(a) })
  }
  return out
}
