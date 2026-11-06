/**
 * Who the member hub is open to, and until when (server-only).
 *
 *   One-off buyer   90 days from their latest order; any order resets it
 *   Subscriber      while the plan is active or paused, then 90 days after it
 *                   was cancelled (or after their latest order, if later)
 *   Ended           the guide and order history, read-only; the rest says
 *                   "Order again to unlock"
 *
 * Orders are matched on the account or on the email they were placed with,
 * so an order made as a guest joins as soon as they sign in with that email.
 */
import type { UserRecord } from '@/lib/db/users'

export const HUB_DAYS = 90
const DAY = 86_400_000

export type HubState = 'subscriber' | 'member' | 'ended' | 'none'

export interface HubAccess {
  state: HubState
  /** YYYY-MM-DD the hub closes; null while a plan is running, or never opened. */
  until: string | null
  /** Whole days left; null as for `until`. */
  daysLeft: number | null
  /** The plan, when there is one. */
  plan: 'active' | 'paused' | 'cancelled' | null
}

type Who = Pick<UserRecord, 'id' | 'email'>

/** Pure: the hub's state from the facts. */
export function hubAccessFrom(input: {
  plan: { status: 'active' | 'paused' | 'cancelled'; cancelledAt?: string | null } | null
  latestOrderAt: string | null
  now: Date
}): HubAccess {
  const { plan, latestOrderAt, now } = input
  if (plan && plan.status !== 'cancelled') return { state: 'subscriber', until: null, daysLeft: null, plan: plan.status }
  const starts = [latestOrderAt, plan?.status === 'cancelled' ? (plan.cancelledAt ?? null) : null]
    .filter((s): s is string => Boolean(s) && Number.isFinite(Date.parse(s as string)))
    .map((s) => Date.parse(s))
  if (!starts.length) return { state: 'none', until: null, daysLeft: null, plan: plan?.status ?? null }
  const end = Math.max(...starts) + HUB_DAYS * DAY
  const until = new Date(end).toISOString().slice(0, 10)
  const left = Math.ceil((end - now.getTime()) / DAY)
  return left > 0
    ? { state: 'member', until, daysLeft: left, plan: plan?.status ?? null }
    : { state: 'ended', until, daysLeft: 0, plan: plan?.status ?? null }
}

export async function hubAccess(user: Who, now = new Date()): Promise<HubAccess> {
  const { getSubscription } = await import('@/lib/db/hub-data')
  const { latestPaidOrderFor } = await import('@/lib/orders/repo')
  const [sub, order] = await Promise.all([getSubscription(user.id), latestPaidOrderFor({ userId: user.id, email: user.email })])
  return hubAccessFrom({
    plan: sub ? { status: sub.status, cancelledAt: sub.cancelledAt ?? null } : null,
    latestOrderAt: order?.createdAt ?? null,
    now,
  })
}

/** Open: everything in the hub works. */
export const isOpen = (a: HubAccess) => a.state === 'subscriber' || a.state === 'member'
