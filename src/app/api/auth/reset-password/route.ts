import { NextResponse } from 'next/server'
import { accountForResetToken, resetPasswordWithToken } from '@/lib/auth/reset'
import { startHubSession } from '@/lib/auth/session'
import { toPublicUser } from '@/lib/db/users'

export const dynamic = 'force-dynamic'

/**
 * GET  /api/auth/reset-password?token=… → whose link this is, without spending it.
 * POST /api/auth/reset-password          → spend it and set the password.
 *
 * The GET exists so the form can greet someone by name and fail early on a link
 * that has already gone stale. It deliberately does not consume the token — a
 * page load, or an email client prefetching the URL, must not be able to burn
 * somebody's only way back into their account.
 */
export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get('token') ?? ''
  const account = await accountForResetToken(token)
  if (!account) {
    return NextResponse.json(
      { error: 'That link has expired or has already been used. Ask for a new one.' },
      { status: 404 },
    )
  }
  return NextResponse.json({ name: account.name, email: account.email })
}

export async function POST(req: Request) {
  let body: { token?: unknown; password?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const token = typeof body.token === 'string' ? body.token : ''
  const password = typeof body.password === 'string' ? body.password : ''

  const result = await resetPasswordWithToken(token, password)
  if (!result.ok) return NextResponse.json({ error: result.reason }, { status: 400 })

  // Straight in. They have just proved they hold the mailbox and chosen a
  // password; making them type it again on the next screen is friction for
  // nothing. Every OTHER session was dropped a moment ago, so this is the only
  // one alive — including if somebody else was signed in as them.
  await startHubSession(result.user.id)
  return NextResponse.json({ ok: true, user: toPublicUser(result.user) })
}
