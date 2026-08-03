/**
 * Persist a member's subscription to their account and start the payment.
 *
 * Shared by the two ways an account gets created before subscribing: the inline
 * email/password path (`POST /api/checkout/finalize`) and the OAuth path, which
 * stashes the order first and resumes at `/api/checkout/continue` after the
 * provider round-trip. Both land here so the bundle + quiz are stored the same
 * way and payment is started the same way.
 *
 * Payment goes through Stripe (a subscription Checkout Session billing the
 * bundle's flat monthly total). In mock mode there's no webhook, so we raise the
 * first subscription order immediately and return the `#mock-subscription`
 * placeholder — the whole flow stays demoable without Stripe keys.
 *
 * Server-only.
 */
import type { CheckoutPayload } from './types'
import type { MemberSubscription } from '@/lib/recharge/types'
import { saveSubscription, saveQuiz } from '@/lib/db/hub-data'
import { getPaymentSource } from '@/lib/payments'
import { syncPortalRuntime } from '@/lib/portal/store'
import { getPricingConfig, resolveIntroDiscount } from '@/lib/stack-blueprint/pricing'
import { recordIntroClaim } from '@/lib/stack-blueprint/intro-allocation'
import { consentErrorMessage, recordConsent, validateConsent } from '@/lib/legal/consent'
import { safetyConstraintsFrom } from '@/lib/changes/safety'

export const PENDING_COOKIE = 'pending_checkout'
export const PENDING_KEY_PREFIX = 'pending:'

export interface FinalizeResult {
  checkoutUrl: string
  mock: boolean
}

/**
 * A checkout that can't proceed. Thrown rather than returned so no caller can
 * accidentally carry on and take a payment — the routes turn it into a 400 with
 * the member-facing message.
 */
export class CheckoutRejected extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CheckoutRejected'
  }
}

/**
 * Commit the member's first-month discount at the point of purchase.
 *
 * The scratch card is revealed in the browser, so the rate reaches us on a
 * payload the client controls. Nothing is claimed while someone is only
 * scratching and browsing — the rate is banked here, once, when the checkout is
 * actually finalized, and re-validated against the live configured outcomes on
 * the way in. A rate we don't recognise (a card revealed before the odds were
 * retuned, or a tampered payload) claims nothing rather than failing the
 * checkout, and `firstMonth` is always recomputed from our own `flatMonthly`
 * rather than trusted.
 *
 * `minMonths` is deliberately left alone: a per-product override can legitimately
 * raise it above the config floor, and re-deriving that needs the blueprint and
 * catalogue, which this payload doesn't carry.
 */
export function claimIntroDiscount(
  sub: MemberSubscription,
  config = getPricingConfig(),
): MemberSubscription {
  const rate = resolveIntroDiscount(sub.introDiscountRate ?? null, config)
  return {
    ...sub,
    introDiscountRate: rate,
    firstMonth: Math.round(sub.flatMonthly * (1 - rate) * 100) / 100,
  }
}

export interface FinalizeOptions {
  origin?: string
  /** Request metadata recorded against the consent, for evidential weight. */
  ip?: string | null
  userAgent?: string | null
}

export async function finalizeCheckout(
  userId: string,
  email: string | null,
  payload: CheckoutPayload,
  options: FinalizeOptions | string = {},
): Promise<FinalizeResult> {
  const opts: FinalizeOptions = typeof options === 'string' ? { origin: options } : options
  const origin = opts.origin

  // 1. Hydrate the portal's pricing config FIRST — the intro-discount claim
  //    and the terms wording below are both derived from it, so it has to be
  //    the live one.
  await syncPortalRuntime()

  // 2. Consent, before anything is stored or charged. The documents recorded
  //    are the ones WE are currently serving, never what the payload claims.
  const consent = validateConsent(payload.consent)
  if (!consent.ok) throw new CheckoutRejected(consentErrorMessage(consent.error))

  // 3. Store the member's bundle + quiz answers on their account, banking the
  //    first-month discount they revealed as we go.
  const subscription = claimIntroDiscount({
    ...payload.subscription,
    customerEmail: email || payload.subscription.customerEmail,
    // Snapshot the hard dietary/stimulant exclusions now, so a substitution
    // months from now is judged against what they told us at the point of sale
    // rather than whatever their answers happen to say later.
    safetyConstraints:
      payload.subscription.safetyConstraints ?? safetyConstraintsFrom(payload.quiz?.answers),
  })
  await saveSubscription(userId, subscription)
  if (payload.quiz) await saveQuiz(userId, payload.quiz)

  // Evidence of what they agreed to. Written after the subscription exists but
  // before payment starts, so a stored plan always has a matching consent row.
  await recordConsent({
    userId,
    context: 'checkout',
    documents: consent.documents,
    ip: opts.ip,
    userAgent: opts.userAgent,
  })

  // Bank the granted rate against the allocation ledger. This is the only place
  // the giveaway budget is spent — cards revealed by people who never got here
  // cost nothing, which is what lets the effective discount govern the average
  // across BUYERS rather than across browsers. Never fail a checkout over it.
  try {
    await recordIntroClaim(subscription.introDiscountRate ?? 0)
  } catch (err) {
    console.error('[finalizeCheckout] intro-discount ledger write failed:', err)
  }

  // 4. Start payment.
  if (getPaymentSource() === 'stripe') {
    const base = origin || process.env.APP_URL || ''
    const { createSubscriptionSession } = await import('@/lib/payments/stripe')
    const { url } = await createSubscriptionSession({
      monthlyTotal: subscription.flatMonthly,
      // The rate validated above, not the one the browser sent.
      introDiscountRate: subscription.introDiscountRate,
      clientReferenceId: userId,
      // Reuse the Stripe customer if this member has subscribed before, so their
      // cards and billing history stay on one record.
      customerId: subscription.stripeCustomerId ?? null,
      customerEmail: subscription.customerEmail || email,
      successUrl: `${base}/order/confirmation?session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${base}/hub`,
      metadata: { userId },
    })
    if (url) return { checkoutUrl: url, mock: false }
    // No URL back — fall through to the mock confirmation rather than dead-ending.
  }

  // 5. Mock mode: raise the first subscription order now so the hub + fulfilment
  //    flow can be exercised without Stripe, then show the confirmation.
  try {
    const { getResolvedCatalogue } = await import('@/lib/catalogue/resolve')
    const { createSubscriptionOrder } = await import('@/lib/orders/service')
    const { products } = await getResolvedCatalogue()
    await createSubscriptionOrder({ userId, email: subscription.customerEmail || email, sub: subscription, catalogue: products })
  } catch (err) {
    console.error('[finalizeCheckout] mock subscription order creation failed:', err)
  }
  return { checkoutUrl: '#mock-subscription', mock: true }
}
