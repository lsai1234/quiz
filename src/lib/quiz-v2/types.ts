import type { QuizAnswers, QuizTrack, Goal, AgeBracket, Gender, WeightBand } from '@/lib/types'
import type { DriverId, DriverWeights } from './drivers'

/**
 * The shapes the adaptive interview is built from.
 *
 * Everything here is data. The planner reads it, the renderer draws it, and the
 * projection turns the answers back into the `QuizAnswers` the recommendation
 * engine has always taken — so v2 collects *more* than v1 and never less, and
 * nothing downstream has to know which quiz it came from.
 */

/**
 * Topics exist for one reason: to stop the interview asking four questions
 * about sleep in a row because sleep happened to score well four times. The
 * planner penalises a topic it has already visited.
 */
export type Topic =
  | 'goals' | 'safety' | 'personal' | 'supps'
  | 'energy' | 'sleep' | 'stress' | 'nutrition' | 'training'
  | 'recovery' | 'immunity' | 'gut' | 'skin' | 'hormonal' | 'daily'

/**
 * Lifestyle signal tags the deterministic engine already reads as soft scoring
 * boosts. Reused verbatim from the v1 deep-dive, and for the same reason:
 * `vegan` is deliberately absent because it is a HARD exclusion gate, and a
 * dietary restriction must only ever come from an explicit answer.
 */
export type SignalTag =
  | 'poor-sleep' | 'desk-job' | 'high-stress' | 'joint-issues'
  | 'shift-work' | 'run-down'

export interface BankOption {
  id: string
  label: string
  sub?: string
  /** A `QuizIcon` name. Optional — most adaptive questions read better without. */
  icon?: string
  /** Evidence this answer gives for each driver, 0–1. */
  drivers?: DriverWeights
  /**
   * Drivers this answer rules OUT. "Nights are fine" is as informative as any
   * positive answer and the planner must stop chasing sleep after it.
   */
  clears?: DriverId[]
  /** Lifestyle tags this answer implies. */
  signals?: SignalTag[]
  /**
   * The projection onto canonical answers — how v2 feeds the engine that
   * already exists. Any field v1 collects that this answer settles is written
   * here, so the two quizzes hand the factory the same shape.
   */
  answers?: Partial<QuizAnswers>
  /**
   * "None of these" / "Starting fresh" — picking it clears every other choice,
   * and picking anything else clears it.
   *
   * It also shows as selected while nothing is picked, so a multi-select screen
   * always has a visible answer rather than a blank grid the reader has to work
   * out is a valid state. Same behaviour as v1's safety step, which is where the
   * pattern comes from.
   */
  exclusive?: boolean
}

export type SelectKind = 'single' | 'multi' | 'form'

/** One field on the compound "about you" screen. */
export type FormField =
  | { key: 'name'; kind: 'text'; label: string; placeholder: string; optional: true }
  | { key: 'ageBracket'; kind: 'choice'; label: string; options: Array<{ id: AgeBracket; label: string }> }
  | { key: 'gender'; kind: 'choice'; label: string; options: Array<{ id: Gender; label: string }> }
  | { key: 'weightBand'; kind: 'choice'; label: string; options: Array<{ id: WeightBand; label: string }>; optional: true }

export interface BankQuestion {
  id: string
  topic: Topic
  /** The eyebrow above the question. */
  section: string
  prompt: string
  hint: string
  select: SelectKind
  /**
   * `fixed` questions are asked every time, in the order they appear in the
   * bank, and are not subject to planning — the safety screen above all. They
   * spend budget like any other question.
   */
  fixed?: boolean
  /**
   * Which drivers this question can tell apart. The planner scores a question
   * by how much uncertainty it removes across these, so a question that
   * discriminates nothing is never chosen — which is the correct behaviour and
   * a useful smell.
   */
  discriminates: DriverId[]
  /** Preconditions. Absent = always eligible. */
  requires?: (s: InterviewState) => boolean
  options: BankOption[]
  /** For `multi`, how many picks before Continue lights up. Default 0. */
  minPicks?: number
  /** For `form`. */
  fields?: FormField[]
  /**
   * A line under the options. For the one screen that needs to say what it will
   * and will not do with the answer before the reader commits to it.
   */
  reassurance?: string
  /** One-line summary for the AI steer's candidate list. Never shown to a user. */
  summary: string
}

/** Everything the interview knows so far. Serialisable, and the only input the
 *  planner takes — which is what makes the planner testable and deterministic. */
export interface InterviewState {
  track: QuizTrack | null
  goals: Goal[]
  primaryGoal: Goal | null
  /** questionId → chosen option ids, in the order tapped. */
  picked: Record<string, string[]>
  /** Accumulated evidence. */
  drivers: DriverWeights
  /** Drivers explicitly ruled out. Never re-chased. */
  cleared: DriverId[]
  /** Question ids in the order they were asked. */
  asked: string[]
  /** The compound personal screen. */
  form: {
    name: string
    ageBracket: AgeBracket | null
    gender: Gender | null
    weightBand: WeightBand | null
  }
  /** Total questions this run is allowed, including the fixed ones. */
  budget: number
}

export function emptyInterview(budget: number): InterviewState {
  return {
    track: null,
    goals: [],
    primaryGoal: null,
    picked: {},
    drivers: {},
    cleared: [],
    asked: [],
    form: { name: '', ageBracket: null, gender: null, weightBand: null },
    budget,
  }
}
