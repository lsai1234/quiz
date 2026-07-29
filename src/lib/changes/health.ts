/**
 * A member subscription as the Founders Hub lists it.
 *
 * Pure — the route does the reads and hands the pieces in. The health badge is
 * the whole point of the list: with a few hundred members nobody scrolls, so
 * the only useful ordering is "who needs me, and by when".
 */
import type { MemberSubscription } from '@/lib/recharge/types'
import { policyForLine } from './policy'
import type { ChangeEvent } from './types'

export type SubscriptionHealth =
  /** Something is waiting on a founder, with a deadline. */
  | 'requires-action'
  /** Resolved, but takes effect later (a price rise inside its notice period). */
  | 'scheduled'
  /** Nothing outstanding. */
  | 'healthy'

export interface SubscriptionSummary {
  userId: string
  email: string
  status: MemberSubscription['status']
  flatMonthly: number
  lineCount: number
  health: SubscriptionHealth
  /** Open events concerning this member. */
  openCount: number
  /** The soonest auto-apply deadline among them, for the countdown. */
  nextAutoApplyAt: string | null
  defaultChangePolicy: string
  /** Lines the member has set individually. */
  overriddenLines: number
  startedAt: string
}

/** Health from the member's open events. */
export function healthFor(events: ChangeEvent[]): SubscriptionHealth {
  if (events.some((e) => e.status === 'requires-action')) return 'requires-action'
  if (events.some((e) => e.status === 'scheduled')) return 'scheduled'
  return 'healthy'
}

export function summarise(
  userId: string,
  subscription: MemberSubscription,
  events: ChangeEvent[],
): SubscriptionSummary {
  const deadlines = events
    .filter((e) => e.status === 'requires-action' && e.autoApplyAt)
    .map((e) => e.autoApplyAt)
    .sort()

  return {
    userId,
    email: subscription.customerEmail,
    status: subscription.status,
    flatMonthly: subscription.flatMonthly,
    lineCount: subscription.lines.length,
    health: healthFor(events),
    openCount: events.length,
    nextAutoApplyAt: deadlines[0] ?? null,
    defaultChangePolicy: policyForLine(subscription, {}),
    overriddenLines: subscription.lines.filter((l) => l.changePolicy !== undefined).length,
    startedAt: subscription.startedAt,
  }
}

const HEALTH_ORDER: Record<SubscriptionHealth, number> = {
  'requires-action': 0,
  scheduled: 1,
  healthy: 2,
}

/**
 * Amber first, then whatever's scheduled, then everyone else. Within a band the
 * soonest deadline wins — the list should read as a to-do, not a directory.
 */
export function sortByUrgency(summaries: SubscriptionSummary[]): SubscriptionSummary[] {
  return [...summaries].sort((a, b) => {
    const byHealth = HEALTH_ORDER[a.health] - HEALTH_ORDER[b.health]
    if (byHealth !== 0) return byHealth
    if (a.nextAutoApplyAt && b.nextAutoApplyAt) return a.nextAutoApplyAt.localeCompare(b.nextAutoApplyAt)
    if (a.nextAutoApplyAt) return -1
    if (b.nextAutoApplyAt) return 1
    return a.email.localeCompare(b.email)
  })
}

/** "in 19h" / "in 45m" / "any moment" — the countdown on a queue row. */
export function countdownTo(iso: string | null, now: Date = new Date()): string | null {
  if (!iso) return null
  const ms = new Date(iso).getTime() - now.getTime()
  if (Number.isNaN(ms)) return null
  if (ms <= 0) return 'any moment'
  const hours = Math.floor(ms / 3_600_000)
  if (hours >= 24) return `in ${Math.round(hours / 24)}d`
  if (hours >= 1) return `in ${hours}h`
  return `in ${Math.max(1, Math.round(ms / 60_000))}m`
}
