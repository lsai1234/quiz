import { NextResponse } from 'next/server'
import { createUser, getUserByEmail, toPublicUser } from '@/lib/db/users'
import { hashPassword, passwordProblem } from '@/lib/auth/password'
import { startHubSession } from '@/lib/auth/session'
import { linkAccountAddress } from '@/lib/audience/buyers'

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
  const weak = passwordProblem(password)
  if (weak) return NextResponse.json({ error: weak }, { status: 400 })
  if (await getUserByEmail(email)) {
    return NextResponse.json(
      { error: 'An account with that email already exists — sign in instead' },
      { status: 409 },
    )
  }

  const user = await createUser({ email, name, passwordHash: hashPassword(password) })
  await startHubSession(user.id)
  // An address we already hold from the quiz becomes this account's address —
  // one row, one preference, however it arrived. Signing up is NOT itself a
  // marketing permission: that comes from a tick or from an order.
  await linkAccountAddress(user.email, user.id)
  return NextResponse.json({ ok: true, user: toPublicUser(user) })
}
