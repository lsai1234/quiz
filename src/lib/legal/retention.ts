/**
 * Storage limitation, enforced.
 *
 * Article 5(1)(e): personal data kept no longer than the purpose needs. The
 * retention discipline in this codebase used to be inverted — error events were
 * pruned at 30 days and password resets at 90, while the quiz answers, the
 * consent metadata and the rendered bodies of every email ever sent grew
 * without limit. The sensitive tables were the ones with no window at all.
 *
 * Every window here comes from `RETENTION` in `content.ts`, which the privacy
 * notice also renders from. That is the point of the shared constant: the notice
 * cannot promise a period this job does not enforce, and changing one changes
 * both.
 *
 * ── The shape of every sweep ────────────────────────────────────────────────
 * Each is idempotent, bounded by a timestamp comparison, and independently
 * failable. A sweep that throws is logged and skipped rather than taking the
 * nightly job down with it: falling behind on retention for a day is a small
 * problem, and a cron that stops running because one statement failed is a much
 * larger one — it would silently stop the order and stock sweeps too.
 *
 * Server-only.
 */
import { getEngine } from '@/lib/db/engine'
import { RETENTION } from './content'

export interface SweepResult {
  /** Rows affected per sweep, for the cron's summary line. */
  quizAnswers: number
  emailBodies: number
  consentMetadata: number
  analyticsEvents: number
  abandonedAccounts: number
  /** Sweeps that threw, by name. Non-empty means retention is falling behind. */
  failed: string[]
}

function cutoff(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
}

/** Run one sweep, counting what it touched, without letting it fail the job. */
async function sweep(
  name: string,
  failed: string[],
  run: () => Promise<number>,
): Promise<number> {
  try {
    return await run()
  } catch (err) {
    console.error(`[retention] ${name} failed:`, err)
    failed.push(name)
    return 0
  }
}

/**
 * Quiz answers belonging to plans that ended more than the window ago.
 *
 * Targets `subscriptions.quiz` rather than the row: the plan itself is the
 * billing history and stays. What goes is the health data — the safety flags,
 * the wellbeing answers, the free-text follow-ups — which has no purpose once
 * somebody has gone and is the most sensitive thing in the database.
 *
 * `status` lives inside the JSON document, which neither dialect can index into
 * portably, so the filter is done in the application. The row count here is
 * every subscription that has ever existed, which is fine at this size and is
 * the same read `listSubscriptions` already does nightly.
 */
async function sweepQuizAnswers(): Promise<number> {
  const db = await getEngine()
  const before = cutoff(RETENTION.quizAfterEndDays)
  const rows = await db.all<{ user_id: string; data: string; quiz: string | null; updated_at: string }>(
    'SELECT user_id, data, quiz, updated_at FROM subscriptions WHERE quiz IS NOT NULL',
  )

  let cleared = 0
  for (const row of rows) {
    if (row.updated_at >= before) continue
    let status: string | undefined
    try {
      status = (JSON.parse(row.data) as { status?: string }).status
    } catch {
      // An unreadable plan document is not evidence the member is still active,
      // and the answers beside it are still health data past their window.
      status = undefined
    }
    if (status === 'active' || status === 'paused') continue

    await db.run('UPDATE subscriptions SET quiz = NULL WHERE user_id = ?', [row.user_id])
    cleared++
  }
  return cleared
}

/** What replaces a pruned email body. Also the marker that stops re-sweeping it. */
const PRUNED_BODY = JSON.stringify({ pruned: true })

/**
 * The rendered body of emails past the window.
 *
 * The row survives — which template went to whom and when is the audit trail the
 * Founders Hub is built on, and it is what proves a price-rise notice was sent.
 * What goes is `data`, which holds the full rendered message: a receipt carries
 * the customer's name, their delivery address and their whole order.
 *
 * `sent_at IS NOT NULL` so nothing still queued is emptied out before it goes.
 */
async function sweepEmailBodies(): Promise<number> {
  const db = await getEngine()
  const before = cutoff(RETENTION.emailBodyDays)
  const rows = await db.all<{ id: string }>(
    `SELECT id FROM notifications
     WHERE sent_at IS NOT NULL AND sent_at < ? AND data <> ?`,
    [before, PRUNED_BODY],
  )
  for (const row of rows) {
    await db.run('UPDATE notifications SET data = ? WHERE id = ?', [PRUNED_BODY, row.id])
  }
  return rows.length
}

