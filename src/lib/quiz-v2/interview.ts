import type { Goal, QuizTrack } from '@/lib/types'
import type { BankQuestion, InterviewState } from './types'
import { addDrivers } from './drivers'
import { questionById } from './bank'

/**
 * The interview's reducer.
 *
 * Every change to the run goes through here, and every function is pure — state
 * in, state out. Two reasons that matters beyond tidiness: the planner's
 * determinism is only worth anything if the state it reads is built
 * deterministically too, and a back-step has to be able to *undo* an answer,
 * which is impossible if evidence has been accumulated in place.
 *
 * Undo is why `answerQuestion` never mutates and why `rewindTo` recomputes from
 * the start rather than subtracting. Subtracting driver weights would not work:
 * `addDriver` caps at 1, so the operation is not invertible, and a user who
 * backed up and changed one answer would be left with evidence from a path they
 * are no longer on.
 */

export function setTrack(state: InterviewState, track: QuizTrack): InterviewState {
  return { ...state, track }
}

/** Goals, with the first tapped one leading — same rule as v1. */
export function setGoals(state: InterviewState, goals: Goal[]): InterviewState {
  return { ...state, goals, primaryGoal: goals[0] ?? null }
}

export function setForm(
  state: InterviewState,
  patch: Partial<InterviewState['form']>,
): InterviewState {
  return { ...state, form: { ...state.form, ...patch } }
}

/**
 * Record an answer and fold in everything it implies.
 *
 * `clears` is applied after `drivers` so an option can both rule a driver out
 * and add evidence for another — "nights are fine" clears the four sleep
 * drivers and raises the nutrient gap in the same tap, which is the whole point
 * of a negative answer being informative.
 */
export function answerQuestion(
  state: InterviewState,
  question: BankQuestion,
  optionIds: string[],
): InterviewState {
  const chosen = question.options.filter((o) => optionIds.includes(o.id))

  let drivers = state.drivers
  const cleared = new Set(state.cleared)

  for (const option of chosen) {
    if (option.drivers) drivers = addDrivers(drivers, option.drivers)
  }
  for (const option of chosen) {
    for (const d of option.clears ?? []) cleared.add(d)
  }

  // A cleared driver carries no weight. Without this a driver could be ruled
  // out on one screen and still be scoring in the engine from an earlier one.
  for (const d of cleared) delete (drivers as Record<string, number | undefined>)[d]

  return {
    ...state,
    picked: { ...state.picked, [question.id]: optionIds },
    drivers,
    cleared: [...cleared],
    asked: state.asked.includes(question.id) ? state.asked : [...state.asked, question.id],
  }
}

/**
 * Step back to a question, discarding it and everything after it.
 *
 * Rebuilt from the surviving answers rather than unwound, because evidence does
 * not subtract cleanly (see the note at the top). The rebuild is over at most a
 * dozen answers and happens on a tap, so the cost is nothing and the
 * correctness is total.
 */
export function rewindTo(state: InterviewState, questionId: string): InterviewState {
  const cut = state.asked.indexOf(questionId)
  if (cut < 0) return state

  const keep = state.asked.slice(0, cut)
  let rebuilt: InterviewState = {
    ...state,
    picked: {},
    drivers: {},
    cleared: [],
    asked: [],
  }
  for (const id of keep) {
    const q = questionById(id)
    if (q) rebuilt = answerQuestion(rebuilt, q, state.picked[id] ?? [])
  }
  return rebuilt
}

/** The question before this one, for the Back button. */
export function previousQuestionId(state: InterviewState, currentId: string): string | null {
  const i = state.asked.indexOf(currentId)
  if (i > 0) return state.asked[i - 1]
  // Not yet recorded (the user is on it but has not answered) — the last
  // answered question is the one behind them.
  if (i < 0 && state.asked.length > 0) return state.asked[state.asked.length - 1]
  return null
}

/** How far through, for the progress readout. 1-based. */
export function positionOf(state: InterviewState, questionId: string): number {
  const i = state.asked.indexOf(questionId)
  return (i < 0 ? state.asked.length : i) + 1
}
