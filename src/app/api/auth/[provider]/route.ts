import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getProvider } from '@/lib/auth/providers'
import {
  STATE_COOKIE,
  VERIFIER_COOKIE,
  RETURN_COOKIE,
  resolveOrigin,
  randomToken,
  pkcePair,
  safeReturnPath,
} from '@/lib/auth/providers/common'

/**
 * GET /api/auth/<provider>?returnTo=/path — starts an OAuth sign-in.
 * Sets short-lived state (CSRF), PKCE verifier (X) and return-path cookies,
 * then redirects to the provider's consent screen. Works for both the hub and
 * the checkout account gate via `returnTo`.
 */
export async function GET(req: Request, ctx: { params: Promise<{ provider: string }> }) {
  const { provider: id } = await ctx.params
  const provider = getProvider(id)
  if (!provider || !provider.configured()) {
    return NextResponse.json({ error: 'Unknown or unconfigured provider' }, { status: 404 })
  }

  const origin = resolveOrigin(req.url)
  const state = randomToken()
  const returnTo = safeReturnPath(new URL(req.url).searchParams.get('returnTo'))

  const secure = process.env.NODE_ENV === 'production'
  const jar = await cookies()
  const base = { httpOnly: true, secure, sameSite: 'lax' as const, maxAge: 10 * 60, path: '/' }
  jar.set(STATE_COOKIE, `${id}:${state}`, base)
  jar.set(RETURN_COOKIE, returnTo, base)

  let codeChallenge: string | undefined
  if (provider.usesPKCE) {
    const { verifier, challenge } = pkcePair()
    codeChallenge = challenge
    jar.set(VERIFIER_COOKIE, verifier, base)
  }

  return NextResponse.redirect(provider.authUrl({ origin, state, codeChallenge }))
}
