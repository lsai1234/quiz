/**
 * Stripe webhook event handling — kept separate from the route so it can be
 * unit-tested by passing a constructed event (no signature dance).
 *
 * Phase 2 handles the one-off payment: `checkout.session.completed` marks the
 * pre-created pending order paid, keyed by `client_reference_id` (our order id),
 * which makes it idempotent — a redelivered event finds the order already paid
 * and does nothing. Subscription events (`invoice.paid`, etc.) arrive in Phase 4.
 */
import type Stripe from 'stripe'
import { markOrderPaid } from '@/lib/orders/service'

export interface WebhookOutcome {
  handled: boolean
  type: string
  orderId?: string
}

export async function handleStripeEvent(event: Stripe.Event): Promise<WebhookOutcome> {
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session
      const orderId = session.client_reference_id ?? undefined
      if (!orderId) return { handled: false, type: event.type }
      const paymentIntentId =
        typeof session.payment_intent === 'string'
          ? session.payment_intent
          : session.payment_intent?.id
      const email = session.customer_details?.email ?? session.customer_email ?? undefined
      await markOrderPaid(orderId, {
        stripeSessionId: session.id,
        stripePaymentIntentId: paymentIntentId ?? undefined,
        email,
      })
      return { handled: true, type: event.type, orderId }
    }
    default:
      return { handled: false, type: event.type }
  }
}
