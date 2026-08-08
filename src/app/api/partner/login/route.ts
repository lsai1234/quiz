import { NextResponse } from 'next/server'
import { login, startPartnerSession } from '@/lib/partners/auth'

export const dynamic = 'force-dynamic'

/**
 * POST /api/partner/login
 *
 * Every failure answers the same way — see `login`. Distinguishing "no such
 * partner" from "wrong password" would tell anyone who asks which of our
 * partners exist.
 */
export async function POST(req: Request) {
  let body: { email?: string; password?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }

  const result = await login(body.email ?? '', body.password ?? '')
  if (!result.ok) return NextResponse.json({ error: result.reason }, { status: 401 })

  await startPartnerSession(result.partner.id)
  return NextResponse.json({ ok: true, name: result.partner.name })
}
