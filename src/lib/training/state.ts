/**
 * What `/api/hub/training` answers with, for the hub's screens. Types and the
 * one request shape only: safe to import in the browser.
 */
import type { TrainingAccess } from './access'
import type { PrefsDraft } from './prefs'
import type { ActivityKind, Felt, ReadinessRecord, TrainingPlan, TrainingPrefs, WeekMode, Weekday } from './types'

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
  /** The trainer's tip on each exercise, by id (while the trainer is live). */
  tips?: Record<string, string>
  /** Uploaded videos by exercise or activity id, for the silent loop (Phase 2). */
  videos?: Record<string, string>
  /** Which coaching phases are on (Founders Hub → Training). */
  coaching?: { coaching: boolean; video: boolean; programmes: boolean }
  /** Their live calendar's address, once they've asked for one. */
  calendarUrl?: string | null
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
  | { action: 'felt'; exerciseId: string; felt: Felt }
  | { action: 'week-mode'; kind: WeekMode | null }
  | { action: 'lighter'; sessionId: string; on: boolean }
  | { action: 'calendar-link' }
  | { action: 'intro-seen' }
