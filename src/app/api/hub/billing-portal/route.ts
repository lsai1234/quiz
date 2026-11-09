import { NextResponse } from 'next/server'
import { getHubUser } from '@/lib/auth/session'
import { getSubscription } from '@/lib/db/hub-data'
import { getPaymentSource } from '@/lib/payments'
import { syncPortalRuntime } from '@/lib/portal/store'

export const dynamic = 'force-dynamic'

/**
 * POST /api/hub/billing-portal → { url } | { error }
 * Opens the Stripe billing portal for the member to manage their card / cancel.
 * Only available once they've checked out via Stripe (we have a customer id).
 */
export async function POST(req: Request) {
  const user = await getHubUser()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  await syncPortalRuntime()

  if (getPaymentSource() !== 'stripe') {
    return NextResponse.json({ error: 'Billing portal is only available with Stripe payments enabled.' }, { status: 400 })
  }
  // `{ plan: 'hub' }`: the card on the hub membership (`lib/hub-plan`), else the box plan's.
  const body = (await req.json().catch(() => null)) as { plan?: unknown } | null
  let customerId: string | null = null
  if (body?.plan === 'hub') {
    const { getHubPlan } = await import('@/lib/hub-plan/store')
    customerId = (await getHubPlan(user.id))?.stripeCustomerId ?? null
  } else {
    customerId = (await getSubscription(user.id))?.stripeCustomerId ?? null
  }
  if (!customerId) {
    return NextResponse.json({ error: 'No Stripe customer on file for this account yet.' }, { status: 400 })
  }

  const origin = process.env.APP_URL || req.headers.get('origin') || new URL(req.url).origin
  try {
    const { createBillingPortalSession } = await import('@/lib/payments/stripe')
    const { url } = await createBillingPortalSession(customerId, `${origin}/myhub`)
    return NextResponse.json({ url })
  } catch (err) {
    console.error('[billing-portal] failed:', err)
    return NextResponse.json({ error: 'Could not open the billing portal.' }, { status: 502 })
  }
}
