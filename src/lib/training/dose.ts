/**
 * Sets, reps and rest: what a focus asks of each kind of exercise, the limits
 * a plan has to stay inside (whoever built it), and how long a session takes.
 * Pure.
 */
import type { Exercise, Experience, Focus, PlannedExercise, Role } from './types'

export interface Dose {
  sets: number
  low: number
  high: number
  restSec: number
}

type Table = Record<Focus, Dose>

const COMPOUND: Table = {
  strength: { sets: 4, low: 3, high: 6, restSec: 150 },
  muscle: { sets: 4, low: 6, high: 10, restSec: 105 },
  allround: { sets: 3, low: 6, high: 10, restSec: 90 },
  fitness: { sets: 3, low: 10, high: 12, restSec: 60 },
  endurance: { sets: 3, low: 12, high: 15, restSec: 45 },
  mobility: { sets: 2, low: 8, high: 10, restSec: 60 },
}
const ACCESSORY: Table = {
  strength: { sets: 3, low: 6, high: 10, restSec: 90 },
  muscle: { sets: 3, low: 10, high: 15, restSec: 60 },
  allround: { sets: 3, low: 10, high: 12, restSec: 60 },
  fitness: { sets: 3, low: 12, high: 15, restSec: 45 },
  endurance: { sets: 2, low: 15, high: 20, restSec: 30 },
  mobility: { sets: 2, low: 10, high: 12, restSec: 45 },
}
const CORE_REPS: Dose = { sets: 3, low: 8, high: 12, restSec: 45 }
const CORE_HOLD: Dose = { sets: 3, low: 20, high: 40, restSec: 45 }
const CONDITIONING: Partial<Table> & { default: Dose } = {
  fitness: { sets: 4, low: 30, high: 40, restSec: 20 },
  endurance: { sets: 3, low: 40, high: 60, restSec: 20 },
  default: { sets: 3, low: 30, high: 40, restSec: 30 },
}
const MOBILITY_HOLD: Dose = { sets: 2, low: 30, high: 45, restSec: 15 }
const MOBILITY_REPS: Dose = { sets: 2, low: 6, high: 10, restSec: 15 }

/** What this exercise gets on this focus, for this person. */
export function doseFor(ex: Pick<Exercise, 'role' | 'unit'>, focus: Focus, experience: Experience): Dose {
  let d: Dose
  switch (ex.role) {
    case 'compound':
      d = { ...COMPOUND[focus] }
      if (experience === 'new' && focus === 'strength') d = { ...d, low: 5, high: 8, restSec: 120 }
      break
    case 'accessory':
      d = { ...ACCESSORY[focus] }
      break
    case 'core':
      d = { ...(ex.unit === 'seconds' ? CORE_HOLD : CORE_REPS) }
      if (focus === 'endurance' && ex.unit === 'reps') d = { ...d, low: 12, high: 15, restSec: 30 }
      if (experience === 'new' && ex.unit === 'seconds') d = { ...d, low: 20, high: 30 }
      break
    case 'conditioning':
      d = { ...(CONDITIONING[focus] ?? CONDITIONING.default) }
      if (experience === 'new') d = { ...d, low: 20, high: 30, restSec: Math.max(d.restSec, 30) }
      break
    case 'mobility':
      return { ...(ex.unit === 'seconds' ? MOBILITY_HOLD : MOBILITY_REPS) }
  }
  // Seconds-counted work outside core and conditioning (a wall sit, a carry).
  if (ex.unit === 'seconds' && ex.role !== 'core' && ex.role !== 'conditioning') d = { ...d, low: 20, high: 40 }
  if (experience === 'new') d.sets = Math.max(2, d.sets - 1)
  if (experience === 'experienced' && ex.role === 'compound' && (focus === 'strength' || focus === 'muscle')) d.sets = Math.min(5, d.sets + 1)
  return d
}

/**
 * The bounds any plan must keep to, AI-built or not: the checker
 * (`./validate`) rejects anything outside them.
 */
export const LIMITS = {
  sets: { min: 1, max: 6 },
  /** Reps per set, by focus. */
  reps: {
    strength: { min: 2, max: 12 },
    muscle: { min: 5, max: 20 },
    allround: { min: 5, max: 20 },
    fitness: { min: 6, max: 20 },
    endurance: { min: 8, max: 25 },
    mobility: { min: 4, max: 15 },
  } satisfies Record<Focus, { min: number; max: number }>,
  /** Seconds per set, for anything timed. */
  seconds: { min: 10, max: 90 },
  rest: { min: 10, max: 240 },
  /** The gap between the low and high end of a range. */
  spread: 8,
}

export function withinLimits(ex: Pick<Exercise, 'role' | 'unit'>, d: Dose, focus: Focus): boolean {
  if (!Number.isInteger(d.sets) || d.sets < LIMITS.sets.min || d.sets > LIMITS.sets.max) return false
  const range = ex.unit === 'seconds' ? LIMITS.seconds : LIMITS.reps[focus]
  if (!Number.isInteger(d.low) || !Number.isInteger(d.high)) return false
  if (d.low < range.min || d.high > range.max || d.low > d.high) return false
  if (ex.unit === 'reps' && d.high - d.low > LIMITS.spread) return false
  if (!Number.isInteger(d.restSec) || d.restSec < LIMITS.rest.min || d.restSec > LIMITS.rest.max) return false
  return true
}

/** The warm-up, before the first exercise. */
export const WARMUP_MINUTES = 5
const SECONDS_PER_REP = 3.5
const CHANGEOVER_SEC = 60

/** Seconds one exercise takes: every set and the rest after it, and moving on. */
export function exerciseSeconds(ex: Pick<Exercise, 'unit'>, d: Pick<PlannedExercise, 'sets' | 'low' | 'high' | 'restSec'>): number {
  const work = ex.unit === 'seconds' ? (d.low + d.high) / 2 : ((d.low + d.high) / 2) * SECONDS_PER_REP
  return d.sets * (work + d.restSec) + CHANGEOVER_SEC
}

/** Minutes for a whole session, to the nearest 5. */
export function roundMinutes(seconds: number): number {
  return Math.max(5, Math.round(seconds / 60 / 5) * 5)
}

/** Roles in the order a session should run them. */
export const ROLE_ORDER: Role[] = ['compound', 'accessory', 'conditioning', 'core', 'mobility']
