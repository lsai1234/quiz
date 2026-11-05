/**
 * The training answers the guide seed carries from the quiz or consult to the
 * training plan's first setup: how they train, never anything about their
 * health. Its own file so the guide can check it without the exercise library.
 */
import type { TrainingExperience, TrainingType } from '@/lib/types'

/** What the quiz or consult told us about their training (on the guide seed). */
export interface TrainingSeed {
  types: TrainingType[]
  experience: TrainingExperience | null
  /** The quiz's own focus answer (hypertrophy, powerlifting, a sport…). */
  focus: string | null
}

/** The guide seed's training part, checked. */
export function normaliseTrainingSeed(raw: unknown): TrainingSeed | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const TYPES: TrainingType[] = ['strength', 'cardio', 'hiit', 'sport', 'mixed']
  const EXP: TrainingExperience[] = ['new', 'intermediate', 'experienced']
  const FOCUS = ['hypertrophy', 'powerlifting', 'general', 'football', 'rugby', 'basketball', 'other']
  const types = Array.isArray(r.types) ? TYPES.filter((t) => (r.types as unknown[]).includes(t)) : []
  const experience = EXP.includes(r.experience as TrainingExperience) ? (r.experience as TrainingExperience) : null
  const focus = typeof r.focus === 'string' && FOCUS.includes(r.focus) ? r.focus : null
  if (!types.length && !experience && !focus) return null
  return { types, experience, focus }
}
