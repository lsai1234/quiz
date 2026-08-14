/**
 * Stripe payment layer.
 *
 * Server-only. Every checkout entry point goes through the payments resolver
 * (`./index.ts`) and only reaches here when Stripe is the effective source;
 * mock mode never touches the SDK. Prices are always passed in from the
 * catalogue server-side — the client's numbers are never trusted.
 */
import Stripe from 'stripe'
import type { DeliveryOption } from '@/lib/pricing/delivery'

/**
 * Pinned deliberately. Left unset, Stripe applies whatever default version the
 * ACCOUNT is on, which can be changed from the dashboard or moved by Stripe
 * itself — so the shape of the webhook payloads we parse could shift without a
 * deploy. The defensive shape-juggling in `webhook.ts` (`addressFromSession`,
 * `idOf`) exists precisely because that has bitten before. Upgrade this
 * intentionally, with the changelog open, not by accident.
 */
const STRIPE_API_VERSION = '2025-09-30.clover'

/** One currency for the whole app. Every amount we send Stripe is in minor units of this. */
export const DEFAULT_CURRENCY = 'gbp'

/**
 * Which recurring line is which, stamped on the product when the subscription
 * Session is created.
 *
 * A subscription now bills TWO recurring lines — the stack and the postage —
 * and `items.data[0]` is not promised to be either one in particular. Anything
 * that later rewrites the plan's price has to find the right line by name;
 * guessing at a position would eventually bill someone £52 of postage and 30p
 * of supplements. See `updateSubscriptionAmount`.
 */
const LINE_TAG_KEY = 'chrgdLine'
const STACK_LINE = 'stack'
const DELIVERY_LINE = 'delivery'

let _client: Stripe | null = null

export function getStripeClient(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) throw new Error('STRIPE_SECRET_KEY is not set — cannot use Stripe.')
  if (!_client) _client = new Stripe(key, { apiVersion: STRIPE_API_VERSION as Stripe.LatestApiVersion })
  return _client
}

/**
 * Identify the buyer to Stripe: an existing Customer if we know one, otherwise
 * just their email so Checkout can create one.
 *
 * Stripe rejects `customer` and `customer_email` together, so this is
 * deliberately either/or rather than two independent options a caller could get
 * wrong.
 */
function customerFields(opts: { customerId?: string | null; customerEmail?: string | null }):
  | { customer: string }
  | { customer_email: string }
  | Record<string, never> {
  if (opts.customerId) return { customer: opts.customerId }
  if (opts.customerEmail) return { customer_email: opts.customerEmail }
  return {}
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
  /**
   * An existing Stripe Customer to bill against, when we know the buyer. Wins
   * over `customerEmail` — Stripe rejects both together — and keeps a returning
   * member's payments, cards and invoices on ONE customer record instead of
   * minting a fresh one per checkout.
   */
  customerId?: string | null
  customerEmail?: string | null
  currency?: string
  successUrl: string
  cancelUrl: string
  metadata?: Record<string, string>
  /**
   * Delivery choices to show. Fixed when the session is created — Stripe cannot
   * vary a rate by the address the customer is about to type — so the customer
   * picks their zone and the fulfilment queue checks the pick against their
   * postcode. See `deliveryOptions`.
   */
  shippingOptions?: DeliveryOption[]
}

/** Delivery choices as Stripe's `shipping_options`, or undefined when there are
 *  none to offer (which leaves the session with no shipping line at all). */
function shippingOptionsFor(
  options: DeliveryOption[] | undefined,
  currency: string,
): Stripe.Checkout.SessionCreateParams.ShippingOption[] | undefined {
  if (!options || options.length === 0) return undefined
  return options.map((option) => ({
    shipping_rate_data: {
      type: 'fixed_amount',
      // The id rides along in the display name so the webhook can map the
      // customer's choice back to a zone without a second Stripe lookup.
      display_name: option.label,
      fixed_amount: { amount: Math.round(option.price * 100), currency },
      metadata: { optionId: option.id, zone: option.zone },
    },
  }))
}

/** Create a one-off Checkout Session and return its hosted URL. Guest-friendly:
 *  no account required; Stripe collects the email. */
