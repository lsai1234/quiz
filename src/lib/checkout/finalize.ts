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

export const PENDING_COOKIE = 'pending_checkout'
export const PENDING_KEY_PREFIX = 'pending:'

export interface FinalizeResult {
  checkoutUrl: string
  mock: boolean
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

export async function finalizeCheckout(
  userId: string,
  email: string | null,
  payload: CheckoutPayload,
  origin?: string,
): Promise<FinalizeResult> {
  // 1. Hydrate the portal's pricing config FIRST — the intro-discount claim
  //    below is validated against it, so it has to be the live one.
  await syncPortalRuntime()

  // 2. Store the member's bundle + quiz answers on their account, banking the
  //    first-month discount they revealed as we go.
  const subscription = claimIntroDiscount({
    ...payload.subscription,
    customerEmail: email || payload.subscription.customerEmail,
  })
  await saveSubscription(userId, subscription)
  if (payload.quiz) await saveQuiz(userId, payload.quiz)

  // Bank the granted rate against the allocation ledger. This is the only place
  // the giveaway budget is spent — cards revealed by people who never got here
  // cost nothing, which is what lets the effective discount govern the average
  // across BUYERS rather than across browsers. Never fail a checkout over it.
  try {
    await recordIntroClaim(subscription.introDiscountRate ?? 0)
  } catch (err) {
    console.error('[finalizeCheckout] intro-discount ledger write failed:', err)
  }

  // 3. Start payment.
  if (getPaymentSource() === 'stripe') {
    const base = origin || process.env.APP_URL || ''
    const { createSubscriptionSession } = await import('@/lib/payments/stripe')
    const { url } = await createSubscriptionSession({
      monthlyTotal: subscription.flatMonthly,
      // The rate validated above, not the one the browser sent.
      introDiscountRate: subscription.introDiscountRate,
      clientReferenceId: userId,
      customerEmail: subscription.customerEmail || email,
      successUrl: `${base}/hub?welcome=subscribed`,
      cancelUrl: `${base}/hub`,
      metadata: { userId },
    })
    if (url) return { checkoutUrl: url, mock: false }
    // No URL back — fall through to the mock confirmation rather than dead-ending.
  }

  // 4. Mock mode: raise the first subscription order now so the hub + fulfilment
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
