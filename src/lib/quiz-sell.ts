/**
 * The odd "did you know?" — a light-touch brand tidbit that surfaces on a few
 * steps as you move through the quiz, NOT a reaction to every tap. Only a
 * handful of steps carry one and each shows at most once, so it stays a pleasant
 * surprise rather than a nag.
 *
 * Copy is claim-safe (mirrors the product `shortReason` voice): composition and
 * convenience, no medical promises.
 */
import type { StepId } from '@/lib/quiz-flow'

export interface QuizFact {
  /** Stable key — shown at most once per session. */
  id: string
  /** QuizIcon name. */
  icon: string
  /** The one-line tidbit (no "Did you know?" prefix — the chip adds the label). */
  text: string
}

// Sparse on purpose — a couple of well-spaced steps across the run, so it's the
// odd fact, not every press.
const STACK_FACTS: Partial<Record<StepId, { icon: string; text: string }>> = {
  diet: { icon: 'leaf', text: 'Most diets miss the basics — that’s exactly what the everyday essentials cover.' },
  // The budget and formats steps are both gone — you choose a depth on the
  // results screen, and format is a thing you change there rather than guess at
  // here. `supps` is the last step before review, so it carries two facts: the
  // one that was always its own, and the subscribe-&-save line the formats step
  // used to hold. `quizFactFor` returns one per step, so the pair is joined
  // rather than stacked — a step showing two tidbits reads as a leaflet.
  supps: { icon: 'grid', text: 'We skip anything you already take, so you only pay for the gaps — and subscribe & save means the bigger the bundle, the better the rate.' },
}

/**
 * v2's bank questions that hold the same place in the run as the v1 steps
 * carrying a tidbit.
 *
 * The adaptive interview has no fixed steps, so the facts hang off the two
 * questions that occupy the same moments: the one about how meals happen, and
 * the already-taking screen that closes the run. Deliberately NOT the protein
 * check — that screen's footer is already showing the reader a number about
 * their own diet, and a floating brand aside over the top of it is the one
 * place this chip would be an interruption rather than an aside.
 */
const V2_FACT_QUESTIONS: Record<string, StepId> = {
  'how-meals-happen': 'diet',
  supps: 'supps',
}

/** The tidbit for a v2 bank question, or null. Same ids, so the once-per-session
 *  rule and the analytics read identically across the two arms. */
export function quizFactForQuestion(questionId: string): QuizFact | null {
  const step = V2_FACT_QUESTIONS[questionId]
  return step ? quizFactFor(step) : null
}

/**
 * The tidbit for a step, or null if that step carries none. Keyed by step so
 * it's stable; callers should show each `id` at most once per session.
 */
export function quizFactFor(stepId: StepId): QuizFact | null {
  const f = STACK_FACTS[stepId]
  if (!f) return null
  return { id: stepId, ...f }
}