export async function createCheckoutSession(opts: CreateSessionOptions): Promise<{ id: string; url: string | null }> {
  const stripe = getStripeClient()
  const currency = (opts.currency ?? DEFAULT_CURRENCY).toLowerCase()
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
    ...customerFields(opts),
    // Collect a delivery address so the order can be dropshipped by the supplier.
    shipping_address_collection: { allowed_countries: ['GB'] },
    shipping_options: shippingOptionsFor(opts.shippingOptions, currency),
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
  /** Reuse an existing Stripe Customer when we have one. See `CreateSessionOptions`. */
  customerId?: string | null
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
  /**
   * The postage to bill alongside the stack, every month, or null when this
   * plan ships free. ONE rate rather than the pair a one-off basket offers —
   * Stripe has no shipping options in subscription mode, so it rides as a
   * second recurring line item instead. See `recurringDeliveryOption`.
   */
  delivery?: DeliveryOption | null
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
 * Create a subscription Checkout Session billing the bundle's flat monthly
 * total, plus postage where it is charged. The bundle's contents live in our
 * `MemberSubscription` document (the source of truth); Stripe only holds the
 * billing schedule + payment method.
 *
 * ── Why postage is a LINE ITEM here and a shipping option on a one-off ──
 * `shipping_options` is a payment-mode parameter. Stripe refuses a
 * subscription-mode Session that carries one, and it refuses it before doing
 * anything else — so from the day delivery started being charged, EVERY
 * subscription checkout failed with "we couldn't start your payment", while
 * one-off baskets (payment mode) went through untouched. Delivery recurs as a
 * second monthly line instead, which is what Stripe's own guidance says to do
 * for a recurring charge that isn't the plan.
 *
 * The cost of that: no mainland-or-Highlands pick on the Stripe page, so the
 * member is billed the mainland rate `PlanReceipt` already quoted them. See
 * `recurringDeliveryOption`.
 *
 * A claimed first-month discount rides along as a one-cycle coupon. Session
 * discounts apply to the whole first invoice, postage included — a few pence on
 * a £2.95 line, and not worth a second billing mechanism to carve out. If the
 * coupon can't be resolved the session is still created at full price rather
 * than dead-ending the member — they'd be owed the difference, so this logs
 * loudly.
 */
export async function createSubscriptionSession(opts: CreateSubscriptionSessionOptions): Promise<{ id: string; url: string | null }> {
  const stripe = getStripeClient()
  const currency = (opts.currency ?? DEFAULT_CURRENCY).toLowerCase()
  const rate = opts.introDiscountRate ?? 0
  const coupon = rate > 0 ? await getOrCreateFirstMonthCoupon(rate) : null
  if (rate > 0 && !coupon) {
    console.error(`[stripe] intro discount of ${Math.round(rate * 100)}% could not be applied — billing at full price.`)
  }

  const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [
    {
      quantity: 1,
      price_data: {
        currency,
        unit_amount: Math.round(opts.monthlyTotal * 100),
        recurring: { interval: 'month' },
        product_data: { name: 'CHRGD Monthly Stack', metadata: { [LINE_TAG_KEY]: STACK_LINE } },
      },
    },
  ]
  // Postage, when this plan is under the free line. Its own line so the member
  // can see what they are paying for it, every month, rather than finding it
  // folded into a monthly total that no longer matches the receipt they agreed to.
  if (opts.delivery && opts.delivery.price > 0) {
    lineItems.push({
      quantity: 1,
      price_data: {
        currency,
        unit_amount: Math.round(opts.delivery.price * 100),
        recurring: { interval: 'month' },
        product_data: {
          name: `Delivery — ${opts.delivery.label}`,
          metadata: { [LINE_TAG_KEY]: DELIVERY_LINE, optionId: opts.delivery.id, zone: opts.delivery.zone },
        },
      },
    })
  }

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    line_items: lineItems,
    client_reference_id: opts.clientReferenceId,
    ...customerFields(opts),
    discounts: coupon ? [{ coupon }] : undefined,
    // A subscription ships a physical box every month, so it needs a delivery
    // address just as much as a one-off does. Without this the webhook has no
    // address to put on the order, and `submitOrderToSupplier` now refuses an
    // order that has none — i.e. every box stuck in the queue, undeliverable.
    // Address COLLECTION is supported in subscription mode; shipping RATES are
    // not, which is the whole reason postage is a line item above.
    shipping_address_collection: { allowed_countries: ['GB'] },
    phone_number_collection: { enabled: true },
    success_url: opts.successUrl,
    cancel_url: opts.cancelUrl,
    metadata: opts.metadata,
    subscription_data: opts.metadata ? { metadata: opts.metadata } : undefined,
  })
  return { id: session.id, url: session.url }
}

/** The product a subscription item is priced against, when it was expanded. */
function productMetadataOf(item: Stripe.SubscriptionItem): Stripe.Metadata | null {
  const product = item.price.product
  if (!product || typeof product === 'string' || product.deleted) return null
  return product.metadata ?? null
}

/**
 * The item carrying the PLAN's price, among however many the subscription has.
 *
 * Since postage became its own recurring line there are two, and Stripe makes no
 * promise about their order — writing the new monthly onto the delivery line
 * would bill a member £52 of postage and 30p of supplements. The line is found
 * by the tag stamped on its product at checkout; a subscription created before
 * that tag existed has a single untagged item, which is the plan by definition.
 */
