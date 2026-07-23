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
import { saveSubscription, saveQuiz } from '@/lib/db/hub-data'
import { getPaymentSource } from '@/lib/payments'
import { syncPortalRuntime } from '@/lib/portal/store'

export const PENDING_COOKIE = 'pending_checkout'
export const PENDING_KEY_PREFIX = 'pending:'

export interface FinalizeResult {
  checkoutUrl: string
  mock: boolean
}

export async function finalizeCheckout(
  userId: string,
  email: string | null,
  payload: CheckoutPayload,
  origin?: string,
): Promise<FinalizeResult> {
  // 1. Store the member's bundle + quiz answers on their account.
  const subscription = {
    ...payload.subscription,
    customerEmail: email || payload.subscription.customerEmail,
  }
  await saveSubscription(userId, subscription)
  if (payload.quiz) await saveQuiz(userId, payload.quiz)

  await syncPortalRuntime()

  // 2. Start payment.
  if (getPaymentSource() === 'stripe') {
    const base = origin || process.env.APP_URL || ''
    const { createSubscriptionSession } = await import('@/lib/payments/stripe')
    const { url } = await createSubscriptionSession({
      monthlyTotal: subscription.flatMonthly,
      clientReferenceId: userId,
      customerEmail: subscription.customerEmail || email,
      successUrl: `${base}/hub?welcome=subscribed`,
      cancelUrl: `${base}/hub`,
      metadata: { userId },
    })
    if (url) return { checkoutUrl: url, mock: false }
    // No URL back — fall through to the mock confirmation rather than dead-ending.
  }

  // 3. Mock mode: raise the first subscription order now so the hub + fulfilment
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
