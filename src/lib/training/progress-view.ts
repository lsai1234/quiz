/**
 * The progress page's figures (Phase 3). Pure; safe in the browser.
 *
 * This month against last (sessions done, personal bests), every personal
 * best with its date, a line per lift over time, and the muscles this week's
 * ticked sets worked. All from what they logged and ticked; no streaks, and
 * nothing said about a month with nothing in it beyond the number.
 */
import { exerciseById } from './library'
import { bestBefore, isPersonalBest } from './progress'
import type { LogEntry, Muscle, TrainingPlan } from './types'

export interface LiftLine {
  exerciseId: string
  name: string
  /** Kilograms where they lifted a weight, else reps (or seconds). */
  unit: 'kg' | 'reps' | 'seconds'
  points: { on: string; value: number }[]
  best: LogEntry
}

export interface ProgressView {
  thisMonth: { sessions: number; bests: number }
  lastMonth: { sessions: number; bests: number }
  /** Each lift's best so far, with the day it was set, newest first. */
  bests: { exerciseId: string; name: string; entry: LogEntry }[]
  lifts: LiftLine[]
  /** Sets ticked this week, by muscle. */
  worked: Partial<Record<Muscle, number>>
}

const month = (iso: string) => iso.slice(0, 7)

export function progressView(plan: TrainingPlan, now: Date): ProgressView {
  const thisM = month(now.toISOString())
  const last = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 15))
  const lastM = month(last.toISOString())

  // Sessions, by the month each week starts in.
  const weeks = [{ weekOf: plan.weekOf, done: plan.sessions.filter((s) => s.done).length }, ...plan.history]
  const sessionsIn = (m: string) => weeks.filter((w) => month(w.weekOf) === m).reduce((n, w) => n + w.done, 0)

  const bests: ProgressView['bests'] = []
  // Every time a lift beat all before it, for the month counts.
  const events: LogEntry[] = []
  const lifts: LiftLine[] = []
  for (const [id, entries] of Object.entries(plan.log ?? {})) {
    const ex = exerciseById(id)
    if (!ex || !entries.length) continue
    for (const e of entries) if (isPersonalBest(e, bestBefore(plan, id, e.on))) events.push(e)
    const weighted = entries.some((e) => e.weightKg != null)
    const points = [...entries]
      .sort((a, b) => a.on.localeCompare(b.on))
      .map((e) => ({ on: e.on, value: weighted ? (e.weightKg ?? 0) : (e.reps ?? 0) }))
      .filter((p) => p.value > 0)
    const best = entries.reduce((a, b) => (isPersonalBest(b, a) ? b : a))
    bests.push({ exerciseId: id, name: ex.name, entry: best })
    if (points.length) lifts.push({ exerciseId: id, name: ex.name, unit: weighted ? 'kg' : ex.unit === 'seconds' ? 'seconds' : 'reps', points, best })
  }
  bests.sort((a, b) => b.entry.on.localeCompare(a.entry.on))
  // Most logged first: the lifts they do most tell the clearest story.
  lifts.sort((a, b) => b.points.length - a.points.length || a.name.localeCompare(b.name))

  const worked: ProgressView['worked'] = {}
  for (const s of plan.sessions) {
    if (s.type !== 'strength') continue
    for (const p of s.exercises) {
      if (!p.doneSets) continue
      for (const m of exerciseById(p.id)?.muscles ?? []) worked[m] = (worked[m] ?? 0) + p.doneSets
    }
  }

  return {
    thisMonth: { sessions: sessionsIn(thisM), bests: events.filter((e) => month(e.on) === thisM).length },
    lastMonth: { sessions: sessionsIn(lastM), bests: events.filter((e) => month(e.on) === lastM).length },
    bests,
    lifts,
    worked,
  }
}
