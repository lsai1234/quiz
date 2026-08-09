import { NextResponse } from 'next/server'
import { getHubUser } from '@/lib/auth/session'
import { getSubscription } from '@/lib/db/hub-data'
import { getPaymentSource } from '@/lib/payments'

export const dynamic = 'force-dynamic'

/**
 * POST /api/hub/billing-portal → { url } | { error }
 * Opens the Stripe billing portal for the member to manage their card / cancel.
 * Only available once they've checked out via Stripe (we have a customer id).
 */
export async function POST(req: Request) {
  const user = await getHubUser()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  if (getPaymentSource() !== 'stripe') {
    return NextResponse.json({ error: 'Billing portal is only available with Stripe payments enabled.' }, { status: 400 })
  }
  const sub = await getSubscription(user.id)
  if (!sub?.stripeCustomerId) {
    return NextResponse.json({ error: 'No Stripe customer on file for this account yet.' }, { status: 400 })
  }

  const origin = process.env.APP_URL || req.headers.get('origin') || new URL(req.url).origin
  try {
    const { createBillingPortalSession } = await import('@/lib/payments/stripe')
    const { url } = await createBillingPortalSession(sub.stripeCustomerId, `${origin}/myhub`)
    return NextResponse.json({ url })
  } catch (err) {
    console.error('[billing-portal] failed:', err)
    return NextResponse.json({ error: 'Could not open the billing portal.' }, { status: 502 })
  }
}
