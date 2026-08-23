import { NextResponse } from 'next/server'
import { recordError } from '@/lib/monitoring/repo'
import { isSeverity, surfaceForPath, type Severity } from '@/lib/monitoring/types'

/**
 * POST /api/errors — the sink for browser-side failures.
 *
 * Modelled on `/api/analytics`: unauthenticated (a crash on the shop happens to
 * people who have never signed in, which is exactly the crash you most need to
 * hear about), always 204 so a beacon can never block or retry-storm, and
 * best-effort so the reporter cannot itself become the fault.
 *
 * ── What it does not trust ──────────────────────────────────────────────────
 * This endpoint is open to the internet, so the body is treated as a claim
 * rather than a fact:
 *
 *   - `surface` is **re-derived from the reported path**, never taken as given.
 *     Otherwise anyone could file noise against `webhook` and set off the
 *     critical banner.
 *   - `severity` is capped at `error`. Only server code — which calls
 *     `reportError` directly, not this route — may raise a `critical`. A browser
 *     can always be lying, and `critical` is the one signal that must stay
 *     trustworthy or the dashboard banner becomes wallpaper.
 *   - Every field is length-bounded on the way into the repository.
 *   - A soft per-instance rate limit keeps one looping tab from writing a
 *     million rows. It is deliberately crude: this is a spend guard, not a
 *     security control, and on serverless each instance holds its own counter.
 */

export const dynamic = 'force-dynamic'

/** Max accepted reports per window, per running instance. */
const RATE_LIMIT = 60
const RATE_WINDOW_MS = 60_000

const bucket = { count: 0, resetAt: 0 }

function overRateLimit(): boolean {
  const nowMs = Date.now()
  if (nowMs > bucket.resetAt) {
    bucket.count = 0
    bucket.resetAt = nowMs + RATE_WINDOW_MS
  }
  bucket.count += 1
  return bucket.count > RATE_LIMIT
}

export async function POST(req: Request) {
  // 204 in every branch below — a client reporting an error must never be given
  // an error to report.
  const noContent = new NextResponse(null, { status: 204 })

  if (overRateLimit()) return noContent

  let body: {
    message?: unknown
    stack?: unknown
    path?: unknown
    session?: unknown
    severity?: unknown
    context?: unknown
  }
  try {
    body = await req.json()
  } catch {
    return noContent
  }

  const message = typeof body.message === 'string' ? body.message.trim() : ''
  if (!message) return noContent

  const path = typeof body.path === 'string' ? body.path : null
  const claimed: Severity = isSeverity(body.severity) ? body.severity : 'error'

  await recordError({
    // Derived, not trusted — see the header.
    surface: surfaceForPath(path),
    severity: claimed === 'critical' ? 'error' : claimed,
    kind: 'client',
    message,
    stack: typeof body.stack === 'string' ? body.stack : null,
    path,
    sessionId: typeof body.session === 'string' ? body.session : null,
    context:
      body.context && typeof body.context === 'object'
        ? (body.context as Record<string, string | number | boolean | null>)
        : undefined,
  })

  return noContent
}
