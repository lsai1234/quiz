/**
 * Confirmation emails — the receipt for something bought.
 *
 * The third kind of notification, alongside `from-change.ts` (we changed your
 * plan) and `billing.ts` (Stripe told us something). These are the ones a
 * customer expects within seconds of paying, and the only ones they will go
 * looking for months later.
 *
 * The design decision worth knowing about is that **the email prints the same
 * receipt the website printed**. `lib/receipt/build` already turns each payment
 * journey's numbers into one `ReceiptData`, and the confirmation screen draws
 * it as a thermal receipt; this hands the same structure to the email renderer.
 * Nothing here re-derives a total, re-formats a price or decides what a stamp
 * says — so the receipt in the inbox and the receipt on the screen cannot
 * disagree, because there is only one of them.
 *
 * Never throws. The money has already moved by the time any of this is reached,
 * and an email provider having a bad afternoon is not a reason to fail the
 * webhook that is also recording the payment.
 *
 * Server-only.
 */
import { toConfirmationOrder, toConfirmationSubscription, subscriptionReference } from '@/lib/orders/confirmation'
import { receiptFromConfirmation } from '@/lib/receipt/build'
import { orderReference } from '@/lib/orders/service'
import type { Order } from '@/lib/orders/types'
import type { MemberSubscription } from '@/lib/recharge/types'
import type { ConfirmationResponse } from '@/lib/orders/confirmation'
import { appBaseUrl } from './index'
import { deliverIfAutomatic, queueNotification } from './outbox'
import { marketingSuppressed, optOutUrl } from './marketing'
import { orderConfirmation, subscriptionConfirmation, type BrandContext } from './templates'

/** `2026-08-14T…` → `14 August 2026`. Null in, null out. */
function longDate(value: string | null | undefined): string | null {
  if (!value) return null
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
}

/** "between 17 and 19 August 2026", from the dispatch window. */
function deliveryWindow(estimate: { from: string; to: string } | null): string | null {
  const from = longDate(estimate?.from)
  const to = longDate(estimate?.to)
  return from && to ? `between ${from} and ${to}` : null
}

/**
 * The branding context for one recipient.
 *
 * The opt-out link is looked up per address and omitted when they have already
 * opted out — which is what removes the promotional strip, since `emailShell`
 * will not render one without a link to refuse it. Failing to resolve it drops
 * the marketing and keeps the receipt, which is the right way round.
 */
async function brandFor(email: string, base: string): Promise<BrandContext> {
  try {
    if (await marketingSuppressed(email)) return { baseUrl: base, optOutUrl: null }
    return { baseUrl: base, optOutUrl: await optOutUrl(base, email) }
  } catch (err) {
    console.error('[notify] could not resolve the marketing opt-out link:', err)
    return { baseUrl: base, optOutUrl: null }
  }
}

/**
 * Confirm a one-off order.
 *
 * Deduped on the order id, so the two paths that can reach a paid order — the
 * Stripe webhook marking a pending order paid, and mock mode raising one
 * already paid — cannot between them send two receipts for one purchase. A
 * redelivered webhook is the same story.
 *
 * Deliberately does nothing for subscription-channel orders. A member starting
 * a plan gets the subscription confirmation, which is a different email with a
 * different job, and every renewal after that raises an order too — a monthly
 * "your order is confirmed" for a box nobody re-ordered is noise.
 */
export async function queueOrderConfirmation(order: Order): Promise<void> {
  if (order.status !== 'paid') return
  if (order.channel === 'subscription') return
  if (!order.email) return

  try {
    const base = appBaseUrl()
    const confirmation = {
      state: 'confirmed',
      variant: order.channel === 'quiz' ? 'personalised_bundle' : 'standard',
      order: toConfirmationOrder(order),
      subscription: null,
      personalisation: null,
      analytics: null,
    } satisfies ConfirmationResponse

    const receipt = receiptFromConfirmation(confirmation)
    // `null` means the builder would not vouch for the payment. It cannot happen
    // from a `paid` order, but a receipt is the last place to paper over a
    // disagreement between two parts of the system — so no receipt, no email.
    if (!receipt) return

    const reference = orderReference(order)
    const queued = await queueNotification({
      userId: order.userId,
      email: order.email,
      template: 'order-confirmation',
      dedupeKey: `order-confirmation:${order.id}`,
      rendered: orderConfirmation(
        {
          receipt,
          reference,
          firstName: order.shippingAddress?.name?.split(' ')[0] ?? null,
          deliveryWindow: deliveryWindow(confirmation.order.deliveryEstimate),
          accountUrl: order.userId ? `${base}/myhub` : null,
          shopUrl: `${base}/shop`,
        },
        await brandFor(order.email, base),
      ),
    })

    // Straight out, no waiting. A receipt is expected within seconds of paying,
    // and there is no judgement in it for anyone to review.
    await deliverIfAutomatic(queued)
  } catch (err) {
    console.error('[notify] order confirmation could not be queued:', err)
  }
}

/**
 * Confirm a subscription that has just started.
 *
 * Deduped on the Stripe subscription id where there is one and the account id
 * otherwise, so the checkout webhook and a mock signup cannot both fire, and a
 * webhook redelivery cannot either. A member who cancels and later starts a new
 * plan gets a new Stripe id, and therefore a new confirmation — which is right.
 */
export async function queueSubscriptionConfirmation(
  userId: string,
  sub: MemberSubscription,
  opts: {
    /** What Stripe actually charged today, in minor units. Null when unknown. */
    firstPayment?: number | null
    /** Stripe's collected address, when the plan has none of its own yet. */
    email?: string | null
    currency?: string
  } = {},
): Promise<void> {
  const email = sub.customerEmail || opts.email
  if (!email) return

  try {
    const base = appBaseUrl()
    const confirmation = {
      state: 'confirmed',
      variant: 'standard_subscription',
      order: null,
      subscription: toConfirmationSubscription(sub, {
        manageUrl: `${base}/myhub`,
        userId,
        firstPayment: opts.firstPayment ?? null,
        email: opts.email ?? null,
        currency: opts.currency,
      }),
      personalisation: null,
      analytics: null,
    } satisfies ConfirmationResponse

    const receipt = receiptFromConfirmation(confirmation)
    if (!receipt) return

    const queued = await queueNotification({
      userId,
      email,
      template: 'subscription-confirmation',
      dedupeKey: `subscription-confirmation:${sub.stripeSubscriptionId ?? userId}`,
      rendered: subscriptionConfirmation(
        {
          receipt,
          reference: subscriptionReference(sub, userId),
          firstName: sub.shippingAddress?.name?.split(' ')[0] ?? null,
          monthly: sub.flatMonthly,
          nextPayment: longDate(confirmation.subscription?.nextBillingDate),
          minMonths: sub.minMonths,
          hubUrl: `${base}/myhub`,
        },
        await brandFor(email, base),
      ),
    })

    await deliverIfAutomatic(queued)
  } catch (err) {
    console.error('[notify] subscription confirmation could not be queued:', err)
  }
}
