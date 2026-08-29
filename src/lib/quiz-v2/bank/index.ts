import type { BankQuestion } from '../types'
import { FIXED_QUESTIONS, FIXED_IDS } from './fixed'
import { ENERGY_QUESTIONS } from './energy'
import { TRAINING_QUESTIONS } from './training'
import { WELLBEING_QUESTIONS } from './wellbeing'
import { NUTRITION_QUESTIONS } from './nutrition'

/**
 * The question bank.
 *
 * Every question the adaptive interview can ask, in one array. The planner
 * chooses from it; the AI steer re-ranks the planner's shortlist and can reword
 * a prompt, but it can only ever pick an id that appears here — which is what
 * makes "the AI writes the questions" safe to say out loud. It does not. We
 * wrote them; the AI decides the order.
 *
 * Order in this array is meaningful only for the fixed screens, which are asked
 * in the order they appear. Everything else is chosen by score.
 */

export const ADAPTIVE_QUESTIONS: BankQuestion[] = [
  ...ENERGY_QUESTIONS,
  ...TRAINING_QUESTIONS,
  ...WELLBEING_QUESTIONS,
  ...NUTRITION_QUESTIONS,
]

export const BANK: BankQuestion[] = [...FIXED_QUESTIONS, ...ADAPTIVE_QUESTIONS]

const BY_ID = new Map(BANK.map((q) => [q.id, q]))

export function questionById(id: string): BankQuestion | undefined {
  return BY_ID.get(id)
}

export { FIXED_QUESTIONS, FIXED_IDS }
export * from './predicates'
