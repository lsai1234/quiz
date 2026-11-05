/**
 * The training plan: a week of sessions built from their answers, in the hub.
 *
 * Every word a member reads comes from `./copy` or the library (`./library`);
 * the plan itself holds only ids and numbers. That is what lets AI build it
 * without writing anything: it picks ids and sets numbers, and a checker
 * (`./validate`) holds both to the library and the limits (`./dose`).
 */

export type Focus = 'strength' | 'muscle' | 'fitness' | 'endurance' | 'mobility' | 'allround'
export type Split = 'auto' | 'full' | 'upper-lower' | 'ppl' | 'body-part'
export type Equipment = 'gym' | 'home' | 'bodyweight'
export type Experience = 'new' | 'some' | 'experienced'
export type Minutes = 20 | 30 | 45 | 60
/** Areas to work around. The plan leaves out what loads them; it never treats them. */
export type Area = 'knees' | 'lower-back' | 'shoulders' | 'wrists' | 'hips' | 'ankles' | 'neck'
/** Monday = 0. */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6

export const FOCUSES: Focus[] = ['strength', 'muscle', 'fitness', 'endurance', 'mobility', 'allround']
export const SPLITS: Split[] = ['auto', 'full', 'upper-lower', 'ppl', 'body-part']
export const EQUIPMENT: Equipment[] = ['gym', 'home', 'bodyweight']
export const EXPERIENCES: Experience[] = ['new', 'some', 'experienced']
export const MINUTES: Minutes[] = [20, 30, 45, 60]
export const AREAS: Area[] = ['knees', 'lower-back', 'shoulders', 'wrists', 'hips', 'ankles', 'neck']
export const WEEKDAYS: Weekday[] = [0, 1, 2, 3, 4, 5, 6]

/** How an exercise moves: what the session templates are made of. */
export type Pattern =
  | 'squat'
  | 'hinge'
  | 'lunge'
  | 'glute'
  | 'calf'
  | 'push-h'
  | 'push-v'
  | 'pull-h'
  | 'pull-v'
  | 'raise'
  | 'rear'
  | 'biceps'
  | 'triceps'
  | 'core'
  | 'conditioning'
  | 'mobility'

export type Role = 'compound' | 'accessory' | 'core' | 'conditioning' | 'mobility'

export type Muscle =
  | 'chest'
  | 'back'
  | 'shoulders'
  | 'biceps'
  | 'triceps'
  | 'forearms'
  | 'core'
  | 'glutes'
  | 'quads'
  | 'hamstrings'
  | 'calves'
  | 'hips'
  | 'full-body'

/** What a set is counted in. */
export type Unit = 'reps' | 'seconds'

export interface Exercise {
  id: string
  name: string
  pattern: Pattern
  role: Role
  muscles: Muscle[]
  /** The kit levels it can be done with: bodyweight work fits every level. */
  equipment: Equipment[]
  /** What it asks for, in a few words ("Dumbbells and a bench"). */
  kit: string
  /** Areas it loads: left out for anyone working around them. */
  loads: Area[]
  /** 1 new, 2 some experience, 3 experienced. */
  level: 1 | 2 | 3
  unit: Unit
  steps: string[]
  cues: string[]
  mistakes: string[]
  tips: string[]
  /** Same movement, simpler; and the next step up. Ids in the library. */
  easier?: string
  harder?: string
}

export type ActivityKind = 'walk' | 'jog' | 'run' | 'ride' | 'swim' | 'spin' | 'hiit' | 'yoga' | 'pilates' | 'boxing' | 'sport'
export const ACTIVITY_KINDS: ActivityKind[] = ['walk', 'jog', 'run', 'ride', 'swim', 'spin', 'hiit', 'yoga', 'pilates', 'boxing', 'sport']

export type Intensity = 'easy' | 'steady' | 'hard'

export interface Activity {
  id: ActivityKind
  name: string
  /** A class, or something done on their own. */
  kind: 'class' | 'solo' | 'sport'
  loads: Area[]
  intensity: Intensity
  minutes: number
  /** How to pace it. */
  steps: string[]
  tips: string[]
}

/* ── The plan ───────────────────────────────────────────────────────────── */

/** An activity they do, on a day they choose. */
export interface ActivityChoice {
  day: Weekday
  kind: ActivityKind
  minutes: number
}

export interface TrainingPrefs {
  /** The days for training sessions (activities have their own). */
  days: Weekday[]
  minutes: Minutes
  focus: Focus
  split: Split
  equipment: Equipment
  experience: Experience
  avoid: Area[]
  activities: ActivityChoice[]
  /** When they usually train, minutes past midnight; for showing only. */
  trainAt: number | null
}

/** A session's shape: which movements it's built from. */
export type Template =
  | 'full-a'
  | 'full-b'
  | 'full-c'
  | 'upper'
  | 'lower'
  | 'push'
  | 'pull'
  | 'legs'
  | 'chest-tris'
  | 'back-bis'
  | 'shoulders-arms'
  | 'conditioning'
  | 'mobility'

export interface PlannedExercise {
  id: string
  sets: number
  /** Reps, or seconds for a timed exercise. */
  low: number
  high: number
  restSec: number
  /** Sets ticked off this week. */
  doneSets: number
}

export interface StrengthSession {
  id: string
  type: 'strength'
  day: Weekday
  template: Template
  warmup: string[]
  exercises: PlannedExercise[]
  done: boolean
}

export interface ActivitySession {
  id: string
  type: 'activity'
  day: Weekday
  activity: ActivityKind
  minutes: number
  intensity: Intensity
  /** Put in by the plan rather than chosen by them. */
  suggested: boolean
  done: boolean
}

export type Session = StrengthSession | ActivitySession

export interface ReadinessRecord {
  /** Only ever true: a "yes" is never stored, it sends them to their GP. */
  cleared: true
  at: string
}

export interface TrainingPlan {
  version: 1
  userId: string
  createdAt: string
  updatedAt: string
  /** Monday of the week the ticks belong to, YYYY-MM-DD. */
  weekOf: string
  prefs: TrainingPrefs
  sessions: Session[]
  /** Who built the training sessions last. */
  source: 'ai' | 'rules'
  /** Moves the rotation on, so a rebuild gives a different week. */
  seed: number
  /** Sessions done in weeks gone by, newest first, at most 12. */
  history: { weekOf: string; done: number; planned: number }[]
  /**
   * What they lifted, by exercise: newest first, at most `LOG_KEEP` each. Kept
   * across weeks, rebuilds and swaps, so "last time" is always there.
   */
  log?: Record<string, LogEntry[]>
}

export interface LogEntry {
  /** YYYY-MM-DD. */
  on: string
  /** Kilograms used, or null for bodyweight. */
  weightKg: number | null
  /** Reps (or seconds, for a timed exercise) in their best set. */
  reps: number | null
}
