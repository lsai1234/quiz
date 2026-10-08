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
import { forwardToPixel } from './meta-pixel'
import { buildVisitContext, type VisitContext } from './visit'

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
  /**
   * The age band and sex from the "about you" screen, once it is answered.
   *
   * The quiz asks both on its third screen, which is early enough that most of
   * the people who leave have already answered — so drop-off, completion and
   * conversion can be read per age band and per sex, not only for finishers.
   * Bands, never an age; and weight is deliberately left out: it is
   * health-adjacent and analytics is not where it belongs.
   */
  'quiz_profile',
] as const

export type QuizEvent = (typeof QUIZ_EVENTS)[number]

/**
 * The Amp Consult's funnel (build H12). Its own names rather than the quiz's,
 * so the two funnels can sit side by side in the hub without one leaking into
 * the other. The results page, checkout and purchase events are shared — both
 * front doors lead to the same page — which is what makes consult → results →
 * subscription comparable with the quiz.
 */
export const CONSULT_EVENTS = [
  'consult_start',
  'consult_scene_view',
  'consult_scene_complete',
  'consult_scene_back',
  'consult_comfort',
  'consult_stop',
  'consult_complete',
  'consult_handoff',
  'consult_abandon',
  // Pinpoint (plan v5 §11).
  'consult_upgrade',
  'consult_got_you',
] as const

export type ConsultEvent = (typeof CONSULT_EVENTS)[number]

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
  // The giveaway: an email went in at the foot of the results page, and the
  // share bonus was claimed on top of it.
  'competition_enter',
  'competition_bonus',
] as const

export type ShareEvent = (typeof SHARE_EVENTS)[number]

/**
 * Site-wide events — the top of every funnel.
 *
 * `page_view` is what makes "how many people opened the landing page?" an
 * answerable question at all. Every funnel event above fires only once somebody
 * has DONE something, so before this the hub could count quiz starts but had no
 * idea how many visitors were looking at the button and not pressing it.
 */
export const SITE_EVENTS = ['page_view'] as const

export type SiteEvent = (typeof SITE_EVENTS)[number]

/** Every event the client may emit. */
export type AnalyticsEvent = ShopEvent | QuizEvent | ShareEvent | ConsultEvent | SiteEvent

/** Every event the server accepts — one list, so a new family cannot be emitted and silently dropped. */
export const ALL_EVENTS: readonly AnalyticsEvent[] = [
  ...SHOP_EVENTS,
  ...QUIZ_EVENTS,
  ...SHARE_EVENTS,
  ...CONSULT_EVENTS,
  ...SITE_EVENTS,
]

export type EventProps = Record<string, string | number | boolean | undefined>

// Anonymous session id, persisted in sessionStorage so a single visit's funnel
// steps stay grouped across an in-quiz reload and the quiz → reveal → checkout
// hops — without any cross-session/persistent identifier.
const SESSION_KEY = 'chrgd_analytics_sid'
let sessionId: string | null = null

// How the visit began, captured on its first page and kept beside the id with
// the same lifetime. See `visit.ts` for what it holds and what it refuses to.
const CONTEXT_KEY = 'chrgd_analytics_ctx'
let visitContext: VisitContext | null = null

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

/**
 * How this visit began: referrer, campaign tags, landing page.
 *
 * Read on the first event of the visit and remembered, because by the second
 * page the referrer is our own site and the campaign tags are gone from the
 * URL. Sent on every beacon rather than only the first, so a first beacon lost
 * on a flaky connection does not lose where the visit came from.
 */
export function getVisitContext(): VisitContext {
  if (visitContext) return visitContext
  try {
    const stored = window.sessionStorage.getItem(CONTEXT_KEY)
    if (stored) return (visitContext = JSON.parse(stored) as VisitContext)
  } catch {
    /* unavailable or unreadable — rebuild it */
  }
  visitContext = buildVisitContext({
    href: window.location.href,
    referrer: document.referrer,
    maxTouchPoints: navigator.maxTouchPoints,
  })
  try {
    window.sessionStorage.setItem(CONTEXT_KEY, JSON.stringify(visitContext))
  } catch {
    /* the in-memory copy still describes this page-load */
  }
  return visitContext
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
      window.sessionStorage.removeItem(CONTEXT_KEY)
      sessionId = null
      visitContext = null
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
      ctx: getVisitContext(),
    })
    if (typeof navigator.sendBeacon === 'function') {
      navigator.sendBeacon('/api/analytics', new Blob([body], { type: 'application/json' }))
    } else {
      // Caught: a failed beacon must not surface as an unhandled rejection,
      // which the error reporter would log as a crash.
      void fetch('/api/analytics', { method: 'POST', body, headers: { 'Content-Type': 'application/json' }, keepalive: true }).catch(() => {})
    }
    // The Meta Pixel, for the few events ads care about — and only once the
    // visitor has said yes to advertising cookies. See `meta-pixel.ts`.
    forwardToPixel(event, props)
    if (process.env.NODE_ENV !== 'production') console.debug('[analytics]', event, props)
  } catch {
    /* analytics must never break the app */
  }
}
