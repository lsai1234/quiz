/**
 * The protein check in the consult (Amp Consult and offer plan, Phase 5
 * proposal 2, approved 2026-10-28): v2's module (`docs/QUIZ_V2_PROTEIN.md`)
 * on one scene in the Fuel section, Deep and Pinpoint only.
 *
 * The sums are v2's (`lib/quiz-v2/protein.ts`): the target as a range from a
 * weight band, training and age; the estimate from one of three doors (just
 * ask me, pick a day, count it); the verdict against the floor of the range.
 * What is the consult's own is how it reads its answers, and its words.
 *
 * What it feeds, as proposed:
 *   Pinpoint   a measured gap of 25g or more nudges protein-gap strongly
 *              towards; a met target nudges it away clearly; "just ask me"
 *              nudges nothing. A measurement outweighs the plate's guess.
 *   Engine     the protein need gets the gap as its source, an answer restated.
 *   Try this   the protein-breakfast fix uses their gap, capped at 40g.
 *
 * Privacy: weight is asked here, as a band, optionally. It stays on the device
 * and in the handoff like every other answer, and it is never sent to the AI
 * (not on `copyAnswersFor`'s list; the evidence line is marked `local`).
 *
 * The scripted words below are in the review pack. They say what the numbers
 * are and never what they mean for anyone's health, and never mention a
 * product: the gap is a number, not a shake.
 */

import type { AgeBracket, WeightBand } from '@/lib/types'
import { applyPortions, proteinGap, proteinTarget, proteinVerdict, type PortionSize, type ProteinTarget, type TargetBasis, type Verdict } from '@/lib/quiz-v2/protein'
import { countsByType, sessionsPerWeek } from './training'
import type { AgeBand, ConsultAnswers } from './types'

export type ProteinDoor = 'ask' | 'day' | 'count'
export type Meal = 'breakfast' | 'lunch' | 'dinner' | 'snacks'
export const MEALS: readonly Meal[] = ['breakfast', 'lunch', 'dinner', 'snacks']

export interface ProteinAnswer {
  /** Optional: without it there is no target, so no number to compare. */
  weight: WeightBand | null
  door: ProteinDoor
  /** A day: the one preset. Counted: one option per meal. */
  picks: string[]
  portions: PortionSize
}

export interface ProteinOption {
  id: string
  label: string
  sub?: string
  grams: number
  meal?: Meal
}

/**
 * The options and their grams, as v2's bank declares them (`protein-check` in
 * `lib/quiz-v2/bank/nutrition.ts`). Copied rather than imported so the
 * consult's first scene doesn't carry v2's question bank; a test holds the two
 * to the same grams.
 */
export const DAY_OPTIONS: readonly ProteinOption[] = [
  { id: 'day-light', label: 'Not much until dinner', sub: 'Then a proper meal', grams: 55 },
  { id: 'day-normal', label: 'Three normal meals', sub: 'Nothing planned around protein', grams: 75 },
  { id: 'day-decent', label: 'Protein at two meals a day', sub: 'Eggs or yoghurt, then meat or fish', grams: 105 },
  { id: 'day-high', label: 'Protein at every meal', sub: 'And I snack on it too', grams: 145 },
]

export const MEAL_OPTIONS: readonly ProteinOption[] = [
  { id: 'b-none', meal: 'breakfast', label: 'Nothing', grams: 0 },
  { id: 'b-carbs', meal: 'breakfast', label: 'Toast, cereal or fruit', grams: 8 },
  { id: 'b-protein', meal: 'breakfast', label: 'Eggs, yoghurt or similar', grams: 25 },
  { id: 'b-shake', meal: 'breakfast', label: 'A shake', grams: 25 },
  { id: 'l-none', meal: 'lunch', label: 'I skip it', grams: 0 },
  { id: 'l-light', meal: 'lunch', label: 'Sandwich, wrap or salad', grams: 20 },
  { id: 'l-protein', meal: 'lunch', label: 'Chicken, fish or similar', grams: 35 },
  { id: 'l-big', meal: 'lunch', label: 'A big portion', grams: 55 },
  { id: 'd-light', meal: 'dinner', label: 'Light or snacky', grams: 10 },
  { id: 'd-normal', meal: 'dinner', label: 'A normal portion', grams: 25 },
  { id: 'd-protein', meal: 'dinner', label: 'Meat or fish, decent size', grams: 40 },
  { id: 'd-big', meal: 'dinner', label: 'A big portion', grams: 65 },
  { id: 's-none', meal: 'snacks', label: 'None to speak of', grams: 0 },
  { id: 's-light', meal: 'snacks', label: 'Nuts, cheese or yoghurt', grams: 10 },
  { id: 's-one', meal: 'snacks', label: 'A shake or a protein bar', grams: 22 },
  { id: 's-many', meal: 'snacks', label: 'Two or more of those', grams: 50 },
]

