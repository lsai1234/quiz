import type { QuizAnswers } from '@/lib/types'
import { defaultAnswers } from '@/lib/quiz-answers'
import type { BankOption, InterviewState } from './types'
import { questionById } from './bank'
import { rankedDrivers, type DriverWeights } from './drivers'
import {
  proteinComplete, proteinDriverWeight, proteinIntakeFrom, proteinProfile, proteinTarget,
} from './protein'

/**
 * The interview, as the recommendation engine has always seen it.
 *
 * This is the join that keeps v2 from forking the product. The engine, the
 * reveal, the pricing, the share card, the emails and the subscription all take
 * `QuizAnswers`; none of them learns that a second quiz exists. Every bank
 * option that settles something v1 also collects writes it here through its
 * `answers` patch, so v2 hands over the same shape with strictly more in it.
 *
 * ── Why arrays union instead of overwriting ─────────────────────────────────
 * Several options can contribute to one field — three safety flags ticked on
 * one screen, `lifestyle` tags arriving from four different answers across the
 * run. A shallow merge would keep only the last, silently dropping a
 * pregnancy flag because a later answer also wrote `safetyFlags`. So array
 * fields union and de-duplicate, and scalars take the last writer.
 *
 * ── Why the drivers ride along separately ───────────────────────────────────
 * `answers.drivers` is a v2-only field the engine reads additively. With it
 * absent — which is every v1 answer and everything saved before v2 existed —
 * the new scoring table contributes exactly zero and output is unchanged. That
 * property is what makes the experiment safe to ship, and it is asserted in
 * `quiz-core`'s tests rather than trusted.
 */

/** Fields where two answers both contributing means "both", not "the later one". */
const UNION_FIELDS = [
  'goals', 'lifestyle', 'safetyFlags', 'currentSupplements', 'currentVitamins',
  'trainingType', 'tryOurs', 'workoutAddOns',
] as const

type UnionField = (typeof UNION_FIELDS)[number]
const IS_UNION = new Set<string>(UNION_FIELDS)

function mergePatch(base: QuizAnswers, patch: Partial<QuizAnswers>): QuizAnswers {
  const out: QuizAnswers = { ...base }
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue

    if (IS_UNION.has(key) && Array.isArray(value)) {
      const existing = (out[key as UnionField] ?? []) as unknown[]
      out[key as UnionField] = [...new Set([...existing, ...value])] as never
      continue
    }

    // `wellbeingAnswers` is a record of follow-up answers keyed by question id,
    // and several bank options write into it. Merged, not replaced.
    if (key === 'wellbeingAnswers' && value && typeof value === 'object') {
      out.wellbeingAnswers = { ...out.wellbeingAnswers, ...(value as Record<string, string>) }
      continue
    }

    out[key as keyof QuizAnswers] = value as never
  }
  return out
}

/** The options the user actually chose, in the order the questions were asked. */
export function chosenOptions(state: InterviewState): BankOption[] {
  const out: BankOption[] = []
  for (const questionId of state.asked) {
    const question = questionById(questionId)
    if (!question) continue
    const picked = state.picked[questionId] ?? []
    for (const option of question.options) {
      if (picked.includes(option.id)) out.push(option)
    }
  }
  return out
}

/**
 * Build the canonical answers from an interview.
 *
 * Deliberately takes the whole state rather than a diff: the projection is
 * recomputed from scratch on every read, so a back-step that changed an early
 * answer can never leave a stale field behind from the path the user abandoned.
 */
export function projectAnswers(state: InterviewState): QuizAnswers {
  let answers: QuizAnswers = {
    ...defaultAnswers,
    track: state.track,
    goals: [...state.goals],
    primaryGoal: state.primaryGoal,
    name: state.form.name.trim(),
    ageBracket: state.form.ageBracket,
    gender: state.form.gender,
    weightBand: state.form.weightBand,
    healthDataConsent: state.healthDataConsent ?? null,
    // Fresh arrays and records — `defaultAnswers` is a module constant and
    // must never be mutated by a merge.
    lifestyle: [],
    safetyFlags: [],
    currentSupplements: [],
    currentVitamins: [],
    trainingType: [],
    tryOurs: [],
    wellbeingAnswers: {},
    dynamicAnswers: {},
  }

  for (const option of chosenOptions(state)) {
    if (option.answers) answers = mergePatch(answers, option.answers)
    if (option.signals?.length) {
      answers = mergePatch(answers, { lifestyle: [...option.signals] })
    }
  }

  // The protein check, when it produced a number, replaces the guess with the
  // subtraction — including the case where the subtraction says zero.
  const protein = proteinReading(state)
  if (protein) {
    answers.proteinTargetG = protein.targetG
    answers.proteinTargetHighG = protein.targetHighG
    answers.proteinIntakeG = protein.intakeG
  }

  // Only settled drivers reach the engine. A driver at 0.1 is a hint from one
  // half-answer, and scoring it would let a passing remark move the box.
  const drivers = rankedDrivers(protein ? protein.weights : state.drivers)
  if (drivers.length > 0) {
    answers.drivers = Object.fromEntries(drivers.map((d) => [d.id, d.weight]))
  }

  return answers
}

/**
 * What the protein check measured, if it ran and produced a number.
 *
 * ── Why the driver is overridden rather than accumulated ────────────────────
 * The bank options carry an approximate `low-protein` weight so the PLANNER has
 * something to work with mid-interview. Once there is a target and an estimate,
 * that guess is strictly worse than the subtraction, and leaving both in place
 * would mean the engine scoring a hunch alongside a measurement.
 *
 * The zero case is the one that matters. Someone on target or over gets a
 * weight of 0, which drops below `NOTED` and out of the ranking entirely — so
 * "we'll leave protein out of your box" reaches the recommendation rather than
 * only the copy. Without this the option's own 0.45 would still be sitting
 * there, quietly selling a tub to somebody the same page had just congratulated.
 */
function proteinReading(
  state: InterviewState,
): { targetG: number; targetHighG: number; intakeG: number; weights: DriverWeights } | null {
  const question = questionById('protein-check')
  if (!question) return null
  const picked = state.picked[question.id]
  if (!picked?.length) return null

  /*
   * A day that was only partly answered sums to a real figure — three meals of
   * a four-meal day — and comparing that against a full-day target would
   * manufacture a gap out of the question not being finished. The screen will
   * not let anyone Continue from there, but `reviseAnswer` can drop a later
   * answer and leave one behind, and this is the last place that could be
   * caught before it reached the engine as a number.
   */
  if (!proteinComplete(question.options, picked)) return null

  const intakeG = proteinIntakeFrom(question.options, picked)
  // "I honestly have no idea" — the coarse driver from the option stands, and
  // no number is claimed.
  if (intakeG === null) return null

  const target = proteinTarget(proteinProfile(state))
  // No weight band, so no target — the estimate is real but there is nothing
  // honest to compare it against.
  if (!target) return null

  return {
    targetG: target.lowG,
    targetHighG: target.highG,
    intakeG,
    weights: { ...state.drivers, 'low-protein': proteinDriverWeight(target, intakeG) },
  }
}
