import { NextResponse } from 'next/server'
import { resolveConfirmation } from '@/lib/orders/confirmation'
import { markAnalyticsReported } from '@/lib/orders/service'
import { syncPortalRuntime } from '@/lib/portal/store'

export const dynamic = 'force-dynamic'

/**
 * GET /api/orders/confirmation?session_id=…
 *
 * The only way the confirmation screen learns anything. Retrieves and validates
 * the Stripe session SERVER-side (OC-F-011) — the secret key never goes near a
 * browser — and answers with exactly what may be rendered.
 *
 * It returns `recovery` for anything it cannot positively verify: unknown
 * session, tampered id, someone else's order, Stripe unreachable. All of those
 * look identical from outside, deliberately, so the endpoint can't be used to
 * probe which order ids exist (OC-E-007).
 *
 * Read-only with respect to the order, with exactly one exception: the
 * once-only analytics flag (OC-F-090). Fulfilment is the webhook's job and is
 * never triggered from here, however many times this is called (OC-F-014).
 */

/**
 * Per-key request budget.
 *
 * In-memory, so on serverless it is per-instance rather than global — which
 * makes it a brake on a hot loop rather than a real defence. It is here because
 * the endpoint hits the Stripe API on every miss and a tight retry could burn
 * the rate limit; treat a determined attacker as an edge/WAF problem, not this
 * (OC-NFR-007).
 */
const WINDOW_MS = 60_000
const MAX_PER_WINDOW = 30
const hits = new Map<string, { count: number; resetAt: number }>()

function rateLimited(key: string, now = Date.now()): boolean {
  const entry = hits.get(key)
  if (!entry || now > entry.resetAt) {
    hits.set(key, { count: 1, resetAt: now + WINDOW_MS })
    return false
  }
  entry.count += 1
  if (entry.count > MAX_PER_WINDOW) return true
  // Opportunistic cleanup so a long-lived instance doesn't grow this unbounded.
  if (hits.size > 5_000) {
    for (const [k, v] of hits) if (now > v.resetAt) hits.delete(k)
  }
  return false
}

function clientKey(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for')
  return forwarded?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'unknown'
}

export async function GET(req: Request) {
  const url = new URL(req.url)
  const sessionId = url.searchParams.get('session_id')
  const mockOrderId = url.searchParams.get('order')

  // Rate-limit per IP AND per session id, so one noisy client can't spend
  // everyone's budget and one session can't be hammered from many addresses.
  const key = `${clientKey(req)}:${sessionId ?? mockOrderId ?? 'none'}`
  if (rateLimited(key)) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: NO_STORE })
  }

  await syncPortalRuntime()

  const origin = process.env.APP_URL || req.headers.get('origin') || url.origin
  let body
  try {
    body = await resolveConfirmation({ sessionId, mockOrderId, origin })
  } catch (err) {
    // A resolution failure must degrade to recovery, never to a 500 with a
    // framework error page in front of a customer who has just paid.
    console.error('[confirmation] resolution failed:', err)
    return NextResponse.json(
      { state: 'recovery', variant: null, order: null, subscription: null, personalisation: null, analytics: null },
      { status: 200, headers: NO_STORE },
    )
  }

  // Claim the once-only conversion event. Done server-side and BEFORE the
  // response goes out, so two tabs racing can't both be told to report
  // (OC-F-090). A failure here must not cost the customer their confirmation.
  if (body.state === 'confirmed' && body.analytics && !body.analytics.alreadyReported && body.order) {
    try {
      const claimed = await markAnalyticsReported(body.order.reference)
      if (!claimed) body.analytics = { ...body.analytics, alreadyReported: true }
    } catch (err) {
      console.error('[confirmation] could not claim the analytics flag:', err)
    }
  }

  return NextResponse.json(body, { headers: NO_STORE })
}

/**
 * Never cached, anywhere (OC-NFR-016). A confirmation held in a CDN or a bfcache
 * is a confirmation shown to the wrong person, or shown after a back-navigation
 * from an abandoned checkout (OC-F-009).
 */
const NO_STORE = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
  Pragma: 'no-cache',
} as const
