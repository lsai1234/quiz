/**
 * The Meta (Facebook / Instagram) Pixel — so Meta ads can see who visits, who
 * does the quiz and who buys.
 *
 * ── Consent first, always ───────────────────────────────────────────────────
 * Unlike our own funnel analytics (`events.ts`), the Pixel is a third-party
 * script that sets cookies and shares browsing activity with Meta. Under PECR
 * that needs a clear yes BEFORE anything loads, so nothing here touches the
 * network until `setAdConsent('granted')` has been called from the prompt. A
 * browser sending Do Not Track or Global Privacy Control is treated as a no and
 * is never asked; neither is anybody who opted out of analytics on the privacy
 * page.
 *
 * ── What Meta is and is not sent ────────────────────────────────────────────
 * Page views, and the handful of funnel moments that matter for ads (below),
 * with product ids and money values. Never a quiz answer, never anything from
 * the safety screen, never an email. `autoConfig` is switched off so the Pixel
 * does not scrape buttons or page metadata on its own — the quiz has health
 * questions on screen, and nothing about them may reach an ad platform.
 *
 * ── One source of events ────────────────────────────────────────────────────
 * The Pixel is fed from `track()`, the same call every funnel event already
 * goes through. So a new `purchase` call site reports to Meta without anybody
 * remembering to, and the Pixel can never count something our own funnel does
 * not.
 */
import type { AnalyticsEvent, EventProps } from './events'

type Fbq = ((...args: unknown[]) => void) & {
  callMethod?: (...args: unknown[]) => void
  queue: unknown[]
  loaded: boolean
  version: string
  push: Fbq
}

declare global {
  interface Window {
    fbq?: Fbq
    _fbq?: Fbq
  }
}

export type AdConsent = 'granted' | 'denied'

/** Where the visitor's answer to the cookie prompt is remembered. */
export const AD_CONSENT_KEY = 'chrgd_ad_consent'

/** Paths the Pixel never runs on: our own tools, and members' private pages. */
const EXCLUDED_PREFIXES = ['/founderhub', '/myhub', '/partner', '/styleguide']

export function pixelAllowedOn(pathname: string): boolean {
  return !EXCLUDED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))
}

// ── Which Pixel, from the hub ────────────────────────────────────────────────

let pixelId: string | null = null
const listeners = new Set<() => void>()

/** Set from `/api/config` by `PortalSync`. Null = the Pixel is off. */
export function setMetaPixelId(id: string | null): void {
  const next = id && /^\d{8,20}$/.test(id) ? id : null
  if (next === pixelId) return
  pixelId = next
  listeners.forEach((l) => l())
}

export function getMetaPixelId(): string | null {
  return pixelId
}

/** For `useSyncExternalStore` — the prompt appears once the id arrives. */
export function subscribeMetaPixel(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

// ── Consent ──────────────────────────────────────────────────────────────────

export function getAdConsent(): AdConsent | null {
  try {
    const v = window.localStorage.getItem(AD_CONSENT_KEY)
    return v === 'granted' || v === 'denied' ? v : null
  } catch {
    return null
  }
}

export function setAdConsent(value: AdConsent): void {
  try {
    window.localStorage.setItem(AD_CONSENT_KEY, value)
  } catch {
    /* storage unavailable — the choice holds for this page load only */
  }
  if (value === 'granted') {
    loadMetaPixel()
  } else if (window.fbq) {
    // Withdrawn after the script had loaded: tell it to stop, and stop sending.
    window.fbq('consent', 'revoke')
  }
  listeners.forEach((l) => l())
}

/** A browser-level "do not track me", which is a no we honour without asking. */
export function browserSaysNo(): boolean {
  if (typeof navigator === 'undefined') return true
  const nav = navigator as Navigator & { globalPrivacyControl?: boolean; msDoNotTrack?: string }
  if (nav.doNotTrack === '1' || nav.msDoNotTrack === '1' || nav.globalPrivacyControl === true) return true
  try {
    // Opted out of analytics on the privacy page — that was a no to all of it.
    return window.localStorage.getItem('chrgd_analytics_off') === '1'
  } catch {
    return false
  }
}

/** Whether the Pixel may run right now. */
export function pixelActive(): boolean {
  if (typeof window === 'undefined' || !pixelId) return false
  if (browserSaysNo() || getAdConsent() !== 'granted') return false
  return pixelAllowedOn(window.location.pathname)
}

// ── Loading ──────────────────────────────────────────────────────────────────

let initialisedFor: string | null = null

/**
 * Meta's standard base code, written out rather than pasted as a string so it
 * is readable and type-checked. It queues calls until `fbevents.js` arrives.
 */
function installStub(): void {
  if (window.fbq) return
  const fbq = function (...args: unknown[]) {
    if (fbq.callMethod) fbq.callMethod(...args)
    else fbq.queue.push(args)
  } as Fbq
  fbq.push = fbq
  fbq.loaded = true
  fbq.version = '2.0'
  fbq.queue = []
  window.fbq = fbq
  if (!window._fbq) window._fbq = fbq
  const script = document.createElement('script')
  script.async = true
  script.src = 'https://connect.facebook.net/en_US/fbevents.js'
  document.head.appendChild(script)
}

/** Load and initialise the Pixel, if it is allowed to run. Idempotent. */
export function loadMetaPixel(): boolean {
  if (!pixelActive() || !pixelId) return false
  if (initialisedFor === pixelId) return true
  installStub()
  window.fbq!('consent', 'grant')
  // No automatic button or metadata scraping — see the header.
  window.fbq!('set', 'autoConfig', false, pixelId)
  window.fbq!('init', pixelId)
  initialisedFor = pixelId
  return true
}

// ── Sending ──────────────────────────────────────────────────────────────────

export function pixelPageView(): void {
  if (!loadMetaPixel()) return
  window.fbq!('track', 'PageView')
}

const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined)
const str = (v: unknown): string | undefined => (typeof v === 'string' && v ? v : undefined)

