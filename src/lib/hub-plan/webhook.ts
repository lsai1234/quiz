/**
 * Stripe events for the member hub on its own, handled before the box plans'
 * (`payments/webhook`). Returns null for anything that isn't a hub plan, so
 * the box handlers carry on exactly as before.
 *
 * Why this sits first: the box handlers treat every subscription event as the
 * box plan's. A box invoice raises a delivery, and a box cancellation ends the
 * box plan. A hub payment must never do either, so a hub plan's events are
 * claimed here: by the tag on the session and subscription (`plan: hub`), or
 * by the hub plan on record holding that Stripe subscription.
 */
import type Stripe from 'stripe'
import { HUB_PLAN_TAG } from '@/lib/payments/stripe'
import type { WebhookOutcome } from '@/lib/payments/webhook'
import type { HubPlan } from './plan'
import { getHubPlan, hubPlanForStripeSubscription, saveHubPlan } from './store'

const idOf = (ref: string | { id: string } | null | undefined): string | undefined => (!ref ? undefined : typeof ref === 'string' ? ref : ref.id)

type Meta = Record<string, string> | null | undefined
const isHub = (m: Meta) => m?.plan === HUB_PLAN_TAG

/** An invoice's subscription and its metadata, at either API shape. */
function invoiceSubscription(invoice: Stripe.Invoice): { id?: string; metadata: Meta } {
  const i = invoice as unknown as {
    subscription?: string | { id: string } | null
    subscription_details?: { metadata?: Meta } | null
    parent?: { subscription_details?: { subscription?: string | { id: string } | null; metadata?: Meta } | null } | null
  }
  return {
    id: idOf(i.parent?.subscription_details?.subscription ?? i.subscription ?? undefined),
    metadata: i.parent?.subscription_details?.metadata ?? i.subscription_details?.metadata ?? null,
  }
}

/** The charge behind an invoice, at either API shape. */
function paymentIntentOf(invoice: Stripe.Invoice): string | null {
  const i = invoice as unknown as {
    payment_intent?: string | { id: string } | null
    payments?: { data?: { payment?: { payment_intent?: string | { id: string } | null } }[] }
  }
  return idOf(i.payment_intent ?? i.payments?.data?.[0]?.payment?.payment_intent ?? undefined) ?? null
}

/** When the month this invoice paid for ends, from its line. */
function periodEndOf(invoice: Stripe.Invoice): string | null {
  const end = invoice.lines?.data?.[0]?.period?.end
  return typeof end === 'number' ? new Date(end * 1000).toISOString() : null
}

async function planFor(stripeSubscriptionId: string | undefined, metadata: Meta): Promise<HubPlan | null> {
  if (isHub(metadata) && metadata?.userId) return getHubPlan(metadata.userId)
  if (!stripeSubscriptionId) return null
  return hubPlanForStripeSubscription(stripeSubscriptionId)
}

export async function handleHubPlanEvent(event: Stripe.Event, now = new Date()): Promise<WebhookOutcome | null> {
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session
      if (session.mode !== 'subscription' || !isHub(session.metadata)) return null
      const userId = session.client_reference_id ?? session.metadata?.userId
      const stripeSubscriptionId = idOf(session.subscription as string | { id: string } | null)
      if (!userId || !stripeSubscriptionId) return { handled: false, type: event.type }
      const { linkStripeSubscription } = await import('@/lib/payments/subscription-link')
      await linkStripeSubscription(stripeSubscriptionId, userId)
      const { activateHubPlan } = await import('./server')
      const plan = await activateHubPlan(
        userId,
        { stripeSubscriptionId, stripeCustomerId: idOf(session.customer as string | { id: string } | null) ?? null, email: session.customer_details?.email ?? null },
        now,
      )
      return { handled: Boolean(plan), type: event.type, userId }
    }

    case 'invoice.paid': {
      const invoice = event.data.object as Stripe.Invoice
      const { id, metadata } = invoiceSubscription(invoice)
      const plan = await planFor(id, metadata)
      if (!plan) return isHub(metadata) ? { handled: false, type: event.type } : null
      const paid = typeof invoice.amount_paid === 'number' && invoice.amount_paid > 0
      const periodEnd = periodEndOf(invoice)
      const next: HubPlan = {
        ...plan,
        stripeSubscriptionId: plan.stripeSubscriptionId ?? id ?? null,
        pastDue: false,
        ...(paid ? { lastPaymentIntentId: paymentIntentOf(invoice) ?? plan.lastPaymentIntentId } : {}),
        // A paid month runs to the end of its period; a £0 invoice opens free days that end there too.
        ...(periodEnd && plan.status === 'active' ? { nextChargeAt: periodEnd } : {}),
        ...(paid && plan.freeUntil && Date.parse(plan.freeUntil) <= now.getTime() ? { freeUntil: null } : {}),
      }
      await saveHubPlan(next, now)
      return { handled: true, type: event.type, userId: plan.userId }
    }

    case 'invoice.payment_failed': {
      const invoice = event.data.object as Stripe.Invoice
      const { id, metadata } = invoiceSubscription(invoice)
      const plan = await planFor(id, metadata)
      if (!plan) return isHub(metadata) ? { handled: false, type: event.type } : null
      if (!plan.pastDue) await saveHubPlan({ ...plan, pastDue: true }, now)
      return { handled: true, type: event.type, userId: plan.userId }
    }

    case 'customer.subscription.updated': {
      const s = event.data.object as Stripe.Subscription & { current_period_end?: number | null }
      const plan = await planFor(s.id, s.metadata)
      if (!plan) return isHub(s.metadata) ? { handled: false, type: event.type } : null
      const end = s.cancel_at ?? s.items?.data?.[0]?.current_period_end ?? s.current_period_end ?? null
      const next: HubPlan = { ...plan, pastDue: s.status === 'past_due' || s.status === 'unpaid' }
      if (s.status === 'canceled') Object.assign(next, { status: 'cancelled', nextChargeAt: null, endsAt: plan.endsAt ?? now.toISOString() })
      else if (s.cancel_at_period_end || s.cancel_at) Object.assign(next, { status: 'cancelling', endsAt: end ? new Date(end * 1000).toISOString() : plan.endsAt, cancelledAt: plan.cancelledAt ?? now.toISOString() })
      else if (plan.status === 'cancelling' && (s.status === 'active' || s.status === 'trialing')) Object.assign(next, { status: 'active', endsAt: null, cancelledAt: null })
      await saveHubPlan(next, now)
      return { handled: true, type: event.type, userId: plan.userId }
    }

    case 'customer.subscription.deleted': {
      const s = event.data.object as Stripe.Subscription
      const plan = await planFor(s.id, s.metadata)
      if (!plan) return isHub(s.metadata) ? { handled: false, type: event.type } : null
      if (plan.status !== 'cancelled') {
        await saveHubPlan({ ...plan, status: 'cancelled', nextChargeAt: null, endsAt: plan.endsAt && Date.parse(plan.endsAt) < now.getTime() ? plan.endsAt : now.toISOString(), cancelledAt: plan.cancelledAt ?? now.toISOString() }, now)
      }
      return { handled: true, type: event.type, userId: plan.userId }
    }

    default:
      return null
  }
}
