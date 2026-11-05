/**
 * Logging what they lifted, and the next step: "Last time: 20 kg × 10 · Next
 * time, try 22.5 kg". The usual rule of thumb, kept simple and stated as a
 * suggestion: when the top of the range was reached, add a little weight (or a
 * rep, or a few seconds, or the harder version); otherwise aim for the same
 * again. Pure.
 */
import { exerciseById } from './library'
import type { LogEntry, PlannedExercise, TrainingPlan } from './types'

export const LOG_KEEP = 12
export const MAX_WEIGHT_KG = 500
export const MAX_REPS = 200

/** A logged set from outside, made safe; null when there's nothing to keep. */
export function normaliseLog(raw: { weightKg?: unknown; reps?: unknown }): { weightKg: number | null; reps: number | null } | null {
  const num = (v: unknown, max: number, step: number) =>
    typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= max ? Math.round(v / step) * step : null
  const weightKg = num(raw.weightKg, MAX_WEIGHT_KG, 0.25)
  const reps = num(raw.reps, MAX_REPS, 1)
  if (weightKg === null && (reps === null || reps === 0)) return null
  return { weightKg: weightKg === 0 ? null : weightKg, reps: reps === 0 ? null : reps }
}

/** Keep today's entry (replacing an earlier one from today), newest first. */
export function withLog(plan: TrainingPlan, exerciseId: string, entry: LogEntry): TrainingPlan {
  const log = { ...(plan.log ?? {}) }
  const had = (log[exerciseId] ?? []).filter((e) => e.on !== entry.on)
  log[exerciseId] = [entry, ...had].slice(0, LOG_KEEP)
  return { ...plan, log }
}

/** The last time they logged it, before today. */
export function lastTime(plan: TrainingPlan, exerciseId: string, today: string): LogEntry | null {
  return (plan.log?.[exerciseId] ?? []).find((e) => e.on < today) ?? null
}

export function todays(plan: TrainingPlan, exerciseId: string, today: string): LogEntry | null {
  return (plan.log?.[exerciseId] ?? []).find((e) => e.on === today) ?? null
}

export type NextStep =
  | { kind: 'weight'; kg: number }
  | { kind: 'reps'; reps: number }
  | { kind: 'seconds'; seconds: number }
  | { kind: 'harder'; id: string; name: string }
  | { kind: 'same' }

/** Round to the plates people actually have. */
const toPlate = (kg: number) => Math.round(kg * 2) / 2

/** What to aim for next time, from what they did last time. */
export function nextStep(planned: Pick<PlannedExercise, 'id' | 'high'>, last: LogEntry | null): NextStep | null {
  if (!last) return null
  const ex = exerciseById(planned.id)
  if (!ex) return null
  const reached = last.reps !== null && last.reps >= planned.high
  if (!reached) return { kind: 'same' }
  if (ex.unit === 'seconds') return { kind: 'seconds', seconds: (last.reps ?? planned.high) + 5 }
  if (last.weightKg !== null && last.weightKg > 0) {
    const step = last.weightKg >= 20 ? 2.5 : 1
    return { kind: 'weight', kg: toPlate(last.weightKg + step) }
  }
  const harder = ex.harder ? exerciseById(ex.harder) : undefined
  if (harder && (last.reps ?? 0) >= planned.high + 3) return { kind: 'harder', id: harder.id, name: harder.name }
  return { kind: 'reps', reps: (last.reps ?? planned.high) + 1 }
}