function stackItemOf(subscription: Stripe.Subscription): Stripe.SubscriptionItem | undefined {
  const items = subscription.items.data
  return (
    items.find((i) => productMetadataOf(i)?.[LINE_TAG_KEY] === STACK_LINE) ??
    items.find((i) => productMetadataOf(i)?.[LINE_TAG_KEY] !== DELIVERY_LINE)
  )
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
 * Replaces the PLAN line's price in place, keeping the billing anchor so the
 * member's payment date doesn't jump. `proration_behavior: 'none'` because the
 * new price is deliberately effective from the next cycle — a reduction is never
 * backdated and an increase has already served its notice.
 *
 * A postage line, if there is one, is left exactly as it was: omitting an item
 * from `items` updates nothing about it (unlike a Checkout Session's
 * `line_items`, where omission removes). So a plan whose price crosses the
 * free-delivery line keeps paying the postage it signed up at until someone
 * changes it deliberately — the conservative direction, and visible in the
 * member's own invoice rather than quietly re-rated underneath them.
 */
export async function updateSubscriptionAmount(
  stripeSubscriptionId: string,
  monthlyTotal: number,
  opts: { currency?: string } = {},
): Promise<void> {
  const stripe = getStripeClient()
  // Expanded, because which item is the plan is written on its PRODUCT — see
  // `stackItemOf`. Unexpanded, `price.product` is a bare id and every item looks
  // alike.
  const subscription = await stripe.subscriptions.retrieve(stripeSubscriptionId, {
    expand: ['items.data.price.product'],
  })
  const item = stackItemOf(subscription)
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
          currency: (opts.currency ?? currentPrice.currency ?? DEFAULT_CURRENCY).toLowerCase(),
          product: productId,
          unit_amount: Math.round(monthlyTotal * 100),
          recurring: { interval: 'month' },
        },
      },
    ],
    proration_behavior: 'none',
  })
}

/**
 * End a subscription in Stripe, immediately.
 *
 * Immediate rather than `cancel_at_period_end` on purpose: the offer is "cancel
 * whenever you want, settle what we've already sent you", and the settlement —
 * not a final month's billing — is what squares us up. Leaving it to run to the
 * period end would take another payment from someone who has already left.
 *
 * Tolerates an already-cancelled subscription: a member cancelling from the
 * Stripe billing portal, and then again in the hub, must not error.
 */
export async function cancelStripeSubscription(stripeSubscriptionId: string): Promise<void> {
  const stripe = getStripeClient()
  try {
    await stripe.subscriptions.cancel(stripeSubscriptionId)
  } catch (err) {
    if (err instanceof Stripe.errors.StripeInvalidRequestError && err.statusCode === 404) return
    // Already cancelled is a success for our purposes — we wanted it stopped.
    if (err instanceof Stripe.errors.StripeInvalidRequestError && /no such subscription|already canceled/i.test(err.message)) return
    throw err
  }
}

/**
 * Pause billing without ending the subscription.
 *
 * `behavior: 'void'` means invoices raised while paused are voided rather than
 * banked as a debt — the member is not shipped to and must not be billed for the
 * gap, and the terms promise a pause costs nothing.
 */
export async function pauseStripeSubscription(stripeSubscriptionId: string): Promise<void> {
  const stripe = getStripeClient()
  await stripe.subscriptions.update(stripeSubscriptionId, {
    pause_collection: { behavior: 'void' },
  })
}

/** Resume a paused subscription — billing restarts on the existing anchor. */
export async function resumeStripeSubscription(stripeSubscriptionId: string): Promise<void> {
  const stripe = getStripeClient()
  await stripe.subscriptions.update(stripeSubscriptionId, { pause_collection: null })
}

/**
 * The card a subscription actually bills, for display in the hub.
 *
 * Best-effort: returns null rather than throwing, because not knowing the card
 * is a cosmetic problem and must never be able to fail a webhook that is also
 * activating someone's plan.
 */
