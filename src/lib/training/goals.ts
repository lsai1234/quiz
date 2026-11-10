/**
 * Goals and milestones (Phase 3). Pure; safe in the browser.
 *
 * A goal they pick, with milestones that tick themselves off from what they
 * log: never a streak, never "in a row". Counts are totals. The one thing a
 * log can't know (that they ran 5 km) they tick themselves.
 *
 *   lift          a lift up to a weight they set: a quarter of the way, half,
 *                 three quarters, there
 *   pull-up       a first pull-up: a pulldown, an assisted pull-up, 8 assisted
 *                 reps, the first one
 *   run-5k        runs and jogs done (1, 5, 10), then 5 km, ticked by them
 *   three-a-week  weeks with 3 or more sessions (2, 4, 6, 8 of them)
 */
import { exerciseById } from './library'
import type { GoalKind, LogEntry, TrainingGoal, TrainingPlan } from './types'

export const GOAL_KINDS: GoalKind[] = ['lift', 'pull-up', 'run-5k', 'three-a-week']
/** Lifts a weight goal can be set on: loaded lifts in their plan. */
export const MAX_TARGET_KG = 300

export interface Milestone {
  id: string
  /** What it is, as numbers for the copy: see `goalCopy`. */
  kind: 'lift-at' | 'pulldown' | 'assisted' | 'assisted-8' | 'first-pull-up' | 'runs' | 'ran-5k' | 'weeks-3'
  /** kg for a lift, a count for runs and weeks. */
  value?: number
  done: boolean
  /** When it fell, when the log says. */
  on: string | null
  /** They tick it themselves. */
  self?: boolean
}

const round = (kg: number) => Math.round(kg * 2) / 2
const since = (es: LogEntry[] | undefined, from: string) => (es ?? []).filter((e) => e.on >= from).sort((a, b) => a.on.localeCompare(b.on))

/** The heaviest they've logged on a lift, for a goal's starting point. */
export function bestKg(plan: TrainingPlan, exerciseId: string): number | null {
  const ws = (plan.log?.[exerciseId] ?? []).map((e) => e.weightKg).filter((w): w is number => w != null)
  return ws.length ? Math.max(...ws) : null
}

/** A goal from what they chose; null when it doesn't make sense (a lift with no weight, a target below where they are). */
export function newGoal(plan: TrainingPlan, input: { kind: unknown; exerciseId?: unknown; targetKg?: unknown }, now: Date): TrainingGoal | null {
  const kind = GOAL_KINDS.find((k) => k === input.kind)
  if (!kind) return null
  const setOn = now.toISOString().slice(0, 10)
  if (kind !== 'lift') return { kind, setOn, ticked: [], doneOn: null }
  const id = typeof input.exerciseId === 'string' ? input.exerciseId : ''
  const ex = exerciseById(id)
  const target = typeof input.targetKg === 'number' ? input.targetKg : Number(input.targetKg)
  if (!ex || ex.unit !== 'reps' || !Number.isFinite(target) || target <= 0 || target > MAX_TARGET_KG) return null
  const start = bestKg(plan, id) ?? 0
  if (target <= start) return null
  return { kind, exerciseId: id, targetKg: round(target), startKg: start, setOn, ticked: [], doneOn: null }
}

export function milestones(plan: TrainingPlan, goal: TrainingGoal): Milestone[] {
  const ticked = new Set(goal.ticked ?? [])
  switch (goal.kind) {
    case 'lift': {
      const start = goal.startKg ?? 0
      const target = goal.targetKg ?? 0
      const entries = since(plan.log?.[goal.exerciseId ?? ''], goal.setOn)
      return [0.25, 0.5, 0.75, 1].map((f, i) => {
        const kg = i === 3 ? target : round(start + (target - start) * f)
        const hit = entries.find((e) => (e.weightKg ?? 0) >= kg && (e.reps ?? 0) >= 1)
        return { id: `lift-${i + 1}`, kind: 'lift-at' as const, value: kg, done: Boolean(hit), on: hit?.on ?? null }
      })
    }
    case 'pull-up': {
      const first = (ids: string[], ok: (e: LogEntry) => boolean = () => true) =>
        ids.flatMap((id) => since(plan.log?.[id], goal.setOn)).filter(ok).sort((a, b) => a.on.localeCompare(b.on))[0] ?? null
      const steps: [Milestone['kind'], LogEntry | null][] = [
        ['pulldown', first(['lat-pulldown', 'band-pulldown'])],
        ['assisted', first(['assisted-pull-up'])],
        ['assisted-8', first(['assisted-pull-up'], (e) => (e.reps ?? 0) >= 8)],
        ['first-pull-up', first(['pull-up'], (e) => (e.reps ?? 0) >= 1)],
      ]
      return steps.map(([kind, hit]) => ({ id: kind, kind, done: Boolean(hit), on: hit?.on ?? null }))
    }
    case 'run-5k': {
      const runs = (plan.activities ?? []).filter((a) => (a.kind === 'run' || a.kind === 'jog') && a.on >= goal.setOn).sort((a, b) => a.on.localeCompare(b.on))
      return [
        ...[1, 5, 10].map((n) => ({ id: `runs-${n}`, kind: 'runs' as const, value: n, done: runs.length >= n, on: runs[n - 1]?.on ?? null })),
        { id: 'ran-5k', kind: 'ran-5k' as const, done: ticked.has('ran-5k'), on: null, self: true },
      ]
    }
    case 'three-a-week': {
      const from = mondayOn(goal.setOn)
      const weeks = [
        ...plan.history.filter((h) => h.weekOf >= from).map((h) => ({ weekOf: h.weekOf, done: h.done })),
        ...(plan.weekOf >= from ? [{ weekOf: plan.weekOf, done: plan.sessions.filter((s) => s.done).length }] : []),
      ]
        .filter((w) => w.done >= 3)
        .sort((a, b) => a.weekOf.localeCompare(b.weekOf))
      return [2, 4, 6, 8].map((n) => ({ id: `weeks-${n}`, kind: 'weeks-3' as const, value: n, done: weeks.length >= n, on: weeks[n - 1]?.weekOf ?? null }))
    }
  }
}

function mondayOn(isoDate: string): string {
  const d = new Date(`${isoDate}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7))
  return d.toISOString().slice(0, 10)
}

/** After a change: the day the last milestone fell, once they all have. */
export function withGoalDone(plan: TrainingPlan, now: Date): TrainingPlan {
  if (!plan.goal || plan.goal.doneOn) return plan
  const all = milestones(plan, plan.goal)
  return all.every((m) => m.done) ? { ...plan, goal: { ...plan.goal, doneOn: now.toISOString().slice(0, 10) } } : plan
}

/** They tick a milestone the log can't know. */
export function tickMilestone(plan: TrainingPlan, id: string, now: Date): TrainingPlan {
  if (!plan.goal) return plan
  const m = milestones(plan, plan.goal).find((x) => x.id === id && x.self)
  if (!m) return plan
  return withGoalDone({ ...plan, goal: { ...plan.goal, ticked: [...new Set([...(plan.goal.ticked ?? []), id])] } }, now)
}
