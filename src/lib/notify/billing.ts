/**
 * Billing notifications — the emails that come from Stripe telling us something,
 * rather than from a product change we decided.
 *
 * Separate from `from-change.ts` because the rule is different. Everything in
 * the change domain is already done by the time we write, and the email exists
 * to say so. A failed payment is the opposite: it is unresolved, and only the
 * member can resolve it. That is why this is the one place allowed to ask them
 * to act.
 *
 * Never throws. A mail provider having a bad afternoon must not fail the webhook
 * that is also recording the failed payment — a queued row is retryable, a lost
 * webhook is not.
 */
import type { MemberSubscription } from '@/lib/recharge/types'
import { queueNotification } from './outbox'
import { hubLinks } from './from-change'
import { paymentFailed } from './templates'

function baseUrl(): string {
  return process.env.APP_URL || ''
}

/**
 * Tell a member their payment failed and Stripe is retrying.
 *
 * Deduped per subscription per dunning episode, not per attempt: Stripe raises
 * `invoice.payment_failed` on every retry, and four identical emails about one
 * expired card is how you turn a solvable problem into a cancellation. The
 * caller only reaches here on the transition into `past_due`, and the dedupe key
 * is the backstop for a redelivered webhook.
 */
export async function queuePaymentFailedEmail(
  userId: string,
  sub: MemberSubscription,
  invoiceId?: string,
): Promise<void> {
  if (!sub.customerEmail) return
  try {
    await queueNotification({
      userId,
      email: sub.customerEmail,
      template: 'payment-failed',
      dedupeKey: `payment-failed:${invoiceId ?? sub.stripeSubscriptionId ?? userId}`,
      rendered: paymentFailed({
        monthly: sub.flatMonthly,
        billingUrl: hubLinks.billing(baseUrl()),
      }),
    })
  } catch (err) {
    console.error('[notify] could not queue the payment-failed email:', err)
  }
}
