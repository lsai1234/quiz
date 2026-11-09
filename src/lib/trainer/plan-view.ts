/**
 * A member's week as the Founders Hub's plan editor shows it (server-only):
 * each strength session's exercises with their numbers, what the trainer
 * changed, and the swaps that suit the member's setup.
 */
import { alternativesFor } from '@/lib/training/generate'
import { exerciseById } from '@/lib/training/library'
import type { TrainingPlan } from '@/lib/training/types'
import { sessionTitle } from '@/lib/training/view'

export interface EditablePlan {
  sessions: {
    id: string
    day: number
    title: string
    done: boolean
    changedBy: { name: string; reason: string; at: string } | null
    exercises: { id: string; name: string; sets: number; low: number; high: number; changedBy: { name: string; reason: string } | null; alternatives: { id: string; name: string }[] }[]
  }[]
}

export function editablePlan(plan: TrainingPlan): EditablePlan {
  return {
    sessions: plan.sessions.flatMap((s) =>
      s.type !== 'strength'
        ? []
        : [
            {
              id: s.id,
              day: s.day,
              title: sessionTitle(s),
              done: s.done,
              changedBy: s.changedBy ?? null,
              exercises: s.exercises.map((p) => ({
                id: p.id,
                name: exerciseById(p.id)?.name ?? p.id,
                sets: p.sets,
                low: p.low,
                high: p.high,
                changedBy: p.changedBy ? { name: p.changedBy.name, reason: p.changedBy.reason } : null,
                alternatives: alternativesFor(p.id, plan.prefs, s.exercises.map((e) => e.id))
                  .slice(0, 6)
                  .map((a) => ({ id: a.id, name: a.name })),
              })),
            },
          ],
    ),
  }
}
