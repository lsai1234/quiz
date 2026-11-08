/**
 * What `/api/hub/training` answers with, for the hub's screens. Types and the
 * one request shape only: safe to import in the browser.
 */
import type { TrainingAccess } from './access'
import type { PrefsDraft } from './prefs'
import type { ActivityKind, ReadinessRecord, TrainingPlan, TrainingPrefs, Weekday } from './types'

import type { PublicTrainer } from '@/lib/trainer/types'

export interface TrainingState {
  access: TrainingAccess
  readiness: ReadinessRecord | null
  /** This week's plan, or null before the first one. */
  plan: TrainingPlan | null
  /** The first setup, filled in from their answers; only before the first plan. */
  draft: PrefsDraft | null
  /** Tutorial links by exercise or activity id. */
  tutorials: Record<string, string>
  /** Ask your trainer, while it's live: who checks the plan and answers questions. */
  trainer: PublicTrainer | null
}

export type TrainingAction =
  | { action: 'ready' }
  | { action: 'build'; prefs: TrainingPrefs }
  | { action: 'prefs'; patch: Partial<Omit<TrainingPrefs, 'activities'>> }
  | { action: 'add-activity'; day: Weekday; kind: ActivityKind; minutes: number }
  | { action: 'remove'; sessionId: string }
  | { action: 'move'; sessionId: string; day: Weekday }
  | { action: 'swap'; sessionId: string; from: string; to: string }
  | { action: 'rebuild-day'; sessionId: string }
  | { action: 'rebuild-week' }
  | { action: 'done'; sessionId: string; done: boolean }
  | { action: 'sets'; sessionId: string; exerciseId: string; doneSets: number }
  | { action: 'log'; exerciseId: string; weightKg: number | null; reps: number | null }
  | { action: 'reset' }
