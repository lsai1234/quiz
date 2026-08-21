import { NextResponse } from 'next/server'
import { getUserByEmail, toPublicUser } from '@/lib/db/users'
import { verifyPassword } from '@/lib/auth/password'
import { startHubSession } from '@/lib/auth/session'
import { linkAccountAddress } from '@/lib/audience/buyers'

/**
 * POST /api/auth/login
 * Body: { email, password } → { ok, user } | { error }
 * Verifies credentials and sets the hub_session cookie.
 */
export async function POST(req: Request) {
  let body: { email?: unknown; password?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const email = typeof body.email === 'string' ? body.email : ''
  const password = typeof body.password === 'string' ? body.password : ''

  const user = email ? await getUserByEmail(email) : null
  // Generic error for wrong email / wrong password; the one exception is a
  // Google-only account, where "wrong password" would strand the member.
  if (!user || !verifyPassword(password, user.passwordHash)) {
    const hint =
      user && !user.passwordHash
        ? 'This account uses Google sign-in — use "Continue with Google"'
        : 'Incorrect email or password'
    return NextResponse.json({ error: hint }, { status: 401 })
  }

  await startHubSession(user.id)
  // Somebody who took the quiz first and made an account weeks later is one
  // person: tying the address to the account here is what keeps a single
  // marketing preference governing both. Never blocks a sign-in.
  await linkAccountAddress(user.email, user.id)
  return NextResponse.json({ ok: true, user: toPublicUser(user) })
}