type PixelCall = {
  kind: 'track' | 'trackCustom'
  name: string
  params: Record<string, unknown>
  /** Meta's de-duplication id, for a future server-side Conversions API. */
  eventID?: string
}

/**
 * Our funnel event → Meta's event, or null for the ones ads have no use for.
 *
 * Standard events wherever Meta has one, because those are what campaigns can
 * optimise for without setting up a custom conversion. Only the fields named
 * here are forwarded — never the whole props object, which for the quiz carries
 * answers.
 */
export function pixelEventFor(event: AnalyticsEvent, props: EventProps): PixelCall | null {
  const currency = (str(props.currency) ?? 'GBP').toUpperCase()
  switch (event) {
    case 'quiz_start':
    case 'consult_start':
      return { kind: 'trackCustom', name: 'StartQuiz', params: { quiz: event === 'quiz_start' ? 'quiz' : 'consult' } }
    case 'quiz_complete':
    case 'consult_complete':
      return {
        kind: 'track',
        name: 'Lead',
        params: { content_name: event === 'quiz_complete' ? 'Quiz completed' : 'Consult completed' },
      }
    case 'stack_reveal_view':
      return { kind: 'track', name: 'ViewContent', params: { content_type: 'product_group', content_name: 'Stack' } }
    case 'product_open': {
      const id = str(props.id)
      return {
        kind: 'track',
        name: 'ViewContent',
        params: { content_type: 'product', ...(id ? { content_ids: [id] } : {}) },
      }
    }
    case 'add_to_basket': {
      const id = str(props.id)
      const qty = num(props.qty) ?? 1
      const price = num(props.price)
      return {
        kind: 'track',
        name: 'AddToCart',
        params: {
          content_type: 'product',
          ...(id ? { content_ids: [id], contents: [{ id, quantity: qty }] } : {}),
          ...(price !== undefined ? { value: Math.round(price * qty * 100) / 100, currency } : {}),
        },
      }
    }
    case 'checkout_start': {
      const value = num(props.value) ?? num(props.total)
      const items = num(props.items)
      return {
        kind: 'track',
        name: 'InitiateCheckout',
        params: {
          ...(value !== undefined ? { value, currency } : {}),
          ...(items !== undefined ? { num_items: items } : {}),
        },
      }
    }
    case 'purchase': {
      const value = num(props.value)
      const id = str(props.transaction_id)
      return {
        kind: 'track',
        name: 'Purchase',
        // Meta requires both on a Purchase; a value we do not know is sent as 0
        // rather than dropping the conversion.
        params: { value: value ?? 0, currency },
        ...(id ? { eventID: id } : {}),
      }
    }
    default:
      return null
  }
}

/** Called from `track()` for every funnel event. Never throws. */
export function forwardToPixel(event: AnalyticsEvent, props: EventProps): void {
  try {
    const call = pixelEventFor(event, props)
    if (!call || !loadMetaPixel()) return
    if (call.eventID) window.fbq!(call.kind, call.name, call.params, { eventID: call.eventID })
    else window.fbq!(call.kind, call.name, call.params)
  } catch {
    /* an ad pixel must never break the app */
  }
}
