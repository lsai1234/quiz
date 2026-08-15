import { NextResponse } from 'next/server'
import { requestPasswordReset } from '@/lib/auth/reset'

export const dynamic = 'force-dynamic'

/**
 * POST /api/auth/forgot-password
 * Body: { email } → { ok: true } | { error }
 *
 * **Answers the same way whatever happened.** Unknown address, known address,
 * an account that only uses Google, or one that has already asked three times
 * this hour — all `{ ok: true }`. A form that distinguishes them is a way to ask
 * this site whether a given person is a customer, and the honest-looking version
 * of that ("no account with that address") is the leak, not a courtesy.
 *
 * The single exception is a deployment with no email provider configured at all,
 * which is a fact about this server rather than about anybody's account, and
 * which the member needs to be told plainly — otherwise they wait forever for an
 * email that was never going to be sent. The sign-in screens hide the link
 * entirely in that case; this is the backstop for a request that arrives anyway.
 *
 * Residual: a request for a real address does more work than one for an unknown
 * address, so the response time differs by roughly the cost of a provider call.
 * Closing that properly means sending on a queue and answering immediately,
 * which is worth doing if this ever moves off serverless. It is a much weaker
 * signal than a body that just tells you.
 */
export async function POST(req: Request) {
  let body: { email?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const email = typeof body.email === 'string' ? body.email.trim() : ''
  if (!/\S+@\S+\.\S+/.test(email)) {
    // Shape, not existence — the same answer a typo would get anywhere else.
    return NextResponse.json({ error: 'Enter a valid email address' }, { status: 400 })
  }

  const outcome = await requestPasswordReset(email)

  if (outcome === 'unavailable') {
    return NextResponse.json(
      {
        error:
          'Password resets aren’t switched on yet. Get in touch and we’ll get you back into your account.',
      },
      { status: 503 },
    )
  }

  // Logged, never returned: which of these it was is exactly what the response
  // must not carry, and exactly what you need when resets stop arriving.
  if (outcome !== 'sent') console.warn(`[auth] password reset not sent: ${outcome}`)

  return NextResponse.json({ ok: true })
}
