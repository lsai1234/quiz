/**
 * Persist a member's subscription to their account and start the payment.
 *
 * Shared by the two ways an account gets created before subscribing: the inline
 * email/password path (`POST /api/checkout/finalize`) and the OAuth path, which
 * stashes the order first and resumes at `/api/checkout/continue` after the
 * provider round-trip. Both land here so the bundle + quiz are stored the same
 * way and the Shopify cart is built server-side from validated lines.
 *
 * Server-only.
 */
import type { CheckoutPayload } from './types'
import { saveSubscription, saveQuiz } from '@/lib/db/hub-data'
import { getDataSource } from '@/lib/data-source'
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
): Promise<FinalizeResult> {
  // 1. Store the member's bundle + quiz answers on their account.
  const subscription = {
    ...payload.subscription,
    customerEmail: email || payload.subscription.customerEmail,
  }
  await saveSubscription(userId, subscription)
  if (payload.quiz) await saveQuiz(userId, payload.quiz)

  // 2. Start payment. Mock mode (or no live lines) returns a placeholder so the
  //    UI can show the confirmation; live mode creates the Shopify subscription
  //    cart and returns its checkout URL.
  await syncPortalRuntime()
  if (getDataSource() !== 'shopify' || !payload.lines?.length) {
    return { checkoutUrl: '#mock-subscription', mock: true }
  }

  const { createCart } = await import('@/lib/shopify/operations')
  const cart = await createCart(
    payload.lines.map((l) => ({
      merchandiseId: l.merchandiseId,
      quantity: l.quantity,
      ...(l.sellingPlanId ? { sellingPlanId: l.sellingPlanId } : {}),
      attributes: l.attributes,
    })),
  )
  return { checkoutUrl: cart.checkoutUrl, mock: false }
}
