import { NextResponse } from 'next/server'
import { kvGet, kvSet } from '@/lib/db'
import { validateHandoff, type HandoffPayload } from '@/lib/consult/handoff'

/**
 * /api/consult — the handoff payload, saved against its consult ID (build H7).
 *
 *   POST  the payload, validated against its schema before it is kept.
 *   GET   ?id=c_… — the payload back, for "change my answers" (H10) and for
 *         support to reload a consult.
 *
 * ── What is kept, and for how long ──────────────────────────────────────────
 * The payload only: goals, profile, the three SKU lists, reasons, and what the
 * circuit check ruled out. Never the circuit check's answers themselves. It is
 * still health-derived (an excluded fish oil says something), which is why it
 * is only sent after the explicit consent on the circuit check, and why it
 * expires: thirty days, then it reads as gone. Under UK GDPR that retention
 * limit belongs in the DPIA; `docs/DPIA.md` is where it gets recorded.
 *
 * ── What it does not trust ──────────────────────────────────────────────────
 * Open to the internet, like `/api/errors`: the body is re-validated in full,
 * size-capped, and a crude per-instance rate limit keeps a looping tab from
 * writing a million rows. The consult ID is 12 random base-36 characters, so
 * it isn't guessable; it is not an auth token, and nothing behind it is more
 * than a recommendation.
 */

export const dynamic = 'force-dynamic'

const CONSULT_RETENTION_MS = 30 * 24 * 60 * 60 * 1000
const MAX_BYTES = 16 * 1024
const RATE_LIMIT = 30
const RATE_WINDOW_MS = 60_000
const bucket = { count: 0, resetAt: 0 }

function overRateLimit(): boolean {
  const nowMs = Date.now()
  if (nowMs > bucket.resetAt) {
    bucket.count = 0
    bucket.resetAt = nowMs + RATE_WINDOW_MS
  }
  bucket.count++
  return bucket.count > RATE_LIMIT
}

interface Stored {
  savedAt: number
  payload: HandoffPayload
}

const key = (id: string) => `consult:${id}`

export async function POST(req: Request) {
  if (overRateLimit()) return NextResponse.json({ error: 'slow down' }, { status: 429 })
  const text = await req.text()
  if (text.length > MAX_BYTES) return NextResponse.json({ error: 'too large' }, { status: 413 })
  let body: unknown
  try {
    body = JSON.parse(text)
  } catch {
    return NextResponse.json({ error: 'not json' }, { status: 400 })
  }
  const checked = validateHandoff(body)
  if (!checked.ok) return NextResponse.json({ error: 'invalid', errors: checked.errors }, { status: 422 })
  await kvSet<Stored>(key(checked.payload.consult_id), { savedAt: Date.now(), payload: checked.payload })
  return NextResponse.json({ ok: true, consult_id: checked.payload.consult_id })
}

export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get('id') ?? ''
  if (!/^c_[a-z0-9]{6,32}$/.test(id)) return NextResponse.json({ error: 'bad id' }, { status: 400 })
  const stored = await kvGet<Stored>(key(id))
  if (!stored || Date.now() - stored.savedAt > CONSULT_RETENTION_MS) {
    return NextResponse.json({ error: 'not found' }, { status: 404 })
  }
  return NextResponse.json({ payload: stored.payload })
}
