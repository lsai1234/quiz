import crypto from 'crypto'
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { kvSet } from '@/lib/db/kv'
import { PENDING_COOKIE, PENDING_KEY_PREFIX } from '@/lib/checkout/finalize'
import type { CheckoutPayload } from '@/lib/checkout/types'

export const dynamic = 'force-dynamic'

/**
 * POST /api/checkout/pending
 * Body: CheckoutPayload → { ok }
 * Stashes the pending subscription before an OAuth redirect (which loses client
 * state), keyed by a short-lived cookie token. `/api/checkout/continue` reads it
 * back once the member is signed in. No auth required — they're about to sign in.
 */
export async function POST(req: Request) {
  let body: CheckoutPayload
  try {
    body = (await req.json()) as CheckoutPayload
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  if (!body?.subscription || !Array.isArray(body.subscription.lines)) {
    return NextResponse.json({ error: 'subscription is required' }, { status: 400 })
  }

  const token = crypto.randomBytes(24).toString('base64url')
  await kvSet(PENDING_KEY_PREFIX + token, { payload: body, createdAt: Date.now() })

  const jar = await cookies()
  jar.set(PENDING_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 30 * 60,
    path: '/',
  })
  return NextResponse.json({ ok: true })
}
