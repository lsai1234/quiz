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
  /**
   * First-month intro discount (0–1) the member claimed at checkout. Applied as
   * a one-cycle Stripe coupon, so month one is discounted and every month after
   * bills at `monthlyTotal`. Omit or 0 for no intro.
   */
  introDiscountRate?: number
}

/**
 * Get (or lazily create) the one-cycle coupon for a whole-percent discount.
 *
 * Coupons are reused by deterministic id — `duration: 'once'` means Stripe
 * applies them to the first invoice of a subscription only, which is exactly
 * the intro-offer shape, and one coupon per rate serves every member who lands
 * on that rate. Rates are rounded to whole percents because that's the
 * granularity `percent_off` accepts.
 */
async function getOrCreateFirstMonthCoupon(rate: number): Promise<string | null> {
  const percent = Math.round(rate * 100)
  if (percent <= 0 || percent > 100) return null
  const stripe = getStripeClient()
  const id = `chrgd-first-month-${percent}`
  try {
    await stripe.coupons.retrieve(id)
    return id
  } catch {
    // Not there yet (or not readable) — create it. A concurrent create losing
    // the race throws "already exists", which means the coupon is there anyway.
    try {
      await stripe.coupons.create({
        id,
        percent_off: percent,
        duration: 'once',
        name: `First month ${percent}% off`,
      })
      return id
    } catch (err) {
      console.error(`[stripe] could not create coupon ${id}:`, err)
      return null
    }
  }
}

/**
 * Create a subscription Checkout Session billing a SINGLE monthly recurring
 * price equal to the bundle's flat monthly total. The bundle's contents live in
 * our `MemberSubscription` document (the source of truth); Stripe only holds the
 * billing schedule + payment method.
 *
 * A claimed first-month discount rides along as a one-cycle coupon. If the
 * coupon can't be resolved the session is still created at full price rather
 * than dead-ending the member — they'd be owed the difference, so this logs
 * loudly.
 */
export async function createSubscriptionSession(opts: CreateSubscriptionSessionOptions): Promise<{ id: string; url: string | null }> {
  const stripe = getStripeClient()
  const currency = (opts.currency ?? 'gbp').toLowerCase()
  const rate = opts.introDiscountRate ?? 0
  const coupon = rate > 0 ? await getOrCreateFirstMonthCoupon(rate) : null
  if (rate > 0 && !coupon) {
    console.error(`[stripe] intro discount of ${Math.round(rate * 100)}% could not be applied — billing at full price.`)
  }
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
    discounts: coupon ? [{ coupon }] : undefined,
    success_url: opts.successUrl,
    cancel_url: opts.cancelUrl,
    metadata: opts.metadata,
    subscription_data: opts.metadata ? { metadata: opts.metadata } : undefined,
  })
  return { id: session.id, url: session.url }
}

/**
 * Change what a live subscription bills each month.
 *
 * Stripe holds the schedule and the amount; our `MemberSubscription` holds what
 * the amount is FOR. When a product change moves the flat monthly, both have to
 * move, and Stripe is the one that actually takes the money — so it goes first.
 * A failure here must leave the local price alone rather than produce a plan
 * that says one thing and a card charge that says another.
 *
 * Replaces the single recurring line's price in place, keeping the billing
 * anchor so the member's payment date doesn't jump. `proration_behavior: 'none'`
 * because the new price is deliberately effective from the next cycle — a
 * reduction is never backdated and an increase has already served its notice.
 */
export async function updateSubscriptionAmount(
  stripeSubscriptionId: string,
  monthlyTotal: number,
  opts: { currency?: string } = {},
): Promise<void> {
  const stripe = getStripeClient()
  const subscription = await stripe.subscriptions.retrieve(stripeSubscriptionId)
  const item = subscription.items.data[0]
  if (!item) throw new Error(`Stripe subscription ${stripeSubscriptionId} has no billable item`)

  // A subscription item's `price_data` takes a product ID, not inline product
  // data — so reuse the product the current price already points at. That keeps
  // every price this member has ever been on under one Stripe product, which is
  // what makes their billing history readable in the dashboard.
  const currentPrice = item.price
  const productId = typeof currentPrice.product === 'string' ? currentPrice.product : currentPrice.product.id

  await stripe.subscriptions.update(stripeSubscriptionId, {
    items: [
      {
        id: item.id,
        price_data: {
          currency: (opts.currency ?? currentPrice.currency ?? 'gbp').toLowerCase(),
          product: productId,
          unit_amount: Math.round(monthlyTotal * 100),
          recurring: { interval: 'month' },
        },
      },
    ],
    proration_behavior: 'none',
  })
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
