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

/**
 * A step's id in an event.
 *
 * v1's steps come from a fixed union; v2's are bank question ids, which are
 * open by design — the bank grows without the analytics contract changing. The
 * funnel already derives its ladder from the ids the events report rather than
 * from a fixed list, so widening here costs nothing and is what lets one funnel
 * serve both arms.
 */
export type StepRef = StepId | (string & {})

/** Drop null/undefined so it never serialises as a literal "null". */
const s = (v: string | null | undefined): string | undefined => (v == null ? undefined : v)

export const funnel = {
  /** Quiz mounted — top of funnel. `track` may be null before the goal step. */
  start(p: { track: QuizTrack | null; drinksMode: boolean }) {
    track('quiz_start', { track: s(p.track), drinksMode: p.drinksMode })
  },

  /** A step became active. `total` = advertised question count (seq − review/deepDive). */
  stepView(p: { stepId: StepRef; index: number; total: number; track: QuizTrack | null; drinksMode: boolean }) {
    track('quiz_step_view', { stepId: p.stepId, index: p.index, total: p.total, track: s(p.track), drinksMode: p.drinksMode })
  },

  /** A step was advanced past — carries time-on-question. */
  stepComplete(p: { stepId: StepRef; index: number; msOnStep: number }) {
    track('quiz_step_complete', { stepId: p.stepId, index: p.index, msOnStep: p.msOnStep })
  },

  /** Backwards navigation — `via` distinguishes the Back button from a review edit-jump. */
  stepBack(p: { from: StepRef; to?: StepRef; via: 'back' | 'edit' }) {
    track('quiz_step_back', { from: p.from, to: s(p.to), via: p.via })
  },

  subView(p: { subId: string; parentStepId: StepRef }) {
    track('quiz_subquestion_view', { subId: p.subId, parentStepId: p.parentStepId })
  },

  subAnswer(p: { subId: string; parentStepId: StepRef; optionId: string }) {
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
  abandon(p: { lastStepId: StepRef; index: number; msTotal: number }) {
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

  // ── The adaptive quiz (v2) ──
  //
  // v2 reuses stepView/stepComplete/stepBack verbatim, passing the bank
  // question id as `stepId`. These three have no v1 equivalent.

  /**
   * One AI-steer attempt. The point of this event is to answer "is the AI doing
   * anything, and what is it costing us?" — `used: false` with a `timeout`
   * reason on most sessions means the prefetch budget is wrong; `used: false`
   * with `nokey` means it was never on. `latencyMs` is measured even on the
   * paths that were discarded, because a steer that lands at 4s is a steer that
   * would have been visible if anything waited for it.
   */
  aiSteer(p: {
    used: boolean
    latencyMs: number
    reason: 'ok' | 'timeout' | 'invalid' | 'nokey' | 'off' | 'error'
    applied?: 'order' | 'copy' | 'both' | 'none'
  }) {
    track('quiz_ai_steer', {
      used: p.used, latencyMs: p.latencyMs, reason: p.reason, applied: s(p.applied),
    })
  },

  /** A root cause the interview settled on, with how sure it ended up. In
   *  aggregate this says which problems the customer base actually has — a
   *  marketing read-out, not just a debug line. */
  driverResolved(p: { driverId: string; confidence: number }) {
    track('quiz_driver_resolved', { driverId: p.driverId, confidence: p.confidence })
  },

  /**
   * The protein check, once per run that saw it.
   *
   * The comparison worth having is `door: 'counted'` against `door: 'preset'` —
   * whether the readers who spend twenty seconds counting convert better than
   * the ones who spend three. If they do, the invitation to count deserves to
   * be louder and the module probably deserves an entry point of its own; if
   * they do not, the long path is decoration and can go.
   *
   * `gapG` is bucketed rather than exact: a per-person protein figure is a
   * health-adjacent number and analytics is not where it belongs.
   */
  proteinCheck(p: {
    door: 'preset' | 'counted' | 'no-idea'
    verdict: 'big-gap' | 'small-gap' | 'on-target' | 'over' | 'unknown'
    gapBand: 'none' | 'under-25' | '25-50' | 'over-50' | 'unknown'
    msOnStep: number
  }) {
    track('quiz_protein_check', {
      door: p.door, verdict: p.verdict, gapBand: p.gapBand, msOnStep: p.msOnStep,
    })
  },

  /** The planner ran out of questions worth asking before it ran out of budget. */
  earlyExit(p: { askedCount: number; budget: number }) {
    track('quiz_early_exit', { askedCount: p.askedCount, budget: p.budget })
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
