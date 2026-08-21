/**
 * Typed quiz-funnel event wrappers (Phase 0 instrumentation).
 *
 * Thin, named helpers over `track()` so the funnel is emitted consistently and
 * the event contract is unit-testable in one place — the components just call
 * `funnel.stepView(...)` etc. and never construct event names/props by hand.
 *
 * Null-ish values are dropped (analytics props are `string | number | boolean`),
 * so callers can pass the raw store values without pre-cleaning them.
 */
import { track } from './events'
import type { StepId } from '@/lib/quiz-flow'
import type { QuizTrack, Goal, Budget } from '@/lib/types'

/** Drop null/undefined so it never serialises as a literal "null". */
const s = (v: string | null | undefined): string | undefined => (v == null ? undefined : v)

export const funnel = {
  /** Quiz mounted — top of funnel. `track` may be null before the goal step. */
  start(p: { track: QuizTrack | null; drinksMode: boolean }) {
    track('quiz_start', { track: s(p.track), drinksMode: p.drinksMode })
  },

  /** A step became active. `total` = advertised question count (seq − review/deepDive). */
  stepView(p: { stepId: StepId; index: number; total: number; track: QuizTrack | null; drinksMode: boolean }) {
    track('quiz_step_view', { stepId: p.stepId, index: p.index, total: p.total, track: s(p.track), drinksMode: p.drinksMode })
  },

  /** A step was advanced past — carries time-on-question. */
  stepComplete(p: { stepId: StepId; index: number; msOnStep: number }) {
    track('quiz_step_complete', { stepId: p.stepId, index: p.index, msOnStep: p.msOnStep })
  },

  /** Backwards navigation — `via` distinguishes the Back button from a review edit-jump. */
  stepBack(p: { from: StepId; to?: StepId; via: 'back' | 'edit' }) {
    track('quiz_step_back', { from: p.from, to: s(p.to), via: p.via })
  },

  subView(p: { subId: string; parentStepId: StepId }) {
    track('quiz_subquestion_view', { subId: p.subId, parentStepId: p.parentStepId })
  },

  subAnswer(p: { subId: string; parentStepId: StepId; optionId: string }) {
    track('quiz_subquestion_answer', { subId: p.subId, parentStepId: p.parentStepId, optionId: p.optionId })
  },

  deepDiveOffer() {
    track('quiz_deepdive_offer')
  },

  deepDiveAccept() {
    track('quiz_deepdive_accept')
  },

  /** Reached the build step (completed the quiz). */
  complete(p: {
    track: QuizTrack | null
    drinksMode: boolean
    goalCount: number
    primaryGoal?: Goal
    budget: Budget | null
    msTotal: number
  }) {
    track('quiz_complete', {
      track: s(p.track),
      drinksMode: p.drinksMode,
      goalCount: p.goalCount,
      primaryGoal: s(p.primaryGoal),
      budget: s(p.budget),
      msTotal: p.msTotal,
    })
  },

  /** Left the quiz without completing (tab close / navigation). */
  abandon(p: { lastStepId: StepId; index: number; msTotal: number }) {
    track('quiz_abandon', { lastStepId: p.lastStepId, index: p.index, msTotal: p.msTotal })
  },

  // ── Reveal / built-bundle screen ──
  revealView(p: { slotCount: number; oneOff: number; sub: number; plan: string }) {
    track('stack_reveal_view', { slotCount: p.slotCount, oneOff: p.oneOff, sub: p.sub, plan: p.plan })
  },

  stackSwap(p: { slotId: string; from?: string; to: string }) {
    track('stack_swap', { slotId: p.slotId, from: s(p.from), to: p.to })
  },

  stackAdd(p: { productId: string; slotType?: string }) {
    track('stack_add', { productId: p.productId, slotType: s(p.slotType) })
  },

  stackRemove(p: { slotId: string }) {
    track('stack_remove', { slotId: p.slotId })
  },

  // ── Email capture ──
  //
  // Four events, because the interesting numbers are the gaps between them:
  // how many people were offered the card, how many gave an address, and how
  // many of those also ticked the marketing box. `leadDismiss` is what tells us
  // the card is being read and refused rather than simply scrolled past — a
  // distinction that decides whether it is worth keeping.

  /** The capture card was rendered. The denominator for everything below. */
  leadPromptView(p: { source: string }) {
    track('lead_prompt_view', { source: p.source })
  },

  /** An address was submitted, and whether the marketing box was ticked. */
  leadSubmit(p: { source: string; optIn: boolean }) {
    track('lead_submit', { source: p.source, optIn: p.optIn })
  },

  /** The submission carried a marketing opt-in — the list actually growing. */
  leadOptIn(p: { source: string }) {
    track('lead_opt_in', { source: p.source })
  },

  /** They read it and said no. Not the same as never seeing it. */
  leadDismiss(p: { source: string }) {
    track('lead_dismiss', { source: p.source })
  },

  // ── Checkout (reuses the shop events, tagged as quiz-sourced) ──
  //
  // Start only. There is deliberately no `checkoutSuccess` here: it fired when
  // the Checkout Session was created — before payment, and on everyone who then
  // abandoned at Stripe. The server-verified `purchase` event, emitted once from
  // OrderConfirmation, is the success signal for quiz-sourced orders too.
  checkoutStart(p: { plan: string; total: number }) {
    track('checkout_start', { plan: p.plan, total: p.total, source: 'quiz' })
  },
}
