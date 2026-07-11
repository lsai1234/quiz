import { NextResponse } from 'next/server'
import { createUser, getUserByEmail, toPublicUser } from '@/lib/db/users'
import { hashPassword } from '@/lib/auth/password'
import { startHubSession } from '@/lib/auth/session'

const MIN_PASSWORD_LENGTH = 8

/**
 * POST /api/auth/signup
 * Body: { email, password, name? } → { ok, user } | { error }
 * Creates a customer account and signs it in (sets the hub_session cookie).
 */
export async function POST(req: Request) {
  let body: { email?: unknown; password?: unknown; name?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  const password = typeof body.password === 'string' ? body.password : ''
  const name = typeof body.name === 'string' ? body.name : undefined

  if (!/\S+@\S+\.\S+/.test(email)) {
    return NextResponse.json({ error: 'Enter a valid email address' }, { status: 400 })
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return NextResponse.json(
      { error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` },
      { status: 400 },
    )
  }
  if (await getUserByEmail(email)) {
    return NextResponse.json(
      { error: 'An account with that email already exists — sign in instead' },
      { status: 409 },
    )
  }

  const user = await createUser({ email, name, passwordHash: hashPassword(password) })
  await startHubSession(user.id)
  return NextResponse.json({ ok: true, user: toPublicUser(user) })
}
