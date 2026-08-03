import { NextResponse } from 'next/server'
import { SHOP_EVENTS, QUIZ_EVENTS, type AnalyticsEvent } from '@/lib/analytics/events'

/**
 * POST /api/analytics
 *
 * A minimal, provider-agnostic funnel sink. Today it just writes a structured
 * server log per event; swap the `console.log` below for a forward to your real
 * analytics (PostHog / Plausible / a warehouse) when you have one. It accepts
 * only the known anonymous shop + quiz events — no PII, no cookies — and always
 * returns 204 so a beacon never blocks the client.
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
    const props = body.props && typeof body.props === 'object' ? body.props : {}
    // Structured log line — replace with a forward to your analytics provider.
    console.log(
      '[analytics]',
      JSON.stringify({
        event,
        props,
        session: typeof body.session === 'string' ? body.session : null,
        path: typeof body.path === 'string' ? body.path : null,
        ts: typeof body.ts === 'number' ? body.ts : Date.now(),
      }),
    )
  }

  return new NextResponse(null, { status: 204 })
}
