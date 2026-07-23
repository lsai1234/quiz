import { NextResponse } from 'next/server'
import { constructWebhookEvent } from '@/lib/payments/stripe'
import { handleStripeEvent } from '@/lib/payments/webhook'

export const dynamic = 'force-dynamic'

/**
 * POST /api/webhooks/stripe
 * Verifies the signature against STRIPE_WEBHOOK_SECRET, then dispatches the
 * event. Raw body is required for signature verification, so we read req.text().
 */
export async function POST(req: Request) {
  const signature = req.headers.get('stripe-signature')
  if (!signature) return NextResponse.json({ error: 'Missing stripe-signature header' }, { status: 400 })

  const rawBody = await req.text()
  let event
  try {
    event = constructWebhookEvent(rawBody, signature)
  } catch (err) {
    console.error('[stripe webhook] signature verification failed:', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  try {
    const outcome = await handleStripeEvent(event)
    return NextResponse.json({ received: true, ...outcome })
  } catch (err) {
    console.error('[stripe webhook] handler error:', err)
    return NextResponse.json({ error: 'Webhook handler failed' }, { status: 500 })
  }
}
