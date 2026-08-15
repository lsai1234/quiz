import { NextResponse } from 'next/server'
import { requestPartnerPasswordReset } from '@/lib/partners/auth'

export const dynamic = 'force-dynamic'

/**
 * POST /api/partner/forgot-password
 * Body: { email } → { ok: true } | { error }
 *
 * The partner twin of `/api/auth/forgot-password`, and it answers the same way:
 * one response for an unknown address, a known one, a suspended account and one
 * over its throttle. Which addresses are partners of ours is commercially
 * interesting information, and this form must not be a way to ask.
 *
 * The link lands on `/partner/set-password`, the page that already existed for
 * invites — a reset and an invite are the same act with different wording, and
 * the page burns the token either way.
 */
export async function POST(req: Request) {
  let body: { email?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }

  const email = typeof body.email === 'string' ? body.email.trim() : ''
  if (!/\S+@\S+\.\S+/.test(email)) {
    return NextResponse.json({ error: 'Enter a valid email address' }, { status: 400 })
  }

  const outcome = await requestPartnerPasswordReset(email)

  if (outcome === 'unavailable') {
    return NextResponse.json(
      { error: 'Password resets aren’t switched on yet. Email us and we’ll send you a link.' },
      { status: 503 },
    )
  }

  if (outcome !== 'sent') console.warn(`[partner] password reset not sent: ${outcome}`)

  return NextResponse.json({ ok: true })
}
