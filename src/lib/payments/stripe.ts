/**
 * Stripe payment layer.
 *
 * Server-only. Every checkout entry point goes through the payments resolver
 * (`./index.ts`) and only reaches here when Stripe is the effective source;
 * mock mode never touches the SDK. Prices are always passed in from the
 * catalogue server-side — the client's numbers are never trusted.
 */
import Stripe from 'stripe'

let _client: Stripe | null = null

export function getStripeClient(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) throw new Error('STRIPE_SECRET_KEY is not set — cannot use Stripe.')
  if (!_client) _client = new Stripe(key)
  return _client
}

export interface StripeLineInput {
  name: string
  /** Price per unit in major units (e.g. pounds); converted to minor units here. */
  unitPrice: number
  quantity: number
}

export interface CreateSessionOptions {
  lines: StripeLineInput[]
  /** Our order id — echoed back on the webhook to reconcile. */
  clientReferenceId: string
  customerEmail?: string | null
  currency?: string
  successUrl: string
  cancelUrl: string
  metadata?: Record<string, string>
}

/** Create a one-off Checkout Session and return its hosted URL. Guest-friendly:
 *  no account required; Stripe collects the email. */
export async function createCheckoutSession(opts: CreateSessionOptions): Promise<{ id: string; url: string | null }> {
  const stripe = getStripeClient()
  const currency = (opts.currency ?? 'gbp').toLowerCase()
  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    line_items: opts.lines.map((l) => ({
      quantity: l.quantity,
      price_data: {
        currency,
        unit_amount: Math.round(l.unitPrice * 100),
        product_data: { name: l.name },
      },
    })),
    client_reference_id: opts.clientReferenceId,
    customer_email: opts.customerEmail ?? undefined,
    // Collect a delivery address so the order can be dropshipped by the supplier.
    shipping_address_collection: { allowed_countries: ['GB'] },
    phone_number_collection: { enabled: true },
    success_url: opts.successUrl,
    cancel_url: opts.cancelUrl,
    metadata: opts.metadata,
  })
  return { id: session.id, url: session.url }
}

export interface CreateSubscriptionSessionOptions {
  /** The bundle's flat monthly total, in major units — billed as one recurring price. */
  monthlyTotal: number
  /** Our reference (the member's user id) — echoed back on the webhook. */
  clientReferenceId: string
  customerEmail?: string | null
  currency?: string
  successUrl: string
  cancelUrl: string
  metadata?: Record<string, string>
}

/**
 * Create a subscription Checkout Session billing a SINGLE monthly recurring
 * price equal to the bundle's flat monthly total. The bundle's contents live in
 * our `MemberSubscription` document (the source of truth); Stripe only holds the
 * billing schedule + payment method.
 */
export async function createSubscriptionSession(opts: CreateSubscriptionSessionOptions): Promise<{ id: string; url: string | null }> {
  const stripe = getStripeClient()
  const currency = (opts.currency ?? 'gbp').toLowerCase()
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency,
          unit_amount: Math.round(opts.monthlyTotal * 100),
          recurring: { interval: 'month' },
          product_data: { name: 'CHRGD Monthly Stack' },
        },
      },
    ],
    client_reference_id: opts.clientReferenceId,
    customer_email: opts.customerEmail ?? undefined,
    success_url: opts.successUrl,
    cancel_url: opts.cancelUrl,
    metadata: opts.metadata,
    subscription_data: opts.metadata ? { metadata: opts.metadata } : undefined,
  })
  return { id: session.id, url: session.url }
}

/** Open the Stripe billing portal so a member can manage their card / cancel. */
export async function createBillingPortalSession(customerId: string, returnUrl: string): Promise<{ url: string }> {
  const stripe = getStripeClient()
  const session = await stripe.billingPortal.sessions.create({ customer: customerId, return_url: returnUrl })
  return { url: session.url }
}

/** Verify + parse a webhook payload. Throws when the signature doesn't check out. */
export function constructWebhookEvent(rawBody: string, signature: string): Stripe.Event {
  const stripe = getStripeClient()
  const secret = process.env.STRIPE_WEBHOOK_SECRET
  if (!secret) throw new Error('STRIPE_WEBHOOK_SECRET is not set — cannot verify webhooks.')
  return stripe.webhooks.constructEvent(rawBody, signature, secret)
}

/** Refund a payment in full by its PaymentIntent id. */
export async function refundPayment(paymentIntentId: string): Promise<void> {
  const stripe = getStripeClient()
  await stripe.refunds.create({ payment_intent: paymentIntentId })
}
