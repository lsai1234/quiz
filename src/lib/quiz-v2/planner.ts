import type { Goal } from '@/lib/types'
import type { BankQuestion, InterviewState } from './types'
import type { DriverId } from './drivers'
import { CONFIRMED } from './drivers'
import { ADAPTIVE_QUESTIONS, FIXED_IDS, questionById } from './bank'

/**
 * What to ask next.
 *
 * Pure, synchronous and deterministic: the same state always produces the same
 * order. That is not a purity fetish — it is the entire latency story. Because
 * this can answer in zero milliseconds, the AI steer never has to be waited
 * for; it re-ranks a decision that has already been made and is already on
 * screen if it arrives too late. Nothing in the quiz ever awaits a network
 * call, and this file is why.
 *
 * ── How a question is scored ────────────────────────────────────────────────
 * By how much uncertainty it removes, not by a hand-written order. Each
 * question declares the drivers it can tell apart; each driver carries a
 * confidence. A question is worth asking in proportion to how unsettled the
 * drivers it touches are, and how much those drivers matter to the goals this
 * person actually picked.
 *
 * The consequence worth noticing: the planner chases its leading hypothesis. A
 * suspected driver scores higher than an unknown one, so once "slow mornings"
 * points at sleep, the next question is about sleep — which is exactly what
 * makes the interview feel like it is listening rather than working through a
 * list.
 */

/**
 * Which drivers each goal makes plausible.
 *
 * Not "which drivers can co-occur with this goal" — every driver can. This is
 * the narrower question of which ones would *change what we send* for someone
 * here for this goal. A driver outside a person's goals still scores, at a
 * quarter weight, because people are not only the thing they came for.
 */
export const GOAL_DRIVERS: Record<Goal, DriverId[]> = {
  muscle:      ['low-protein', 'recovery-debt', 'plateau', 'under-fuelled', 'training-load', 'sleep-debt'],
  bulking:     ['under-fuelled', 'low-protein', 'training-load', 'plateau'],
  cutting:     ['glycaemic-dip', 'under-fuelled', 'caffeine-crash', 'sedentary-slump', 'micronutrient-gap'],
  energy:      ['sleep-debt', 'unrefreshing-sleep', 'caffeine-crash', 'glycaemic-dip', 'under-fuelled', 'micronutrient-gap', 'stress-load', 'sun-exposure-low', 'sedentary-slump'],
  performance: ['training-load', 'recovery-debt', 'hydration-deficit', 'low-protein', 'plateau', 'sleep-debt'],
  hydration:   ['hydration-deficit', 'training-load'],
  recovery:    ['recovery-debt', 'joint-load', 'sleep-debt', 'low-protein', 'training-load'],
  health:      ['micronutrient-gap', 'sun-exposure-low', 'illness-frequency', 'sedentary-slump'],
  'sleep-better':    ['sleep-onset', 'sleep-maintenance', 'unrefreshing-sleep', 'sleep-debt', 'wired-evening', 'screen-fatigue', 'caffeine-crash', 'stress-load'],
  'less-stress':     ['stress-load', 'wired-evening', 'sleep-onset', 'screen-fatigue'],
  focus:             ['screen-fatigue', 'glycaemic-dip', 'unrefreshing-sleep', 'sleep-debt', 'stress-load', 'micronutrient-gap'],
  immune:            ['illness-frequency', 'micronutrient-gap', 'sun-exposure-low', 'sleep-debt', 'stress-load'],
  'skin-hair-nails': ['micronutrient-gap', 'hormonal-shift', 'stress-load', 'sun-exposure-low'],
  'gut-health':      ['gut-disruption', 'micronutrient-gap', 'stress-load'],
  menopause:         ['hormonal-shift', 'sleep-maintenance', 'stress-load', 'micronutrient-gap'],
}

/** Below this, the best remaining question is not worth a tap. */
export const MIN_GAIN = 0.4

/**
 * A topic already visited is damped, so the interview does not spend four
 * screens on sleep just because sleep kept scoring well.
 *
 * With one exception, and it matters more than the rule: a question that can
 * settle a driver we currently SUSPECT is not a repeat, it is the next rung of
 * a ladder. Damping those was the bug — after "slow mornings" the interview
 * asked how long they sleep, then wandered off to the working day and meals,
 * and only came back to "how are your nights?" six screens later. Coherent
 * enough on paper; nothing like being listened to. Now the damping applies only
 * once the topic has nothing live left in it.
 */
const REPEAT_TOPIC = 0.5

/**
 * How unsettled a driver is.
 *
 * The ordering is the whole behaviour: a *suspected* driver is worth far more
 * than an unknown one. Confirming the leading hypothesis is what turns a
 * plausible recommendation into a confident one, and it is what the user
 * experiences as being listened to.
 *
 * ── Why suspicion is scored above 1 and exploration below it ────────────────
 * The first cut of this used 0.9 against 0.6, and it was not enough. A question
 * touching four unexplored-but-relevant drivers out-scored the one that would
 * settle the driver we had just formed a hypothesis about — so after "slow
 * mornings" the interview asked a generic question about the working day
 * instead of asking about sleep. That is precisely the wandering the planner
 * exists to prevent, and the planner test now pins it.
 *
 * So a suspected driver scores above the maximum a fresh one can reach, and
 * scales with how strongly it is suspected: the stronger the hunch, the more
 * valuable it is to settle. Past `CONFIRMED` it falls away sharply, because
 * there is nothing left to learn and continuing to ask is how a quiz starts
 * feeling repetitive.
 */
