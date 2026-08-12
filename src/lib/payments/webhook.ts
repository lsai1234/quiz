/**
 * Stripe webhook event handling — kept separate from the route so it can be
 * unit-tested by passing a constructed event (no signature dance).
 *
 * One-off (Phase 2):
 *   • checkout.session.completed (mode=payment) → mark the pending order paid.
 * Subscriptions (Phase 4):
 *   • checkout.session.completed (mode=subscription) → link the Stripe
 *     subscription/customer to the account and activate the stored bundle.
 *   • invoice.paid → raise a fulfilment order for that delivery (first + renewals),
 *     and advance the subscription clock on renewals (see lib/recharge/clock.ts).
 *     Stripe's invoice stream is the source of truth for how many cycles a member
 *     has actually paid for, which is what the cancel settlement is measured against.
 *   • customer.subscription.deleted → mark the member's subscription cancelled.
 *
 * All handlers are idempotent: orders key off the id passed in (order id or
 * `ord_inv_<invoiceId>`), so a redelivered event is a no-op.
 */
import type Stripe from 'stripe'
import { markOrderPaid, createSubscriptionOrder, failOrder, refundOrder } from '@/lib/orders/service'
import { getOrder, getOrderByPaymentIntent } from '@/lib/orders/repo'
import { queuePaymentFailedEmail } from '@/lib/notify/billing'
import { getSubscription, saveSubscription } from '@/lib/db/hub-data'
import { advanceCycle } from '@/lib/recharge/clock'
import { defaultCardFor } from './stripe'
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
  /**
   * Set when the event is ours but arrived before the state it needs.
   *
   * Stripe does not promise event ORDER, and a subscription's first
   * `invoice.paid` can land before the `checkout.session.completed` that links
   * the Stripe subscription to a user. Answering 200 to that would drop the
   * member's first box on the floor: nothing else ever raises it, and there is
   * no error anywhere to notice. The route turns this into a 5xx so Stripe
   * retries it, by which time the link exists.
   *
   * Only the FIRST invoice of a subscription sets it. A renewal for a
   * subscription we have never heard of is genuinely not ours — retrying that
   * for three days would be noise, not recovery.
   */
  retryable?: boolean
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
          // Stripe collects the delivery address once, here. Persist it on the
          // subscription — every future renewal raises a fulfilment order and
          // each one needs somewhere to ship to.
          const address = addressFromSession(session)
          if (address) sub.shippingAddress = address
          // The card they actually paid with, so the hub can stop claiming
          // everyone is on a Visa ending 4242.
          const card = await defaultCardFor(stripeSubscriptionId)
          if (card) sub.paymentMethod = card
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
        // What they ACTUALLY paid for delivery, including the Highlands rate if
        // they picked it. The order was raised with the mainland figure because
        // the session had to exist before they could choose.
        shipping: session.shipping_cost?.amount_total != null
          ? session.shipping_cost.amount_total / 100
          : undefined,
      })
      return { handled: true, type: event.type, orderId }
    }

    case 'invoice.paid': {
      const invoice = event.data.object as Stripe.Invoice & {
        subscription?: string | { id: string }
        billing_reason?: string | null
        payment_intent?: string | { id: string } | null
      }
      const stripeSubscriptionId = idOf(invoice.subscription)
      if (!stripeSubscriptionId) return { handled: false, type: event.type }
      // The first invoice of a subscription is the one that races the checkout
      // session — see `WebhookOutcome.retryable`.
      const isFirstInvoice = invoice.billing_reason === 'subscription_create'
      const userId = await userIdForStripeSubscription(stripeSubscriptionId)
      if (!userId) return { handled: false, type: event.type, retryable: isFirstInvoice }
      const sub = await getSubscription(userId)
      if (!sub) return { handled: false, type: event.type, userId, retryable: isFirstInvoice }

      // Idempotency: the fulfilment order is keyed by invoice id, so its prior
      // existence is our record of having already processed this invoice. Check
      // BEFORE raising it — the clock must move exactly once per paid cycle, and
      // a redelivered webhook that advanced it again would quietly shrink the
      // member's settlement.
      const orderId = `ord_inv_${invoice.id}`
      const alreadyProcessed = (await getOrder(orderId)) !== null

      const { getResolvedCatalogue } = await import('@/lib/catalogue/resolve')
      const { products } = await getResolvedCatalogue()
      const order = await createSubscriptionOrder({
        id: orderId,
        userId,
        email: sub.customerEmail,
        sub,
        catalogue: products,
        stripeSubscriptionId,
        /**
         * Which delivery this invoice pays for.
         *
         * The first invoice is the signup box, cycle 0. Every renewal is the
         * cycle AFTER the one the subscription is currently on, because the
         * clock is advanced further down this handler — reading
         * `sub.monthsActive` here without the +1 would raise every renewal as a
         * repeat of the signup box, which is exactly the shape of the
         * over-shipping bug this replaced.
         *
         * A redelivered invoice arriving after the clock moved would compute a
         * later cycle, but `createSubscriptionOrder` returns the existing order
         * before it gets here.
         */
        cycle: isFirstInvoice ? 0 : sub.monthsActive + 1,
        // Stripe's own figure for what this cycle cost, in major units. The
        // authoritative record of what the card was charged — intro coupon,
        // proration and all — and the half of the exit settlement that cannot be
        // reconstructed later from a plan whose price has since moved.
        billedAmount: typeof invoice.amount_paid === 'number' ? invoice.amount_paid / 100 : null,
        // Captured at signup and carried on the subscription, because Stripe
        // only asks for it once.
        shippingAddress: sub.shippingAddress ?? null,
        // The charge behind this invoice, so a refund from the Founders Hub
        // actually moves money instead of just relabelling the row.
        stripePaymentIntentId: idOf(invoice.payment_intent),
      })

      // A paid invoice clears any dunning flag: whatever went wrong before, the
      // money is in.
      let next = sub.billingStatus === 'past_due' ? { ...sub, billingStatus: 'ok' as const } : sub

      // Advance the subscription clock on RENEWALS only. The first invoice
      // (`subscription_create`) is the month already accounted for by
      // `monthsActive: 0` + the box that ships at signup, so counting it here
      // would bill the member's first month twice over in `paidToDateOf`.
      if (!alreadyProcessed && invoice.billing_reason === 'subscription_cycle') {
        next = advanceCycle(next)
      }
      if (next !== sub) await saveSubscription(userId, next)

      return { handled: true, type: event.type, userId, orderId: order.id }
    }

    case 'invoice.payment_failed': {
      // Stripe will retry on its own schedule and eventually give up. Until this
      // was handled we learned nothing until `customer.subscription.deleted`
      // arrived weeks later — the hub showed a healthy plan the whole time and
      // the member was never told, despite the outbox existing to tell them.
      const invoice = event.data.object as Stripe.Invoice & { subscription?: string | { id: string } }
      const stripeSubscriptionId = idOf(invoice.subscription)
      if (!stripeSubscriptionId) return { handled: false, type: event.type }
      const userId = await userIdForStripeSubscription(stripeSubscriptionId)
      if (!userId) return { handled: false, type: event.type }
      const sub = await getSubscription(userId)
      if (!sub || sub.billingStatus === 'past_due') return { handled: !!sub, type: event.type, userId }

      // The plan stays `active`: it is still theirs and still shipping while the
      // retries run. `billingStatus` is what says the money hasn't landed.
      await saveSubscription(userId, { ...sub, billingStatus: 'past_due' })
      // Keyed by INVOICE, not by subscription: Stripe retries the same invoice
      // several times (the `past_due` guard above already absorbs those), but a
      // separate dunning episode months later is a different invoice and does
      // need its own email.
      await queuePaymentFailedEmail(userId, sub, invoice.id)
      return { handled: true, type: event.type, userId }
    }

    case 'customer.subscription.updated': {
      // Mirror state changed anywhere OTHER than our hub — the Stripe dashboard,
      // the billing portal, or Stripe's own dunning. Without this the hub can
      // disagree with the thing that actually holds the card.
      const subscription = event.data.object as Stripe.Subscription & {
        pause_collection?: { behavior?: string } | null
      }
      const userId = await userIdForStripeSubscription(subscription.id)
      if (!userId) return { handled: false, type: event.type }
      const sub = await getSubscription(userId)
      if (!sub) return { handled: false, type: event.type }

      const next = { ...sub }
      if (subscription.status === 'canceled') next.status = 'cancelled'
      else if (subscription.pause_collection) next.status = 'paused'
      else if (subscription.status === 'active' && sub.status === 'paused') next.status = 'active'

      next.billingStatus =
        subscription.status === 'past_due' || subscription.status === 'unpaid' ? 'past_due' : 'ok'

      if (next.status !== sub.status || next.billingStatus !== sub.billingStatus) {
        await saveSubscription(userId, next)
      }
      return { handled: true, type: event.type, userId }
    }

    case 'checkout.session.expired': {
      // An abandoned one-off checkout. The order was pre-created as
      // `pending_payment` before the redirect, so without this it sits in the
      // orders list forever and quietly poisons any conversion metric built on
      // it. Subscription sessions have no pre-created order — nothing to close.
      const session = event.data.object as Stripe.Checkout.Session
      const orderId = session.client_reference_id ?? undefined
      if (!orderId) return { handled: false, type: event.type }
      const order = await getOrder(orderId)
      if (!order || order.status !== 'pending_payment') return { handled: false, type: event.type }
      await failOrder(orderId, 'Checkout session expired without payment')
      return { handled: true, type: event.type, orderId }
    }

    case 'charge.refunded': {
      // Money refunded from the Stripe dashboard rather than the Founders Hub.
      // Our ledger has to agree with Stripe's, whichever end the refund started.
      const charge = event.data.object as Stripe.Charge
      const paymentIntentId = idOf(charge.payment_intent)
      if (!paymentIntentId) return { handled: false, type: event.type }
      const order = await getOrderByPaymentIntent(paymentIntentId)
      if (!order || order.status === 'refunded') return { handled: false, type: event.type }
      await refundOrder(order.id, 'Refunded in Stripe')
      return { handled: true, type: event.type, orderId: order.id }
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
