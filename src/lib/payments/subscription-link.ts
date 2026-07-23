/**
 * Stripe subscription ↔ account mapping.
 *
 * Webhook invoices arrive keyed by Stripe subscription id, but our
 * `MemberSubscription` document is keyed by user id. We record the mapping in
 * the kv store when the subscription is created (checkout.session.completed) so
 * later `invoice.paid` / cancellation events can find the right account.
 *
 * Server-only.
 */
import { kvGet, kvSet, kvDelete } from '@/lib/db/kv'

const PREFIX = 'stripe_sub:'

export async function linkStripeSubscription(stripeSubscriptionId: string, userId: string): Promise<void> {
  await kvSet(PREFIX + stripeSubscriptionId, userId)
}

export async function userIdForStripeSubscription(stripeSubscriptionId: string): Promise<string | null> {
  return (await kvGet<string>(PREFIX + stripeSubscriptionId)) ?? null
}

export async function unlinkStripeSubscription(stripeSubscriptionId: string): Promise<void> {
  await kvDelete(PREFIX + stripeSubscriptionId)
}
