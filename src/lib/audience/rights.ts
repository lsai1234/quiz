/**
 * What somebody can ask us to do with their data, and the retention that
 * happens whether they ask or not.
 *
 * Server-only.
 *
 * ── The one rule worth reading before changing anything here ─────────────────
 *
 * **Erasure removes the person; it does not remove the fact that they left.**
 *
 * Deleting somebody's opt-out along with everything else would let the same
 * address be collected again tomorrow — a form fill, a re-import, an old CSV —
 * and start receiving exactly what they told us to stop. That is the opposite
 * of honouring the request, and it is why every suppression list in the
 * industry outlives the record it suppresses. The retained row is the email
 * address and the fact of the opt-out, nothing else, and the privacy notice
 * says so under "Marketing email".
 *
 * ── Retention ───────────────────────────────────────────────────────────────
 *
 * Storage limitation (UK GDPR Art. 5(1)(e)) is a promise the notice makes in a
 * number — `LEAD_RETENTION_MONTHS` — and `purgeStaleLeads` is what makes it
 * true. Both read the same constant, so the promise and the behaviour cannot
 * drift apart.
 */
import { getEngine } from '@/lib/db/engine'
import { LEAD_RETENTION_MONTHS } from '@/lib/legal/content'
import { consentHistory, normaliseEmail } from './consent'
import { deleteLead, getLead } from './leads'
import { listNotifications } from '@/lib/notify/outbox'
import type { EmailLead, MarketingConsentRecord } from './types'

export interface SubjectAccessRecord {
  email: string
  lead: EmailLead | null
  consents: MarketingConsentRecord[]
  /** Every email we have sent this address, subjects and dates only. */
  emails: { template: string; subject: string; sentAt: string | null; status: string }[]
}

/**
 * Everything we hold against one address, for a subject access request.
 *
 * Subjects and dates rather than whole rendered emails: the person asking
 * already received the emails, and a response that is 40 copies of HTML they
 * have in their inbox answers nothing. What they cannot see and are entitled to
 * is the shape of the record — when we started holding this, what they agreed
 * to, and what we sent.
 */
export async function subjectAccessRecord(email: string): Promise<SubjectAccessRecord> {
  const address = normaliseEmail(email)
  const [lead, consents, notifications] = await Promise.all([
    getLead(address),
    consentHistory(address),
    listNotifications({ email: address, limit: 500 }),
  ])

  return {
    email: address,
    lead,
    consents,
    emails: notifications
      .filter((n) => n.email === address)
      .map((n) => ({
        template: n.template,
        subject: n.rendered.subject,
        sentAt: n.sentAt ?? null,
        status: n.status,
      })),
  }
}

export interface ErasureResult {
  email: string
  leadDeleted: boolean
  consentsDeleted: number
  /** True when a suppression record was kept — see the note at the top. */
  suppressionKept: boolean
}

/**
 * Erase somebody.
 *
 * The lead row goes, and the consent history with it — except that a final
 * `opt-out` row is written first, so the suppression list keeps working. That
 * row holds an address and a timestamp: the minimum that makes "do not email me
 * again" enforceable, which is itself the thing they asked for.
 */
export async function eraseAddress(email: string): Promise<ErasureResult> {
  const address = normaliseEmail(email)
  const db = await getEngine()

  const before = await consentHistory(address)
  const lead = await getLead(address)

  await db.run('DELETE FROM marketing_consents WHERE email = ?', [address])
  await deleteLead(address)

  // Written after the delete, so it is the only row left: the fact that this
  // address must not be marketed to, and nothing about the person.
  const { recordMarketingConsent } = await import('./consent')
  const { suppressMarketing } = await import('@/lib/notify/marketing')
  await suppressMarketing(address)
  await recordMarketingConsent({
    email: address,
    action: 'opt-out',
    basis: 'consent',
    source: 'erasure-request',
  })

  return {
    email: address,
    leadDeleted: lead != null,
    consentsDeleted: before.length,
    suppressionKept: true,
  }
}

/** The cut-off date for the retention window, as an ISO timestamp. */
export function retentionCutoff(now = new Date(), months = LEAD_RETENTION_MONTHS): string {
  const cutoff = new Date(now)
  cutoff.setMonth(cutoff.getMonth() - months)
  return cutoff.toISOString()
}

export interface PurgeResult {
  cutoff: string
  purged: number
}

/**
 * Delete leads nobody has heard from since the retention window opened.
 *
 * Two exemptions, both deliberate:
 *
 *  • **Customers are not purged here.** An address attached to an account is
 *    part of an order record we are required to keep for six years, and
 *    deleting the lead row would not delete the account anyway — it would just
 *    make the two disagree.
 *  • **`last_seen_at`, not `first_seen_at`.** Somebody who took the quiz again
 *    last month is not a stale address, whatever the date on the original row
 *    says.
 *
 * `dryRun` counts without deleting, which is what the daily job's own dry run
 * uses and what makes it safe to look at the number before trusting it.
 */
export async function purgeStaleLeads(options: { now?: Date; dryRun?: boolean } = {}): Promise<PurgeResult> {
  const cutoff = retentionCutoff(options.now ?? new Date())
  const db = await getEngine()

  const stale = await db.all<{ email: string }>(
    'SELECT email FROM email_leads WHERE last_seen_at < ? AND user_id IS NULL',
    [cutoff],
  )

  if (!options.dryRun) {
    for (const row of stale) await deleteLead(row.email)
  }

  return { cutoff, purged: stale.length }
}
