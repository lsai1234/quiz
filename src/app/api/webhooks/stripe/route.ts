import { NextResponse } from 'next/server'
import { constructWebhookEvent } from '@/lib/payments/stripe'
import { getStripeEnvironment, stripeKeysFor } from '@/lib/payments'
import { handleStripeEvent } from '@/lib/payments/webhook'
import { reportError } from '@/lib/monitoring/report'

export const dynamic = 'force-dynamic'

/**
 * POST /api/webhooks/stripe
 * Verifies the signature against the signing secret of the *selected* Stripe
 * environment (see `lib/payments/keys.ts`), then dispatches the event. Raw body
 * is required for signature verification, so we read req.text().
 *
 * Every failure path here is reported at `critical`, and none of them would be
 * caught by `instrumentation.ts`: each one is handled, so nothing throws out of
 * the request and the framework sees a perfectly ordinary response. That is
 * precisely what makes this route dangerous. A webhook that fails quietly means
 * a customer has been charged for an order the business has no record of, and
 * the only outward sign is an order sitting at `pending_payment` — which is why
 * `health.ts` counts those too.
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
    // Almost always a stale or wrong signing secret — the classic go-live
    // mistake, since test and live endpoints have different ones. Until it is
    // fixed *no* payment is ever recorded, so it is as critical as a failure
    // gets, even though the route is behaving correctly by rejecting it.
    //
    // The environment is in the context because the likeliest cause, right after
    // the test/live switch is flipped, is an endpoint still pointed at the world
    // we just left — and `constructWebhookEvent` says so in the message when it
    // can prove it.
    const environment = getStripeEnvironment()
    await reportError(err, {
      surface: 'webhook',
      severity: 'critical',
      path: '/api/webhooks/stripe',
      context: {
        stage: 'signature-verification',
        environment,
        hasSecret: stripeKeysFor(environment).webhookSecret !== null,
      },
    })
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  try {
    const outcome = await handleStripeEvent(event)
    // An event we own that arrived before the state it needs (Stripe does not
    // promise ordering). A 200 here would retire it for good; a 503 puts it back
    // on Stripe's retry schedule, which is the only thing that recovers it.
    if (outcome.retryable) {
      console.warn(`[stripe webhook] ${event.type} arrived early — asking Stripe to retry`)
      return NextResponse.json({ received: false, retry: true, ...outcome }, { status: 503 })
    }
    return NextResponse.json({ received: true, ...outcome })
  } catch (err) {
    console.error('[stripe webhook] handler error:', err)
    await reportError(err, {
      surface: 'webhook',
      severity: 'critical',
      path: '/api/webhooks/stripe',
      context: { stage: 'handler', eventType: event.type, eventId: event.id },
    })
    return NextResponse.json({ error: 'Webhook handler failed' }, { status: 500 })
  }
}