const OPTION_BY_ID = new Map([...DAY_OPTIONS, ...MEAL_OPTIONS].map((o) => [o.id, o]))

/* ── Reading the answer ─────────────────────────────────────────────────── */

/** The meals a counted day has answered, in order. */
export function mealsDone(p: ProteinAnswer | null): Meal[] {
  if (!p || p.door !== 'count') return []
  return MEALS.filter((m) => p.picks.some((id) => OPTION_BY_ID.get(id)?.meal === m))
}

/** Enough to move on: "just ask me", a day, or all four meals. */
export function proteinAnswered(p: ProteinAnswer | null): boolean {
  if (!p) return false
  if (p.door === 'ask') return true
  if (p.door === 'day') return p.picks.some((id) => DAY_OPTIONS.some((o) => o.id === id))
  return mealsDone(p).length === MEALS.length
}

/** What they eat, roughly: null for "just ask me" and for a part-counted day. */
export function proteinIntake(p: ProteinAnswer | null): number | null {
  if (!p || !proteinAnswered(p) || p.door === 'ask') return null
  const grams = p.picks.reduce((sum, id) => sum + (OPTION_BY_ID.get(id)?.grams ?? 0), 0)
  // Portions only mean something on the counted day (v2 §5.2).
  return p.door === 'count' ? applyPortions(grams, p.portions) : grams
}

/** Which range applies: eating less, then lifting, then any training. */
export function proteinBasis(a: ConsultAnswers): TargetBasis {
  if (a.goals.includes('weight')) return 'deficit'
  if (countsByType(a.training).gym >= 2 || a.aim === 'muscle' || a.aim === 'strength') return 'lifting'
  if (sessionsPerWeek(a.training) > 0) return 'active'
  return 'sedentary'
}

const AGE_BRACKET: Record<AgeBand, AgeBracket | null> = {
  'under-18': null,
  '18-24': '16-24',
  '25-34': '25-34',
  '35-44': '35-44',
  '45-54': '45+',
  '55-64': '45+',
  '65-plus': '45+',
}

/** Their target, as a range, or null without a weight. */
export function consultProteinTarget(a: ConsultAnswers): ProteinTarget | null {
  return proteinTarget({ weightBand: a.protein?.weight ?? null, ageBracket: a.age ? AGE_BRACKET[a.age] : null, basis: proteinBasis(a) })
}

export interface ProteinMeasure {
  intakeG: number
  target: ProteinTarget
  gapG: number
  verdict: Verdict
}

/** A number against a target: only with a weight and an estimate. */
export function measuredProtein(a: ConsultAnswers): ProteinMeasure | null {
  const intakeG = proteinIntake(a.protein)
  const target = consultProteinTarget(a)
  if (intakeG === null || !target) return null
  return { intakeG, target, gapG: proteinGap(target, intakeG), verdict: proteinVerdict(target, intakeG) }
}

/** A gap worth a strong nudge: one scoop's worth, as v2 sets "big". */
export const MEASURED_GAP_G = 25

/* ── The words ──────────────────────────────────────────────────────────── */

/** The evidence line and the engine's source: an answer restated. */
export function proteinEvidence(m: ProteinMeasure): string {
  return `About ${m.intakeG}g a day against a ${m.target.lowG}g target`
}

/** What we already know, never what it adds up to (v2 §2.2: no anchoring). */
export const PROTEIN_BASIS_LINE: Record<TargetBasis, string> = {
  deficit: 'You’re eating less to lose weight, so this one’s worth a look.',
  lifting: 'You lift, which moves your number up.',
  active: 'You train most weeks, so your number sits a little higher.',
  sedentary: 'Worth a look even if you don’t train.',
}

export const PROTEIN_COPY = {
  weightAsk: 'Your weight, roughly',
  weightWhy: 'Only to work out your number. Skip it and I’ll go without one.',
  noIdea: 'I honestly have no idea',
  countLink: 'Count it instead, meal by meal',
  dayLink: 'Pick a day instead',
  portions: 'Your portions',
  noWeight: 'Add your weight above and I’ll put a number on it.',
} as const

export const MEAL_PROMPT: Record<Meal, string> = {
  breakfast: 'What does breakfast usually look like?',
  lunch: 'And lunch?',
  dinner: 'Dinner?',
  snacks: 'Anything in between: snacks or drinks?',
}

/**
 * The verdict, on the same screen. A number and where it sits against the
 * range; never a finding, never a product.
 */
export function proteinVerdictLine(m: ProteinMeasure): { headline: string; detail: string } {
  const headline = `About ${m.intakeG}g a day · your range ${m.target.lowG}–${m.target.highG}g`
  switch (m.verdict) {
    case 'big-gap':
    case 'small-gap':
      return { headline, detail: `About ${Math.round(m.gapG / 5) * 5}g under the range for your size and training.` }
    case 'on-target':
      return { headline, detail: 'That’s in your range.' }
    case 'over':
      return { headline, detail: 'That’s above your range.' }
  }
}
