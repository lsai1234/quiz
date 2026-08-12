import { NextResponse } from 'next/server'
import { getHubUser } from '@/lib/auth/session'
import { CheckoutRejected, finalizeCheckout } from '@/lib/checkout/finalize'
import { requestMetadata } from '@/lib/legal/consent'
import { resolveCheckoutCode } from '@/lib/partners/referral'
import type { CheckoutPayload } from '@/lib/checkout/types'

export const dynamic = 'force-dynamic'

/**
 * POST /api/checkout/finalize
 * Body: CheckoutPayload → { ok, checkoutUrl, mock } | 401
 * Used by the inline (email/password) checkout account gate once the member is
 * signed in: saves their bundle + quiz and returns the payment URL.
 */
export async function POST(req: Request) {
  const user = await getHubUser()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  let body: CheckoutPayload
  try {
    body = (await req.json()) as CheckoutPayload
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  if (!body?.subscription || !Array.isArray(body.subscription.lines)) {
    return NextResponse.json({ error: 'subscription is required' }, { status: 400 })
  }

  // What they typed, or failing that the code their link left in a cookie —
  // resolved here because a subscription can be finalized from a screen that
  // never rendered the code box.
  const payload: CheckoutPayload = { ...body, partnerCode: await resolveCheckoutCode(body.partnerCode) }

  const origin = process.env.APP_URL || req.headers.get('origin') || new URL(req.url).origin
  try {
    const result = await finalizeCheckout(user.id, user.email, payload, {
      origin,
      ...requestMetadata(req),
    })
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    // A missing or stale consent is the member's to fix, not a server fault.
    // The code and the versions we're serving go back with the sentence so the
    // browser can open the consent gate and re-submit against the right terms,
    // rather than dead-ending on a message about a box the member never saw.
    if (err instanceof CheckoutRejected) {
      return NextResponse.json(
        { error: err.message, code: err.code, versions: err.versions },
        { status: 400 },
      )
    }
    throw err
  }
}
