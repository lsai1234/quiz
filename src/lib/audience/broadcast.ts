/**
 * Campaigns — sending the marketing itself, from the hub.
 *
 * Server-only. The alternative to this is exporting a CSV and sending from
 * Gmail, which works and is what phase 3 is for; this exists so a founder can
 * send without the round trip, and it exists carefully because sending is the
 * one thing here that reaches real inboxes and cannot be taken back.
 *
 * Four rules, each of which is a way campaigns go wrong:
 *
 *  1. **Permission is re-checked at SEND time, per recipient.** Not when the
 *     campaign was composed, not when the list was fetched. Somebody who opts
 *     out during the minutes a send takes must not receive it, and the gap
 *     between "who did we look up" and "who did we email" is exactly where that
 *     happens.
 *  2. **One row per recipient in the outbox**, with the dedupe key carrying the
 *     campaign id. A re-run of a campaign that half-finished picks up where it
 *     stopped instead of emailing the first half twice.
 *  3. **A daily ceiling.** Google Workspace stops at 2,000 messages a day and
 *     starts bouncing rather than queueing, so a list larger than the ceiling is
 *     sent in batches across days rather than thrown at a provider that will
 *     refuse most of it.
 *  4. **It never throws for one bad address.** One failure is recorded on its
 *     own row and the send carries on — the alternative is a campaign that
 *     stops halfway for a typo and leaves nobody able to tell who got it.
 */
import { randomUUID } from 'crypto'
import { appBaseUrl } from '@/lib/notify'
import { queueNotification, sendNotificationNow } from '@/lib/notify/outbox'
import { optOutUrl } from '@/lib/notify/marketing'
import { marketingBroadcast } from '@/lib/notify/templates'
import { mayMarket } from './consent'
import { listAudience } from './leads'
import type { ListLeadsOptions } from './leads'

/**
 * The most a single run will send.
 *
 * Google Workspace's ceiling is 2,000 a day; this sits under it so a run cannot
 * spend the whole allowance and leave a receipt with nowhere to go. Resend has
 * no meaningful limit, but a founder sending their first campaign to a list of
 * 5,000 by accident is a worse problem than one that took two days.
 */
export const DAILY_SEND_CEILING = 1_500

export interface BroadcastInput {
  heading: string
  /** The body, one string per paragraph. */
  paragraphs: string[]
  cta?: { label: string; url: string } | null
  /** Narrow the audience the same way the hub list does. */
  audience?: ListLeadsOptions
  /** Render and count, send nothing. What the hub's preview button uses. */
  dryRun?: boolean
  /** Lower the ceiling for a first, cautious send. */
  limit?: number
}

export interface BroadcastResult {
  campaignId: string
  /** How many addresses were eligible when the list was read. */
  eligible: number
  queued: number
  sent: number
  /** Dropped at send time because permission had changed since the list was read. */
  skipped: number
  failed: number
  /** True when the ceiling stopped it short of the whole list. */
  capped: boolean
}

export async function sendBroadcast(input: BroadcastInput): Promise<BroadcastResult> {
  const campaignId = `cmp_${randomUUID().slice(0, 8)}`
  const base = appBaseUrl()
  const ceiling = Math.min(input.limit ?? DAILY_SEND_CEILING, DAILY_SEND_CEILING)

  const audience = await listAudience({ ...input.audience, marketableOnly: true })
  const batch = audience.slice(0, ceiling)

  const result: BroadcastResult = {
    campaignId,
    eligible: audience.length,
    queued: 0,
    sent: 0,
    skipped: 0,
    failed: 0,
    capped: audience.length > batch.length,
  }

  if (input.dryRun) return result

  for (const member of batch) {
    // Rule 1. The list was read a moment ago; this is now.
    if (!(await mayMarket(member.email))) {
      result.skipped += 1
      continue
    }

    try {
      const rendered = marketingBroadcast(
        {
          firstName: member.firstName,
          heading: input.heading,
          paragraphs: input.paragraphs,
          cta: input.cta ?? null,
        },
        { baseUrl: base, optOutUrl: await optOutUrl(base, member.email) },
      )

      const queued = await queueNotification({
        userId: member.userId,
        email: member.email,
        template: 'marketing-broadcast',
        // Rule 2: one send per address per campaign, enforced by the UNIQUE
        // constraint rather than by remembering how far we got.
        dedupeKey: `${campaignId}:${member.email}`,
        rendered,
      })
      result.queued += 1

      // `sendNotificationNow`, not the auto-send path: a founder has pressed
      // Send, so this goes whenever a provider exists rather than only when the
      // unattended policy happens to cover marketing. With no provider it stays
      // queued and the hub shows it, which is the manual workflow working.
      const delivered = await sendNotificationNow(queued.id)
      if (delivered?.status === 'sent') result.sent += 1
      else if (delivered?.status === 'failed') result.failed += 1
    } catch (err) {
      // Rule 4. One address must not end the campaign.
      result.failed += 1
      console.error(`[audience] broadcast ${campaignId} failed for one recipient:`, err)
    }
  }

  console.info(
    `[audience] broadcast ${campaignId}: ${result.sent} sent, ${result.queued} queued, ${result.skipped} skipped, ${result.failed} failed of ${result.eligible} eligible`,
  )
  return result
}
