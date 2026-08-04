import { NextResponse } from 'next/server'
import { SHOP_EVENTS, QUIZ_EVENTS, type AnalyticsEvent, type EventProps } from '@/lib/analytics/events'
import { recordEvent } from '@/lib/analytics/repo'

/**
 * POST /api/analytics
 *
 * A minimal, provider-agnostic funnel sink. It stores each event in our own
 * `analytics_events` table — which is what lets the Founders Hub show quiz
 * drop-off without a third party — and writes a structured log line alongside,
 * so forwarding to a real provider (PostHog / Plausible / a warehouse) later is
 * still a one-line change.
 *
 * It accepts only the known anonymous shop + quiz events — no PII, no cookies,
 * just a per-visit session id — and always returns 204 so a beacon never blocks
 * the client. The write is best-effort for the same reason: analytics must not
 * be able to break a checkout.
 */

const KNOWN = new Set<string>([...SHOP_EVENTS, ...QUIZ_EVENTS])

export async function POST(req: Request) {
  let body: { event?: unknown; props?: unknown; session?: unknown; path?: unknown; ts?: unknown }
  try {
    body = await req.json()
  } catch {
    return new NextResponse(null, { status: 204 })
  }

  if (typeof body.event === 'string' && KNOWN.has(body.event)) {
    const event = body.event as AnalyticsEvent
    const props = (body.props && typeof body.props === 'object' ? body.props : {}) as EventProps
    const session = typeof body.session === 'string' ? body.session : null
    const path = typeof body.path === 'string' ? body.path : null
    const ts = typeof body.ts === 'number' ? body.ts : Date.now()

    // Structured log line — point this at your analytics provider when you have one.
    console.log('[analytics]', JSON.stringify({ event, props, session, path, ts }))

    // And keep it, so the hub can compute the funnel from our own data.
    await recordEvent({ event, props, sessionId: session, path, at: new Date(ts).toISOString() })
  }

  return new NextResponse(null, { status: 204 })
}
