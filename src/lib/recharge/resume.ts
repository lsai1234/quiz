/**
 * Snoozes that have run their course.
 *
 * `snoozeSubscription` caps a pause at three months and writes `snoozeUntil`,
 * and the hub tells the member "Back on 14 March — nothing billed until then".
 * Nothing made that true. `resumeSubscription` was only ever reached by the
 * member pressing "Resume now" themselves, the daily job never looked at
 * snoozes, and Stripe's `pause_collection` was set without a `resumes_at` — so
 * a plan snoozed for three months stayed paused indefinitely, with a date on
 * screen that came and went.
 *
 * A promise on a screen needs something that keeps it. This is that something,
 * and it runs in the daily job.
 *
 * The app drives it rather than Stripe's own `resumes_at` on purpose: if Stripe
 * resumed billing by itself our stored status would still read `paused`, and a
 * member would be charged by a plan the hub says is on hold. One owner, and it
 * is the side that also owns the record.
 */
import { listSubscriptions, saveSubscription } from '@/lib/db/hub-data'
import { syncSubscriptionToStripe } from '@/lib/payments/subscription-sync'
import { resumeSubscription } from './mock'
import type { MemberSubscription } from './types'

/** Whether a snooze has run out. Never true for a plan paused without a date —
 *  an open-ended pause is a member's choice, and waits for them. */
export function snoozeHasExpired(sub: MemberSubscription, now: Date = new Date()): boolean {
  if (sub.status !== 'paused' || !sub.snoozeUntil) return false
  const until = new Date(sub.snoozeUntil)
  if (Number.isNaN(until.getTime())) return false
  return until.getTime() <= now.getTime()
}

export interface ResumeResult {
  /** How many plans came back on. */
  resumed: number
  /** Members whose Stripe resume failed — billing is still paused for them. */
  stripeErrors: string[]
}

/**
 * Bring back every plan whose snooze has expired.
 *
 * Idempotent: a resumed plan is `active` and no longer matches, so a second run
 * today does nothing. A Stripe failure is recorded and the local resume still
 * stands — the opposite would leave a member paused past a date we promised,
 * which is the thing this exists to prevent.
 */
export async function resumeDueSnoozes(now: Date = new Date()): Promise<ResumeResult> {
  const all = await listSubscriptions()
  const due = all.filter(({ subscription }) => snoozeHasExpired(subscription, now))

  const stripeErrors: string[] = []
  let resumed = 0

  for (const { userId, subscription } of due) {
    const next = resumeSubscription(subscription)
    try {
      const sync = await syncSubscriptionToStripe(subscription, next)
      if (!sync.ok) stripeErrors.push(userId)
    } catch (err) {
      console.error(`[resume] Stripe resume failed for ${userId}:`, err)
      stripeErrors.push(userId)
    }
    await saveSubscription(userId, next)
    resumed += 1
  }

  return { resumed, stripeErrors }
}