export function uncertainty(state: InterviewState, d: DriverId): number {
  if (state.cleared.includes(d)) return 0
  const w = state.drivers[d] ?? 0
  if (w >= CONFIRMED) return 0.15
  if (w > 0) return 1 + w
  return 0.5
}

/** How much this driver matters to the goals this person picked. */
export function relevance(state: InterviewState, d: DriverId): number {
  if (state.primaryGoal && GOAL_DRIVERS[state.primaryGoal]?.includes(d)) return 1.3
  if (state.goals.some((g) => GOAL_DRIVERS[g]?.includes(d))) return 1
  return 0.25
}

/**
 * A question's expected value.
 *
 * Divided by the square root of the driver count rather than the count itself:
 * a broad opening question that separates eight drivers SHOULD outscore a
 * single-driver follow-up at the start, and a plain sum would let breadth win
 * forever. The square root keeps breadth an advantage while letting a sharp,
 * high-uncertainty confirmation overtake it once the field narrows.
 */
export function scoreQuestion(state: InterviewState, q: BankQuestion): number {
  if (q.discriminates.length === 0) return 0
  let sum = 0
  for (const d of q.discriminates) sum += uncertainty(state, d) * relevance(state, d)
  const spread = sum / Math.sqrt(q.discriminates.length)

  const askedTopics = new Set(state.asked.map((id) => questionById(id)?.topic).filter(Boolean))
  if (!askedTopics.has(q.topic)) return spread

  // Following up on a live hypothesis is not repeating a topic — see the note
  // on REPEAT_TOPIC.
  const chasing = q.discriminates.some(
    (d) => !state.cleared.includes(d) && (state.drivers[d] ?? 0) > 0 && (state.drivers[d] ?? 0) < CONFIRMED,
  )
  return chasing ? spread : spread * REPEAT_TOPIC
}

/** Can this question be put at all, right now? */
export function eligible(state: InterviewState, q: BankQuestion): boolean {
  if (state.asked.includes(q.id)) return false
  if (q.options.length === 0 && !q.fields) return false
  return q.requires ? q.requires(state) : true
}

/**
 * The adaptive questions worth asking, best first.
 *
 * Exported because the AI steer needs the shortlist: it is handed the top
 * candidates and may only reorder them. A model that cannot see the list cannot
 * pick from it, and a model that could pick from outside it would be authoring
 * questions — which is the thing this design exists to prevent.
 */
export function rankCandidates(
  state: InterviewState,
  bank: BankQuestion[] = ADAPTIVE_QUESTIONS,
): Array<{ question: BankQuestion; score: number }> {
  return bank
    .filter((q) => eligible(state, q))
    .map((q) => ({ question: q, score: scoreQuestion(state, q) }))
    .filter((c) => c.score >= MIN_GAIN)
    // Ties broken by bank order, via a stable sort, so the planner is
    // reproducible rather than dependent on the engine's sort implementation.
    .sort((a, b) => b.score - a.score)
}

export type StopReason = 'budget' | 'exhausted'

export interface PlannedNext {
  /** Null means the interview is over — go to the review screen. */
  question: BankQuestion | null
  /** Set only when `question` is null. */
  stopped?: StopReason
}

/**
 * The next screen.
 *
 * The fixed screens bookend the run: goals, safety and the dosing details open
 * it, already-taking closes it. Everything between is planned. `supps` is
 * reserved rather than scheduled — it is held back for the final slot so the
 * interview never runs out of budget with it unasked, which would let a
 * customer be recommended something they already own.
 */
export function planNext(
  state: InterviewState,
  bank: BankQuestion[] = ADAPTIVE_QUESTIONS,
  /**
   * Ids the AI steer would rather ask, best first.
   *
   * Advisory, and only ever a re-ordering: an id that is not already an
   * eligible candidate is ignored, so the steer can change which of OUR
   * questions comes next and nothing else. This is the single seam between the
   * model and the interview, and it is deliberately this narrow.
   */
  prefer?: string[],
): PlannedNext {
  const openers = FIXED_IDS.filter((id) => id !== 'supps')
  const nextOpener = openers.find((id) => !state.asked.includes(id))
  if (nextOpener) {
    const q = questionById(nextOpener)
    if (q) return { question: q }
  }

  const suppsAsked = state.asked.includes('supps')
  const supps = questionById('supps')

  // One slot is always held for `supps`, so `budget - 1` is what planning has.
  const spent = state.asked.length
  const planningBudget = Math.max(openers.length, state.budget - 1)

  if (spent < planningBudget) {
    const candidates = rankCandidates(state, bank)
    const steered = prefer?.length
      ? candidates.find((c) => prefer.includes(c.question.id))
      : undefined
    const best = steered ?? candidates[0]
    if (best) return { question: best.question }
    // Nothing left worth asking. Not a failure — the interview understood the
    // person before it ran out of questions, which is a better outcome than
    // filling the budget with taps that change nothing.
    if (!suppsAsked && supps) return { question: supps }
    return { question: null, stopped: 'exhausted' }
  }

  if (!suppsAsked && supps) return { question: supps }
  return { question: null, stopped: 'budget' }
}

/**
 * Whether the run finished early — the planner ran out of questions worth
 * asking before it ran out of budget. Reported to analytics, and worth saying
 * on screen: a quiz that stops because it has heard enough is a feature.
 */
export function endedEarly(state: InterviewState): boolean {
  return state.asked.length < state.budget
}