export async function defaultCardFor(
  stripeSubscriptionId: string,
): Promise<{ brand: string; last4: string } | null> {
  try {
    const stripe = getStripeClient()
    const subscription = await stripe.subscriptions.retrieve(stripeSubscriptionId, {
      expand: ['default_payment_method'],
    })
    const pm = subscription.default_payment_method
    if (!pm || typeof pm === 'string' || !pm.card) return null
    return { brand: pm.card.brand, last4: pm.card.last4 }
  } catch (err) {
    console.error('[stripe] could not read the default payment method:', err)
    return null
  }
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
export interface SettlementChargeResult {
  invoiceId: string
  /** True when the money actually moved. False means an open invoice they can pay. */
  paid: boolean
  /** Stripe's hosted invoice page, to link the member to when it did not. */
  hostedInvoiceUrl: string | null
  status: string | null
}

/**
 * Charge a member the balance they owe on goods already sent, at the exit.
 *
 * An INVOICE, not a bare PaymentIntent, and the difference matters three times
 * over: it is a document the member can see in their billing portal, it is the
 * right object for a taxable supply if VAT registration ever happens, and when
 * the card declines it survives as an **open invoice they can still pay** rather
 * than as a failed charge that leaves nothing behind.
 *
 * Off-session against the saved card, because nobody is at the keyboard by the
 * time this runs — the member has already confirmed and expects to be finished.
 *
 * NEVER throws on a decline. A refusal comes back as `paid: false` with the
 * invoice still there. The caller cancels the subscription either way: holding
 * someone's cancellation hostage to a card decline is the single worst thing
 * this feature could do, and the terms promise the opposite.
 *
 * `idempotencyKey` must be stable for a given exit — the subscription plus the
 * cycle it is leaving on — so a double-submit cannot bill twice.
 */
export async function chargeSettlement(opts: {
  customerId: string
  amount: number
  description: string
  idempotencyKey: string
  currency?: string
}): Promise<SettlementChargeResult> {
  const stripe = getStripeClient()
  const currency = (opts.currency ?? DEFAULT_CURRENCY).toLowerCase()

  await stripe.invoiceItems.create(
    {
      customer: opts.customerId,
      amount: Math.round(opts.amount * 100),
      currency,
      description: opts.description,
      // No VAT line while we are not registered — see `settlement.chargeVat`,
      // which is deliberately its own flag rather than a read of
      // `vat.registered`. The settlement is a taxable supply of goods already
      // delivered, so registration raises a tax-point question about balances
      // settled after the date on goods sent before it. That gets decided by a
      // person, not by a boolean flipping.
      tax_behavior: 'inclusive',
    },
    { idempotencyKey: `${opts.idempotencyKey}:item` },
  )

  const invoice = await stripe.invoices.create(
    {
      customer: opts.customerId,
      collection_method: 'charge_automatically',
      // Bill exactly what we just added and nothing else that happens to be
      // pending on the customer.
      pending_invoice_items_behavior: 'include',
      auto_advance: false,
      description: opts.description,
      metadata: { kind: 'exit-settlement' },
    },
    { idempotencyKey: `${opts.idempotencyKey}:invoice` },
  )
  if (!invoice.id) throw new Error('Stripe returned an invoice with no id')

  try {
    const paid = await stripe.invoices.pay(invoice.id, { off_session: true })
    return {
      invoiceId: invoice.id,
      paid: paid.status === 'paid',
      hostedInvoiceUrl: paid.hosted_invoice_url ?? null,
      status: paid.status ?? null,
    }
  } catch (err) {
    // A decline is an outcome, not an exception — the invoice stands and the
    // member can pay it from the portal.
    console.warn('[stripe] settlement invoice was not paid immediately:', err instanceof Error ? err.message : err)
    const open = await stripe.invoices.retrieve(invoice.id).catch(() => null)
    return {
      invoiceId: invoice.id,
      paid: false,
      hostedInvoiceUrl: open?.hosted_invoice_url ?? null,
      status: open?.status ?? null,
    }
  }
}

/**
 * Put a credit on the customer's Stripe balance.
 *
 * Stripe applies a customer credit balance to the NEXT invoice automatically,
 * which is exactly the shape the Terms promise for a skipped box: *"the value of
 * the skipped box is credited against your next one."* No coupon, no proration,
 * no bespoke schedule — one primitive that already does the thing.
 *
 * Stripe's sign convention is the opposite of the intuitive one: a NEGATIVE
 * balance is credit owed to the customer, positive is money they owe. Passing
 * this the wrong way round would silently bill people extra for skipping a box,
 * so `amount` here is a plain positive credit and the negation happens once,
 * here.
 *
 * `idempotencyKey` should identify the box being credited, so a repeated skip of
 * the same delivery cannot stack credits.
 */
export async function creditCustomerBalance(opts: {
  customerId: string
  amount: number
  description: string
  idempotencyKey: string
  currency?: string
}): Promise<void> {
  if (opts.amount <= 0) return
  const stripe = getStripeClient()
  await stripe.customers.createBalanceTransaction(
    opts.customerId,
    {
      amount: -Math.round(opts.amount * 100),
      currency: (opts.currency ?? DEFAULT_CURRENCY).toLowerCase(),
      description: opts.description,
    },
    { idempotencyKey: opts.idempotencyKey },
  )
}

export async function refundPayment(paymentIntentId: string): Promise<void> {
  const stripe = getStripeClient()
  await stripe.refunds.create({ payment_intent: paymentIntentId })
}
