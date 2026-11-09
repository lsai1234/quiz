/**
 * Where hub plans live (server-only): one per account, in the kv store, with
 * the Stripe subscription mapped back to the account the same way the box
 * plans' are (`payments/subscription-link`).
 */
import { kvDelete, kvGet, kvListPrefix, kvSet } from '@/lib/db/kv'
import type { HubPlan } from './plan'

const PREFIX = 'hub-plan:'
const key = (userId: string) => `${PREFIX}${userId}`

export async function getHubPlan(userId: string): Promise<HubPlan | null> {
  return (await kvGet<HubPlan>(key(userId))) ?? null
}

export async function saveHubPlan(plan: HubPlan, now = new Date()): Promise<HubPlan> {
  const next = { ...plan, updatedAt: now.toISOString() }
  await kvSet(key(plan.userId), next)
  return next
}

export async function deleteHubPlan(userId: string): Promise<void> {
  await kvDelete(key(userId))
}

export async function listHubPlans(limit = 5000): Promise<HubPlan[]> {
  return (await kvListPrefix<HubPlan>(PREFIX, limit)).map((r) => r.value)
}

/** The account a hub plan's Stripe subscription belongs to, if it is a hub plan. */
export async function hubPlanForStripeSubscription(stripeSubscriptionId: string): Promise<HubPlan | null> {
  const { userIdForStripeSubscription } = await import('@/lib/payments/subscription-link')
  const userId = await userIdForStripeSubscription(stripeSubscriptionId)
  if (!userId) return null
  const plan = await getHubPlan(userId)
  return plan?.stripeSubscriptionId === stripeSubscriptionId ? plan : null
}
