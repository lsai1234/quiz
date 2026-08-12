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
import { paymentFailed, exitReceipt, exitChargeFailed, exitScheduled } from './templates'

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

/**
 * Tell a member their plan has ended, and what it came to.
 *
 * Deduped per exit rather than per send: an exit happens once, and a retry of
 * the route that raised it must not produce a second receipt.
 *
 * Picks the failed-charge variant when the money did not move, because that
 * email has a different job — it opens by confirming the cancellation went
 * through, which is the member's actual worry on seeing "payment" and "ended" in
 * the same message.
 */
export async function queueExitEmail(
  userId: string,
  sub: MemberSubscription,
  outcome: {
    settlement: number
    paid: boolean
    waiverExplanation?: string | null
    shippedTotal: number
    paidTotal: number
    overpayment?: number
    invoiceUrl?: string | null
  },
): Promise<void> {
  if (!sub.customerEmail) return
  const base = baseUrl()
  const owedButUnpaid = outcome.settlement > 0 && !outcome.paid

  try {
    await queueNotification({
      userId,
      email: sub.customerEmail,
      template: owedButUnpaid ? 'exit-charge-failed' : 'exit-receipt',
      dedupeKey: `exit:${sub.id}:${owedButUnpaid ? 'failed' : 'receipt'}`,
      rendered: owedButUnpaid
        ? exitChargeFailed({
            settlement: outcome.settlement,
            invoiceUrl: outcome.invoiceUrl || `${base}/myhub`,
          })
        : exitReceipt({
            settlement: outcome.settlement,
            shippedTotal: outcome.shippedTotal,
            paidTotal: outcome.paidTotal,
            waiverExplanation: outcome.waiverExplanation ?? null,
            overpayment: outcome.overpayment ?? 0,
            shopUrl: `${base}/shop`,
          }),
    })
  } catch (err) {
    // Never blocks an exit. The plan has already ended; a mail provider having a
    // bad afternoon is not a reason to fail the request that ended it.
    console.error('[notify] exit email could not be queued:', err)
  }
}

/**
 * Confirm a scheduled free exit.
 *
 * Its whole job is the sentence about nothing changing in the meantime: a member
 * who believes they have stopped and then sees a payment will read it as a
 * mistake, however clearly the screen explained it at the time.
 */
export async function queueScheduledExitEmail(
  userId: string,
  sub: MemberSubscription,
  monthsAway: number,
): Promise<void> {
  if (!sub.customerEmail) return
  try {
    await queueNotification({
      userId,
      email: sub.customerEmail,
      template: 'exit-scheduled',
      dedupeKey: `exit-scheduled:${sub.id}:${sub.monthsActive}`,
      rendered: exitScheduled({ monthsAway, monthly: sub.flatMonthly, hubUrl: `${baseUrl()}/myhub` }),
    })
  } catch (err) {
    console.error('[notify] scheduled-exit email could not be queued:', err)
  }
}