/**
 * IP address and user agent on consent records past the window.
 *
 * The consent itself is kept for years — it is the evidence of what somebody
 * agreed to. The request metadata beside it is only there for evidential weight
 * and stops earning its keep long before the consent does, so it is stripped
 * from the stored document while everything else about the record stays.
 */
async function sweepConsentMetadata(): Promise<number> {
  const db = await getEngine()
  const before = cutoff(RETENTION.consentMetadataDays)
  const rows = await db.all<{ id: string; data: string }>(
    'SELECT id, data FROM consents WHERE accepted_at < ?',
    [before],
  )

  let scrubbed = 0
  for (const row of rows) {
    let record: { ip?: unknown; userAgent?: unknown }
    try {
      record = JSON.parse(row.data)
    } catch {
      continue
    }
    if (record.ip == null && record.userAgent == null) continue

    await db.run('UPDATE consents SET data = ? WHERE id = ?', [
      JSON.stringify({ ...record, ip: null, userAgent: null }),
      row.id,
    ])
    scrubbed++
  }
  return scrubbed
}

/** Funnel events past the window. Anonymous, but not therefore permanent. */
async function sweepAnalytics(): Promise<number> {
  const db = await getEngine()
  const before = cutoff(RETENTION.analyticsDays)
  const row = await db.get<{ count: number }>(
    'SELECT COUNT(*) AS count FROM analytics_events WHERE created_at < ?',
    [before],
  )
  await db.run('DELETE FROM analytics_events WHERE created_at < ?', [before])
  return Number(row?.count ?? 0)
}

/**
 * Accounts that started a checkout, never paid, and have gone quiet.
 *
 * This is the orphan case. `finalizeCheckout` writes the account, the plan and
 * the quiz answers BEFORE starting the payment, so everyone who abandons at the
 * Stripe page leaves a complete health profile attached to an account with no
 * order behind it. Nothing ever came back for those rows.
 *
 * Erasing rather than merely clearing the answers, because there is nothing else
 * to keep: no order, no payment, no relationship. The check for orders is what
 * keeps a real customer safe — anyone who has ever bought is out of scope here
 * regardless of how quiet their account has gone.
 */
async function sweepAbandonedAccounts(): Promise<number> {
  const { deleteAccount } = await import('@/lib/db/erasure')
  const db = await getEngine()
  const before = cutoff(RETENTION.abandonedAccountDays)

  const rows = await db.all<{ id: string }>(
    `SELECT u.id FROM users u
     WHERE u.created_at < ?
       AND NOT EXISTS (SELECT 1 FROM orders o WHERE o.user_id = u.id)
       AND NOT EXISTS (
         SELECT 1 FROM subscriptions s
         WHERE s.user_id = u.id AND (s.data LIKE '%"status":"active"%' OR s.data LIKE '%"status":"paused"%')
       )
       AND u.email NOT LIKE 'erased-%'`,
    [before],
  )

  for (const row of rows) await deleteAccount(row.id)
  return rows.length
}

/**
 * Every retention sweep. Called nightly from `/api/cron/daily`.
 *
 * Returns counts rather than throwing, so the cron can report "retention ran and
 * touched nothing" — which is the normal answer — distinctly from "retention did
 * not run", which is the one worth an alarm.
 */
export async function runRetentionSweeps(): Promise<SweepResult> {
  const failed: string[] = []
  return {
    quizAnswers: await sweep('quiz answers', failed, sweepQuizAnswers),
    emailBodies: await sweep('email bodies', failed, sweepEmailBodies),
    consentMetadata: await sweep('consent metadata', failed, sweepConsentMetadata),
    analyticsEvents: await sweep('analytics events', failed, sweepAnalytics),
    abandonedAccounts: await sweep('abandoned accounts', failed, sweepAbandonedAccounts),
    failed,
  }
}

/** Exported for the tests, which need to reach each sweep on its own. */
export const __sweeps = {
  sweepQuizAnswers,
  sweepEmailBodies,
  sweepConsentMetadata,
  sweepAnalytics,
  sweepAbandonedAccounts,
}
