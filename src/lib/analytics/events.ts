/**
 * Lightweight, provider-agnostic funnel analytics for the shop.
 *
 * `track()` fires an anonymous event at POST /api/analytics (via sendBeacon so it
 * survives the checkout redirect/unload). There's no third-party script, no
 * cookie and no PII — just an in-memory per-page-load session id so funnel steps
 * can be grouped. It honours Do Not Track / Global Privacy Control, and never
 * throws: analytics must not be able to break the shop.
 *
 * Point /api/analytics at a real provider when you have one (see that route).
 */

export const SHOP_EVENTS = [
  'shop_view',
  'shop_filter_toggle',
  'product_open',
  'add_to_basket',
  'basket_open',
  'checkout_start',
  'checkout_success',
  'checkout_error',
] as const

export type ShopEvent = (typeof SHOP_EVENTS)[number]

export type EventProps = Record<string, string | number | boolean | undefined>

// Anonymous, in-memory, regenerated every page load — groups a visit's funnel
// steps without any persistent identifier.
let sessionId: string | null = null
function getSessionId(): string {
  if (sessionId) return sessionId
  sessionId =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2)
  return sessionId
}

function privacyOptedOut(): boolean {
  const nav = navigator as Navigator & { globalPrivacyControl?: boolean; msDoNotTrack?: string }
  return nav.doNotTrack === '1' || nav.msDoNotTrack === '1' || nav.globalPrivacyControl === true
}

/** Record a funnel event. No-ops on the server, or when the visitor opts out. */
export function track(event: ShopEvent, props: EventProps = {}): void {
  if (typeof window === 'undefined') return
  try {
    if (privacyOptedOut()) return
    const body = JSON.stringify({
      event,
      props,
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
