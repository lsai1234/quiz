import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import {
  GOOGLE_STATE_COOKIE,
  exchangeGoogleCode,
  isGoogleConfigured,
  resolveOrigin,
} from '@/lib/auth/google'
import { createUser, getUserByEmail, getUserByGoogleSub, linkGoogle } from '@/lib/db/users'
import { startHubSession } from '@/lib/auth/session'

/**
 * GET /api/auth/google/callback — completes Google sign-in.
 * Verifies the state cookie, exchanges the code, then finds-or-creates the
 * account: match on Google subject first, else link to an existing
 * email+password account with the same (verified) email, else create a fresh
 * user. Ends signed in at /hub; errors land on /hub?auth_error=google.
 */
export async function GET(req: Request) {
  const origin = resolveOrigin(req.url)
  const failure = NextResponse.redirect(`${origin}/hub?auth_error=google`)
  if (!isGoogleConfigured()) return failure

  const { searchParams } = new URL(req.url)
  const code = searchParams.get('code')
  const state = searchParams.get('state')

  const jar = await cookies()
  const expectedState = jar.get(GOOGLE_STATE_COOKIE)?.value
  jar.delete(GOOGLE_STATE_COOKIE)
  if (!code || !state || !expectedState || state !== expectedState) return failure

  const profile = await exchangeGoogleCode(origin, code)
  if (!profile) return failure

  let user = await getUserByGoogleSub(profile.sub)
  if (!user) {
    // Only link by email when Google has verified it — otherwise anyone could
    // claim an unverified address and take over the matching account.
    const existing = profile.emailVerified ? await getUserByEmail(profile.email) : null
    if (existing) {
      await linkGoogle(existing.id, profile.sub, profile.picture)
      user = existing
    } else {
      user = await createUser({
        email: profile.email,
        name: profile.name,
        googleSub: profile.sub,
        picture: profile.picture,
      })
    }
  }

  await startHubSession(user.id)
  return NextResponse.redirect(`${origin}/hub`)
}
