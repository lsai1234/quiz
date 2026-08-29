/**
 * Lightweight, provider-agnostic funnel analytics for the shop AND the quiz.
 *
 * `track()` fires an anonymous event at POST /api/analytics (via sendBeacon so it
 * survives the checkout redirect/unload). There's no third-party script, no
 * cookie and no PII — just an anonymous session id (kept in `sessionStorage` so
 * it survives a reload and can group a whole quiz → reveal → checkout journey).
 * It honours Do Not Track / Global Privacy Control, and never throws: analytics
 * must not be able to break the app.
 *
 * Point /api/analytics at a real provider when you have one (see that route).
 */

import { getQuizArm } from '@/lib/experiments/client'

export const SHOP_EVENTS = [
  'shop_view',
  'shop_filter_toggle',
  'product_open',
  'add_to_basket',
  'basket_open',
  'checkout_start',
  /**
   * @deprecated Fired when the Checkout Session was created — i.e. before the
   * customer had paid, and on everyone who then abandoned at Stripe. It made
   * conversion look far better than it was. `purchase` replaces it.
   */
  'checkout_success',
  'checkout_error',
  /**
   * The real conversion. Fired ONCE per order from the confirmation screen,
   * after the server has verified the session as paid, and gated on a
   * server-held flag so refreshes and second devices don't recount (OC-F-090).
   * Carries `journey_variant` so V1–V5 can be compared (OC-F-092).
   */
  'purchase',
  /** A click on a confirmation-screen CTA, to measure post-purchase exploration. */
  'confirmation_cta',
] as const

export type ShopEvent = (typeof SHOP_EVENTS)[number]

/**
 * The quiz funnel (Phase 0 instrumentation). These make per-question drop-off,
 * time-on-question and quiz→checkout conversion measurable — none of which the
 * shop-only events above could capture. `checkout_start`/`checkout_success` are
 * reused from the shop set (tagged `source: 'quiz'`).
 */
export const QUIZ_EVENTS = [
  'quiz_start',
  'quiz_step_view',
  'quiz_step_complete',
  'quiz_step_back',
  'quiz_subquestion_view',
  'quiz_subquestion_answer',
  'quiz_deepdive_offer',
  'quiz_deepdive_accept',
  'quiz_complete',
  'quiz_abandon',
  'stack_reveal_view',
  'stack_swap',
  'stack_add',
  'stack_remove',
  /**
   * The adaptive quiz (v2). `quiz_step_view` / `_complete` / `_back` are reused
   * as-is, carrying the bank question id as `stepId` — the funnel derives its
   * step ladder from the events themselves rather than a fixed list, so v2's
   * dynamic ids produce a correct funnel with no changes to the funnel code.
   * These three are the things v1 has no equivalent of.
   */
  'quiz_ai_steer',
  'quiz_driver_resolved',
  'quiz_early_exit',
] as const

export type QuizEvent = (typeof QUIZ_EVENTS)[number]

/**
 * The share card funnel.
 *
 * `share_method` is the one that matters. The share ladder falls from the native
 * file sheet to a download to press-and-hold, and a high `share_open` with a low
 * `share_method` means a rung is failing silently on a real device — which looks
 * exactly like disinterest unless the rung is recorded.
 */
export const SHARE_EVENTS = [
  'share_open',
  'share_render',
  'share_method',
  'share_error',
  'share_format',
  'share_dismiss',
] as const

export type ShareEvent = (typeof SHARE_EVENTS)[number]

/** Every event the client may emit. */
export type AnalyticsEvent = ShopEvent | QuizEvent | ShareEvent

export type EventProps = Record<string, string | number | boolean | undefined>

// Anonymous session id, persisted in sessionStorage so a single visit's funnel
// steps stay grouped across an in-quiz reload and the quiz → reveal → checkout
// hops — without any cross-session/persistent identifier.
const SESSION_KEY = 'chrgd_analytics_sid'
let sessionId: string | null = null

function newId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2)
}

/**
 * The per-visit id, shared with the error reporter.
 *
 * Exported so a crash report can be tied to the funnel steps that led to it —
 * "this person reached the reveal, then the page threw" is a far more useful
 * bug report than either half alone, and it costs no extra identifier because
 * it is the same anonymous, session-scoped value.
 */
export function getSessionId(): string {
  if (sessionId) return sessionId
  try {
    const stored = window.sessionStorage.getItem(SESSION_KEY)
    if (stored) return (sessionId = stored)
  } catch {
    /* sessionStorage unavailable (private mode / SSR) — fall back to in-memory */
  }
  sessionId = newId()
  try {
    window.sessionStorage.setItem(SESSION_KEY, sessionId)
  } catch {
    /* ignore — the in-memory id still groups this page-load */
  }
  return sessionId
}

/** Honour DNT / GPC. Exported so error reporting can respect it too. */
export function privacyOptedOut(): boolean {
  const nav = navigator as Navigator & { globalPrivacyControl?: boolean; msDoNotTrack?: string }
  return nav.doNotTrack === '1' || nav.msDoNotTrack === '1' || nav.globalPrivacyControl === true
}

/**
 * Record a funnel event. No-ops on the server, or when the visitor opts out.
 *
 * Every event is stamped with the visitor's quiz arm. Doing it here rather than
 * at each call site means it cannot be forgotten on one event and silently
 * ruin a comparison — and it reaches `purchase`, which is a shop event fired
 * from the confirmation screen and is the only place quiz→conversion can
 * actually be measured. Shop-only visitors carry an arm too; that costs
 * nothing and gives a baseline that the experiment should not move.
 */
export function track(event: AnalyticsEvent, props: EventProps = {}): void {
  if (typeof window === 'undefined') return
  try {
    if (privacyOptedOut()) return
    const body = JSON.stringify({
      event,
      props: { arm: getQuizArm(), ...props },
      session: getSessionId(),
      path: window.location.pathname,
      ts: Date.now(),
    })
    if (typeof navigator.sendBeacon === 'function') {
      navigator.sendBeacon('/api/analytics', new Blob([body], { type: 'application/json' }))
    } else {
      void fetch('/api/analytics', { method: 'POST', body, headers: { 'Content-Type': 'application/json' }, keepalive: true })
    }
    if (process.env.NODE_ENV !== 'production') console.debug('[analytics]', event, props)
  } catch {
    /* analytics must never break the app */
  }
}
