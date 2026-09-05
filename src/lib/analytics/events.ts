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
  /**
   * One per SETTLED search — fired off the debounced query, so it records what
   * someone actually searched for rather than every prefix on the way there.
   * Carries the result count and how many dietary filters were on.
   */
  'shop_search',
  /**
   * A search that returned nothing. Split out from `shop_search` because it is
   * the most commercially useful thing search knows: what people ask us for that
   * we do not stock. Read it as a buying list, not as an error log.
   */
  'shop_search_zero',
  /**
   * A result opened, with its position in the list. The only signal that says
   * whether the ranking is any good — a search whose answer is always at
   * position nine is a search nobody trusts.
   */
  'shop_search_select',
  /** A facet turned on or off, with what the shop was left showing. */
  'shop_filter_apply',
  /** A sort order chosen. */
  'shop_sort_change',
  /**
   * Basket Alchemy — what the basket is close to being. `view` fires once per
   * distinct suggestion, so the click-through rate below it means something.
   */
  'shop_nudge_view',
  'shop_nudge_click',
  'shop_nudge_dismiss',
  /** The Shelf Duel — two products opened head to head. */
  'shop_duel_open',
  /** The fallback parse read a sentence the synonym table could not. */
  'shop_intent_ai',
  /** An example sentence tapped — does the box teach what it can do? */
  'shop_search_example',
  /** Flavour Roulette — opened, and each pull of the lever. */
  'shop_roulette_open',
  'shop_roulette_spin',
  /* A hero banner was tapped. Which one, so a founder can tell whether the
     artwork they generated is doing anything at all. */
  'shop_banner_click',
  /* Left a stack to shop à la carte, and came back to it. Worth watching as a
     pair: a door people take and never return through is costing subscriptions
     rather than rescuing abandons. */
  'stack_shop_alacarte',
  'stack_return',
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
   * These are the things v1 has no equivalent of.
   */
  'quiz_ai_steer',
  'quiz_driver_resolved',
  'quiz_early_exit',
  'quiz_protein_check',
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

/** Where an explicit "no thanks" from the storage notice is remembered. */
export const OPT_OUT_KEY = 'chrgd_analytics_off'

/**
 * Whether this visitor has said no here, on this device.
 *
 * `localStorage` rather than `sessionStorage`, unlike the funnel's own id: a
 * choice to opt out has to outlive the tab it was made in, or it is not a
 * choice. It is the one thing we keep about someone who has asked us to keep
 * nothing, which is why it is a single boolean and nothing else.
 */
export function analyticsOptedOutHere(): boolean {
  try {
    return window.localStorage.getItem(OPT_OUT_KEY) === '1'
  } catch {
    return false
  }
}

/** Remember the choice, and stop immediately. */
export function setAnalyticsOptOut(off: boolean): void {
  try {
    if (off) {
      window.localStorage.setItem(OPT_OUT_KEY, '1')
      // Drop the id we already minted, rather than leaving it to expire with
      // the tab — opting out should take effect now, not at the next visit.
      window.sessionStorage.removeItem(SESSION_KEY)
      sessionId = null
    } else {
      window.localStorage.removeItem(OPT_OUT_KEY)
    }
  } catch {
    /* storage unavailable — nothing is being recorded anyway */
  }
}

/**
 * Honour DNT / GPC, and an explicit opt-out here.
 *
 * Exported so error reporting can respect it too. A browser signal is a
 * standing instruction and is honoured without asking; the local flag is the
 * answer to the storage notice, for visitors whose browser sends neither.
 */
export function privacyOptedOut(): boolean {
  const nav = navigator as Navigator & { globalPrivacyControl?: boolean; msDoNotTrack?: string }
  if (nav.doNotTrack === '1' || nav.msDoNotTrack === '1' || nav.globalPrivacyControl === true) return true
  return analyticsOptedOutHere()
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
