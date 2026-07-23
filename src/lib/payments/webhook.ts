/**
 * Stripe webhook event handling — kept separate from the route so it can be
 * unit-tested by passing a constructed event (no signature dance).
 *
 * One-off (Phase 2):
 *   • checkout.session.completed (mode=payment) → mark the pending order paid.
 * Subscriptions (Phase 4):
 *   • checkout.session.completed (mode=subscription) → link the Stripe
 *     subscription/customer to the account and activate the stored bundle.
 *   • invoice.paid → raise a fulfilment order for that delivery (first + renewals).
 *   • customer.subscription.deleted → mark the member's subscription cancelled.
 *
 * All handlers are idempotent: orders key off the id passed in (order id or
 * `ord_inv_<invoiceId>`), so a redelivered event is a no-op.
 */
import type Stripe from 'stripe'
import { markOrderPaid, createSubscriptionOrder } from '@/lib/orders/service'
import { getSubscription, saveSubscription } from '@/lib/db/hub-data'
import { linkStripeSubscription, userIdForStripeSubscription } from './subscription-link'
import type { SupplierAddress } from '@/lib/supplier/types'

/** Pull the delivery address out of a completed Checkout Session, tolerant of
 *  Stripe API-version differences in where it lives. */
function addressFromSession(session: Stripe.Checkout.Session): SupplierAddress | null {
  // `shipping_details` (older) or `collected_information.shipping_details` (newer);
  // fall back to the billing address on customer_details.
  const s = session as unknown as {
    shipping_details?: { name?: string | null; address?: Record<string, string | null> | null }
    collected_information?: { shipping_details?: { name?: string | null; address?: Record<string, string | null> | null } }
  }
  const shipping = s.shipping_details ?? s.collected_information?.shipping_details
  const address = shipping?.address ?? session.customer_details?.address ?? null
  if (!address) return null
  return {
    name: shipping?.name ?? session.customer_details?.name ?? 'Customer',
    line1: address.line1 ?? '',
    line2: address.line2 ?? null,
    city: address.city ?? '',
    postcode: address.postal_code ?? '',
    country: address.country ?? 'GB',
    phone: session.customer_details?.phone ?? null,
  }
}

export interface WebhookOutcome {
  handled: boolean
  type: string
  orderId?: string
  userId?: string
}

function idOf(ref: string | { id: string } | null | undefined): string | undefined {
  if (!ref) return undefined
  return typeof ref === 'string' ? ref : ref.id
}

export async function handleStripeEvent(event: Stripe.Event): Promise<WebhookOutcome> {
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session

      // ── Subscription checkout: link Stripe ids to the account + activate ──
      if (session.mode === 'subscription') {
        const userId = session.client_reference_id ?? undefined
        const stripeSubscriptionId = idOf(session.subscription)
        const stripeCustomerId = idOf(session.customer)
        if (!userId || !stripeSubscriptionId) return { handled: false, type: event.type }
        await linkStripeSubscription(stripeSubscriptionId, userId)
        const sub = await getSubscription(userId)
        if (sub) {
          sub.status = 'active'
          sub.stripeSubscriptionId = stripeSubscriptionId
          if (stripeCustomerId) sub.stripeCustomerId = stripeCustomerId
          await saveSubscription(userId, sub)
        }
        return { handled: true, type: event.type, userId }
      }

      // ── One-off payment: mark the pre-created order paid ──
      const orderId = session.client_reference_id ?? undefined
      if (!orderId) return { handled: false, type: event.type }
      const paymentIntentId = idOf(session.payment_intent)
      const email = session.customer_details?.email ?? session.customer_email ?? undefined
      await markOrderPaid(orderId, {
        stripeSessionId: session.id,
        stripePaymentIntentId: paymentIntentId,
        email,
        shippingAddress: addressFromSession(session),
      })
      return { handled: true, type: event.type, orderId }
    }

    case 'invoice.paid': {
      const invoice = event.data.object as Stripe.Invoice & { subscription?: string | { id: string } }
      const stripeSubscriptionId = idOf(invoice.subscription)
      if (!stripeSubscriptionId) return { handled: false, type: event.type }
      const userId = await userIdForStripeSubscription(stripeSubscriptionId)
      if (!userId) return { handled: false, type: event.type }
      const sub = await getSubscription(userId)
      if (!sub) return { handled: false, type: event.type }

      const { getResolvedCatalogue } = await import('@/lib/catalogue/resolve')
      const { products } = await getResolvedCatalogue()
      const order = await createSubscriptionOrder({
        id: `ord_inv_${invoice.id}`,
        userId,
        email: sub.customerEmail,
        sub,
        catalogue: products,
        stripeSubscriptionId,
      })
      return { handled: true, type: event.type, userId, orderId: order.id }
    }

    case 'customer.subscription.deleted': {
      const subscription = event.data.object as Stripe.Subscription
      const userId = await userIdForStripeSubscription(subscription.id)
      if (!userId) return { handled: false, type: event.type }
      const sub = await getSubscription(userId)
      if (sub && sub.status !== 'cancelled') {
        sub.status = 'cancelled'
        await saveSubscription(userId, sub)
      }
      return { handled: true, type: event.type, userId }
    }

    default:
      return { handled: false, type: event.type }
  }
}
