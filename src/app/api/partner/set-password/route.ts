import { NextResponse } from 'next/server'
import { partnerForInvite, setPasswordWithToken, startPartnerSession } from '@/lib/partners/auth'

export const dynamic = 'force-dynamic'

/**
 * GET  /api/partner/set-password?token=… → whose link this is, without spending it.
 * POST /api/partner/set-password          → spend it and set the password.
 *
 * The GET exists so the form can greet someone by name before they type
 * anything. It deliberately does not consume the link: a page load must not be
 * able to burn an invite, or a preview fetch in an email client would lock the
 * partner out of their own account.
 */
export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get('token') ?? ''
  const partner = await partnerForInvite(token)
  if (!partner) return NextResponse.json({ error: 'That link has expired or has already been used.' }, { status: 404 })
  return NextResponse.json({ name: partner.name, email: partner.email })
}

export async function POST(req: Request) {
  let body: { token?: string; password?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }

  const result = await setPasswordWithToken(body.token ?? '', body.password ?? '')
  if (!result.ok) return NextResponse.json({ error: result.reason }, { status: 400 })

  // Straight in — they have just proved they hold the invite and chosen a
  // password; making them type it again immediately is friction for nothing.
  await startPartnerSession(result.partner.id)
  return NextResponse.json({ ok: true, name: result.partner.name })
}
