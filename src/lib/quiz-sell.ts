/**
 * The odd "did you know?" — a light-touch brand tidbit that surfaces on a few
 * steps as you move through the quiz, NOT a reaction to every tap. Only a
 * handful of steps carry one and each shows at most once, so it stays a pleasant
 * surprise rather than a nag. Drinks mode leans into drinks & convenience; the
 * normal quiz gets the stack version.
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

// Sparse on purpose — three well-spaced steps across the run, so it's the odd
// fact, not every press. Drinks mode: convenience-first.
const LQD_FACTS: Partial<Record<StepId, { icon: string; text: string }>> = {
  dailyDrinks: { icon: 'droplet', text: 'A whole month of LQD is one box in the fridge — no tubs, no pills, no scoops.' },
  diet: { icon: 'leaf', text: 'One Daily Vits bottle carries 24 vitamins & minerals — the gaps, handled.' },
  // Was on the budget step; LQD skips that step now (pace sizes the box).
  trainingTime: { icon: 'bundle3', text: 'Your box ships monthly, and you can pause or skip whenever you like.' },
}

const STACK_FACTS: Partial<Record<StepId, { icon: string; text: string }>> = {
  diet: { icon: 'leaf', text: 'Most diets miss the basics — that’s exactly what the everyday essentials cover.' },
  supps: { icon: 'grid', text: 'We skip anything you already take, so you only pay for the gaps.' },
  // The budget step is gone (you choose a depth on the results screen instead);
  // the subscribe-&-save tidbit now lives on the formats step.
  formats: { icon: 'bundle3', text: 'Subscribe & save — the bigger the bundle, the better the rate.' },
}

/**
 * The tidbit for a step, or null if that step carries none. Keyed by step + mode
 * so it's stable; callers should show each `id` at most once per session.
 */
export function quizFactFor(stepId: StepId, drinksMode = false): QuizFact | null {
  const facts = drinksMode ? LQD_FACTS : STACK_FACTS
  const f = facts[stepId]
  if (!f) return null
  return { id: `${stepId}:${drinksMode ? 'l' : 's'}`, ...f }
}
