import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getProvider } from '@/lib/auth/providers'
import {
  STATE_COOKIE,
  VERIFIER_COOKIE,
  RETURN_COOKIE,
  resolveOrigin,
  safeReturnPath,
} from '@/lib/auth/providers/common'
import { upsertOAuthUser } from '@/lib/db/users'
import { startHubSession } from '@/lib/auth/session'

/**
 * Completes an OAuth sign-in. Verifies the state cookie, exchanges the code for
 * the user's profile, finds-or-creates the account (linking by verified email),
 * starts the session, and redirects to the stored return path. On any failure
 * it lands on the return path with `?auth_error=<provider>`.
 *
 * Apple posts back (form_post) → POST handler; everyone else → GET.
 */
async function complete(req: Request, id: string, params: URLSearchParams, form?: Record<string, string>) {
  const origin = resolveOrigin(req.url)
  const jar = await cookies()
  const returnTo = safeReturnPath(jar.get(RETURN_COOKIE)?.value)
  const fail = NextResponse.redirect(`${origin}${returnTo}${returnTo.includes('?') ? '&' : '?'}auth_error=${id}`)

  const provider = getProvider(id)
  const stateCookie = jar.get(STATE_COOKIE)?.value
  const codeVerifier = jar.get(VERIFIER_COOKIE)?.value

  // Clear the one-shot cookies regardless of outcome.
  for (const name of [STATE_COOKIE, VERIFIER_COOKIE, RETURN_COOKIE]) jar.delete(name)

  if (!provider || !provider.configured()) return fail

  const code = params.get('code')
  const state = params.get('state')
  if (!code || !state || stateCookie !== `${id}:${state}`) return fail

  const profile = await provider.exchange({ origin, code, codeVerifier, form })
  if (!profile) return fail

  const user = await upsertOAuthUser(profile)
  await startHubSession(user.id)
  return NextResponse.redirect(`${origin}${returnTo}`)
}

export async function GET(req: Request, ctx: { params: Promise<{ provider: string }> }) {
  const { provider } = await ctx.params
  return complete(req, provider, new URL(req.url).searchParams)
}

export async function POST(req: Request, ctx: { params: Promise<{ provider: string }> }) {
  const { provider } = await ctx.params
  const body = await req.formData()
  const form: Record<string, string> = {}
  const params = new URLSearchParams()
  for (const [key, value] of body.entries()) {
    if (typeof value === 'string') {
      form[key] = value
      params.set(key, value)
    }
  }
  return complete(req, provider, params, form)
}
