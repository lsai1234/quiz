import { NextResponse } from 'next/server'
import { getHubUser } from '@/lib/auth/session'
import { finalizeCheckout } from '@/lib/checkout/finalize'
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

  const origin = process.env.APP_URL || req.headers.get('origin') || new URL(req.url).origin
  const result = await finalizeCheckout(user.id, user.email, body, origin)
  return NextResponse.json({ ok: true, ...result })
}
