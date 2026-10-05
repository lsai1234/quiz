import { NextResponse } from 'next/server'
import { ALL_EVENTS, type AnalyticsEvent, type EventProps } from '@/lib/analytics/events'
import { recordEvent } from '@/lib/analytics/repo'
import { patchFromEvent, recordSessionEvent } from '@/lib/analytics/sessions'
import { parseUserAgent, sanitiseVisitContext } from '@/lib/analytics/visit'
import { isPortalAuthed } from '@/lib/portal/guard'

/**
 * POST /api/analytics
 *
 * A minimal, provider-agnostic funnel sink. It stores each event in our own
 * `analytics_events` table — which is what lets the Founders Hub show quiz
 * drop-off without a third party — folds it into its visit's row in
 * `analytics_sessions`, and writes a structured log line alongside, so
 * forwarding to a real provider (PostHog / Plausible / a warehouse) later is
 * still a one-line change.
 *
 * It accepts only the known anonymous events — no PII, no cookies, just a
 * per-visit session id — and always returns 204 so a beacon never blocks the
 * client. The write is best-effort for the same reason: analytics must not be
 * able to break a checkout.
 *
 * ── What the request itself adds ────────────────────────────────────────────
 * The device, OS and browser, read from the user agent and kept only as
 * buckets ("mobile", "iOS", "Instagram app"); the country the host derived
 * from the connection (Vercel's `x-vercel-ip-country`), never the address; and
 * whether the browser is signed in to the Founders Hub, so a founder running
 * the quiz to check it can be left out of the numbers. Crawlers and headless
 * browsers are not visitors and are not recorded at all.
 */

const KNOWN = new Set<string>(ALL_EVENTS)

/** A client clock this far out is wrong, and its timestamp would land the event in the wrong day. */
const MAX_SKEW_MS = 10 * 60_000

/** Props past this size are not an analytics event, whatever they claim to be. */
const MAX_PROPS_CHARS = 4_000

export async function POST(req: Request) {
  let body: { event?: unknown; props?: unknown; session?: unknown; path?: unknown; ts?: unknown; ctx?: unknown }
  try {
    body = await req.json()
  } catch {
    return new NextResponse(null, { status: 204 })
  }

  if (typeof body.event !== 'string' || !KNOWN.has(body.event)) return new NextResponse(null, { status: 204 })

  const ctx = sanitiseVisitContext(body.ctx)
  const device = parseUserAgent(req.headers.get('user-agent'), ctx.touch)
  if (device.bot) return new NextResponse(null, { status: 204 })

  const event = body.event as AnalyticsEvent
  let props = (body.props && typeof body.props === 'object' && !Array.isArray(body.props) ? body.props : {}) as EventProps
  if (JSON.stringify(props).length > MAX_PROPS_CHARS) props = {}
  const session = typeof body.session === 'string' && body.session.length <= 64 ? body.session : null
  const path = typeof body.path === 'string' ? body.path.slice(0, 200) : null
  const nowMs = Date.now()
  const ts = typeof body.ts === 'number' && Math.abs(body.ts - nowMs) <= MAX_SKEW_MS ? body.ts : nowMs
  const at = new Date(ts).toISOString()

  const countryHeader = req.headers.get('x-vercel-ip-country')
  const country = countryHeader && /^[A-Za-z]{2}$/.test(countryHeader) ? countryHeader.toUpperCase() : null

  let internal = false
  try {
    internal = await isPortalAuthed()
  } catch {
    /* no cookie jar to read — a visitor, then */
  }

  // Structured log line — point this at your analytics provider when you have one.
  console.log('[analytics]', JSON.stringify({ event, props, session, path, ts }))

  // And keep it, so the hub can compute the funnel from our own data.
  await Promise.all([
    recordEvent({ event, props, sessionId: session, path, at }),
    session
      ? recordSessionEvent(session, patchFromEvent({ event, props, path, at, ctx, device, country, internal }))
      : undefined,
  ])

  return new NextResponse(null, { status: 204 })
}
