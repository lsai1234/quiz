/**
 * Going live: the preflight checklist, and the reset that clears the test data.
 *
 * Switching from Stripe's sandbox to real keys is a one-way door with a lot of
 * small ways to get it wrong, and two of them are expensive:
 *
 *   1. Going live with the test data still in the database, so the first real
 *      month's numbers are mixed in with a hundred £0 orders you made yourself.
 *   2. Running the cleanup *after* going live, and deleting a real customer's
 *      order along with them.
 *
 * This module addresses both. `preflight()` is the checklist — read from the
 * running deployment rather than from a document, so it cannot go stale.
 * `resetPreview()` and `runReset()` are the cleanup, and they are built so that
 * (2) cannot happen: **nothing marked `live` is ever deleted, under any
 * argument.** There is no force flag, because there is no version of "delete
 * this customer's paid order" that this tool should make easy.
 *
 * ── How the live guard actually holds ───────────────────────────────────────
 * `orders` and `subscriptions` carry a `mode` column (migration v15) recording
 * the Stripe world that wrote them. Those two are filtered directly.
 *
 * Everything downstream — changes, consents, the outbox, commissions — has no
 * such column, so it is never filtered by mode. Instead each dependent delete is
 * phrased as **orphan cleanup**: "remove rows that no longer belong to anything
 * that survived". Run after the parents are deleted, that is exactly right in
 * both cases, with no second rule to keep in step:
 *
 *   - no live data      → every parent goes, so every dependent is an orphan
 *   - live data present → live parents survive, so their dependents are not
 *                         orphans and are left alone
 *
 * It is also idempotent, which matters more than it looks: `SqlEngine` exposes
 * no transaction, and wrapping one by hand is unsafe on Postgres because the
 * pool does not promise consecutive queries land on the same connection. So a
 * reset interrupted halfway leaves orphans rather than corruption, and running
 * it again finishes the job.
 *
 * Server-only. Every entry point is behind `isPortalAuthed`.
 */
import { getEngine } from '@/lib/db/engine'
import { kvGet, kvSet } from '@/lib/db/kv'
import {
  currentStripeWorld,
  getPaymentSource,
  getStripeEnvironment,
  stripeKeysFor,
  type StripeWorld,
} from '@/lib/payments'

/** What a reset can be asked to clear. */
export type ResetGroupId =
  | 'orders'
  | 'subscriptions'
  | 'outbox'
  | 'partnerEarnings'
  | 'competition'
  | 'analytics'
  | 'errorLog'

export interface ResetGroup {
  id: ResetGroupId
  label: string
  description: string
  /** Ticked by default — the money. The rest is opt-in. */
  defaultOn: boolean
  /** Tables counted for the preview, in the order they are cleared. */
  tables: string[]
}

/**
 * The groups, in dependency order.
 *
 * `orders` before `partnerEarnings` and `subscriptions` before `outbox` is not
 * cosmetic: the dependent groups are orphan sweeps, so they only remove the
 * right rows once their parents are already gone.
 */
export const RESET_GROUPS: ResetGroup[] = [
  {
    id: 'orders',
    label: 'Orders',
    description: 'Every shop, quiz and subscription order, and its fulfilment state.',
    defaultOn: true,
    tables: ['orders'],
  },
  {
    id: 'subscriptions',
    label: 'Subscriptions',
    description:
      'Member subscriptions, the product-change queue, stock exceptions and the consent records attached to them.',
    defaultOn: true,
    tables: ['subscriptions', 'subscription_changes', 'stock_exceptions', 'consents'],
  },
  {
    id: 'outbox',
    label: 'Emails',
    description: 'Everything queued, sent or failed in the notification outbox.',
    defaultOn: true,
    tables: ['notifications'],
  },
  {
    id: 'partnerEarnings',
    label: 'Partner earnings',
    description:
      'Commission and payout rows for test orders. Partner accounts and their codes are kept.',
    defaultOn: true,
    tables: ['partner_commissions', 'partner_payouts'],
  },
  {
    id: 'competition',
    label: 'Share cards and competition entries',
    description: 'Generated share cards and any prize-draw entries made while testing.',
    defaultOn: false,
    tables: ['share_cards', 'competition_entries'],
  },
  {
    id: 'analytics',
    label: 'Analytics',
    description: 'The anonymous funnel events behind the quiz drop-off figures.',
    defaultOn: false,
    tables: ['analytics_events'],
  },
  {
    id: 'errorLog',
    label: 'Error log',
    description: 'Recorded errors and their triage state, from the monitoring page.',
    defaultOn: false,
    tables: ['error_events', 'error_groups'],
  },
]

/* ────────────────────────────────────────────────────────────────────────────
 * Preflight
 * ──────────────────────────────────────────────────────────────────────────*/

export type CheckState = 'ok' | 'todo' | 'warn'

export interface PreflightItem {
  id: string
  label: string
  state: CheckState
  detail: string
}

const PLACEHOLDERS = ['', 'Your Company Ltd', '12345678', '1 Example Street, London, N1 1AA']

function envSet(name: string): boolean {
  const v = process.env[name]
  return !!v && !PLACEHOLDERS.includes(v)
}

/**
 * The go-live checklist, read from the running deployment.
 *
 * Everything here is a question the environment can answer about itself. A
 * printed checklist goes stale the moment someone changes a variable and
 * forgets to redeploy — which, since `NEXT_PUBLIC_*` values are baked in at
 * build time, is the single most common way this all goes wrong.
 *
 * What it deliberately cannot check: whether the Stripe Billing Portal is
 * enabled in live mode, and whether account activation has completed. Both live
 * in Stripe's dashboard and neither is visible from here — `docs/STRIPE_GO_LIVE.md`
 * carries them, and the UI links to it rather than implying this list is
 * exhaustive.
 */
export async function preflight(): Promise<PreflightItem[]> {
  const world = currentStripeWorld()
  const environment = getStripeEnvironment()
  const liveKeys = stripeKeysFor('live')
  const items: PreflightItem[] = []

  // Two questions now, not one: are the live keys THERE, and are they SELECTED.
  // Since the switch became a setting, "we have the live key" stopped implying
  // "we are using it" — and a checklist that ticked on the first would be
  // reassuring about a deployment still charging nobody.
  items.push({
    id: 'stripe-key',
    label: 'Live Stripe key',
    state: liveKeys.secretKey ? 'ok' : 'todo',
    detail: liveKeys.secretKey
      ? `A live key (…${liveKeys.secretKey.slice(-4)}) is configured.`
      : 'No live secret key is set. Add STRIPE_LIVE_SECRET_KEY (sk_live_…) from the Stripe dashboard with test mode switched off.',
  })

  items.push({
    id: 'stripe-selected',
    label: 'Switched to live',
    state: world === 'live' ? 'ok' : 'todo',
    detail:
      world === 'live'
        ? 'Checkout is charging real cards.'
        : getPaymentSource() !== 'stripe'
          ? 'Payments are switched to mock, so checkout charges nobody. Switch them to Stripe in Settings → Payments.'
          : environment === 'test'
            ? 'Stripe is switched to test mode. Flip it to live in Settings → Payments when you are ready — no redeploy needed.'
            : 'Stripe is switched to live but the selected key is not a live key.',
  })

  items.push({
    id: 'webhook-secret',
    label: 'Live webhook signing secret',
    state: liveKeys.webhookSecret ? 'ok' : 'todo',
    detail: liveKeys.webhookSecret
      ? 'Set. It is the secret from the *live* endpoint — test and live have different ones.'
      : 'Unset. Set STRIPE_LIVE_WEBHOOK_SECRET. Without it no live webhook is verified, so no order is ever marked paid.',
  })

  items.push({
    id: 'app-url',
    label: 'App URL',
    state: process.env.APP_URL ? 'ok' : 'todo',
    detail: process.env.APP_URL
      ? `Stripe returns customers to ${process.env.APP_URL}.`
      : 'Unset — Stripe return links and email links may point at localhost.',
  })

  items.push({
    id: 'cron-secret',
    label: 'Cron secret',
    state: process.env.CRON_SECRET ? 'ok' : 'todo',
    detail: process.env.CRON_SECRET
      ? 'Set, so the daily job can run in production.'
      : 'Unset. The daily job is closed in production without it, and subscriptions stop advancing.',
  })

  // The consented terms name the company. Getting this wrong is not cosmetic:
  // the evidence trail points at a document naming nobody.
  const legal = ['NEXT_PUBLIC_LEGAL_NAME', 'NEXT_PUBLIC_COMPANY_NUMBER', 'NEXT_PUBLIC_REGISTERED_ADDRESS']
  const missingLegal = legal.filter((n) => !envSet(n))
  items.push({
    id: 'legal',
    label: 'Company details on the terms',
    state: missingLegal.length === 0 ? 'ok' : 'todo',
    detail:
      missingLegal.length === 0
        ? 'The subscription terms name your company.'
        : `Still placeholders: ${missingLegal.join(', ')}. Set these before the first real consent is recorded — they are NEXT_PUBLIC_*, so they need a redeploy, not a restart.`,
  })

  items.push({
    id: 'support-email',
    label: 'Support email',
    state: envSet('NEXT_PUBLIC_SUPPORT_EMAIL') ? 'ok' : 'warn',
    detail: envSet('NEXT_PUBLIC_SUPPORT_EMAIL')
      ? 'Customers have somewhere to write to.'
      : 'Unset, so the terms and emails carry no contact address.',
  })

  // The reset is the last thing on the list because it is the last thing you do.
  const counts = await resetPreview(RESET_GROUPS.filter((g) => g.defaultOn).map((g) => g.id))
  items.push({
    id: 'test-data',
    label: 'Test data cleared',
    state: counts.total === 0 ? 'ok' : 'todo',
    detail:
      counts.total === 0
        ? 'No test orders or subscriptions are left in the database.'
        : `${counts.total} row${counts.total === 1 ? '' : 's'} of test data would be cleared by the reset below.`,
  })

  return items
}

/* ────────────────────────────────────────────────────────────────────────────
 * The reset
 * ──────────────────────────────────────────────────────────────────────────*/

/**
 * The delete each table gets.
 *
 * `orders` and `subscriptions` filter on `mode` — that is the live guard, and
 * `COALESCE` treats an untagged row as sandbox, which is what migration v15
 * backfilled every pre-existing row to.
 *
 * Everything else is an orphan sweep against whatever survived. Read them in the
 * order `RESET_GROUPS` lists them; each assumes its parents are already gone.
 */
const DELETES: Record<string, { sql: string; countSql: string }> = {
  orders: {
    sql: "DELETE FROM orders WHERE COALESCE(mode, 'sandbox') <> 'live'",
    countSql: "SELECT COUNT(*) AS count FROM orders WHERE COALESCE(mode, 'sandbox') <> 'live'",
  },
  subscriptions: {
    sql: "DELETE FROM subscriptions WHERE COALESCE(mode, 'sandbox') <> 'live'",
    countSql: "SELECT COUNT(*) AS count FROM subscriptions WHERE COALESCE(mode, 'sandbox') <> 'live'",
  },
  subscription_changes: {
    sql: 'DELETE FROM subscription_changes WHERE user_id IS NULL OR user_id NOT IN (SELECT user_id FROM subscriptions)',
    countSql:
      'SELECT COUNT(*) AS count FROM subscription_changes WHERE user_id IS NULL OR user_id NOT IN (SELECT user_id FROM subscriptions)',
  },
  stock_exceptions: {
    sql: 'DELETE FROM stock_exceptions WHERE user_id IS NULL OR user_id NOT IN (SELECT user_id FROM subscriptions)',
    countSql:
      'SELECT COUNT(*) AS count FROM stock_exceptions WHERE user_id IS NULL OR user_id NOT IN (SELECT user_id FROM subscriptions)',
  },
  consents: {
    sql: 'DELETE FROM consents WHERE user_id NOT IN (SELECT user_id FROM subscriptions)',
    countSql:
      'SELECT COUNT(*) AS count FROM consents WHERE user_id NOT IN (SELECT user_id FROM subscriptions)',
  },
  notifications: {
    sql: 'DELETE FROM notifications WHERE user_id IS NULL OR user_id NOT IN (SELECT user_id FROM subscriptions)',
    countSql:
      'SELECT COUNT(*) AS count FROM notifications WHERE user_id IS NULL OR user_id NOT IN (SELECT user_id FROM subscriptions)',
  },
  partner_commissions: {
    sql: 'DELETE FROM partner_commissions WHERE order_id NOT IN (SELECT id FROM orders)',
    countSql:
      'SELECT COUNT(*) AS count FROM partner_commissions WHERE order_id NOT IN (SELECT id FROM orders)',
  },
  partner_payouts: {
    // A payout is an aggregate of commissions. Once none reference it, it is a
    // total of nothing and should not sit in the partner's history.
    sql: 'DELETE FROM partner_payouts WHERE id NOT IN (SELECT payout_id FROM partner_commissions WHERE payout_id IS NOT NULL)',
    countSql:
      'SELECT COUNT(*) AS count FROM partner_payouts WHERE id NOT IN (SELECT payout_id FROM partner_commissions WHERE payout_id IS NOT NULL)',
  },
  share_cards: { sql: 'DELETE FROM share_cards', countSql: 'SELECT COUNT(*) AS count FROM share_cards' },
  competition_entries: {
    sql: 'DELETE FROM competition_entries',
    countSql: 'SELECT COUNT(*) AS count FROM competition_entries',
  },
  analytics_events: {
    sql: 'DELETE FROM analytics_events',
    countSql: 'SELECT COUNT(*) AS count FROM analytics_events',
  },
  error_events: { sql: 'DELETE FROM error_events', countSql: 'SELECT COUNT(*) AS count FROM error_events' },
  error_groups: { sql: 'DELETE FROM error_groups', countSql: 'SELECT COUNT(*) AS count FROM error_groups' },
}

export interface LiveHoldings {
  orders: number
  subscriptions: number
}

/** Rows marked `live`. Never deleted; always reported. */
export async function liveHoldings(): Promise<LiveHoldings> {
  const db = await getEngine()
  const orders = await db.get<{ count: number }>(
    "SELECT COUNT(*) AS count FROM orders WHERE mode = 'live'",
  )
  const subscriptions = await db.get<{ count: number }>(
    "SELECT COUNT(*) AS count FROM subscriptions WHERE mode = 'live'",
  )
  return { orders: Number(orders?.count ?? 0), subscriptions: Number(subscriptions?.count ?? 0) }
}

export interface ResetPreview {
  /** Per-table row counts that *would* be deleted, keyed by table. */
  byTable: Record<string, number>
  total: number
  live: LiveHoldings
  world: StripeWorld
}

/**
 * What a reset would remove, without removing it.
 *
 * The counts for the dependent tables are computed against the database as it
 * stands, so while the parents are still present they read as the orphans
 * *currently* present — usually zero. That understates the true figure, and
 * deliberately so: the alternative is simulating the whole cascade in a
 * transaction the engine cannot give us. The parent counts are exact, they are
 * the ones a founder is deciding on, and the confirmation names them.
 */
export async function resetPreview(groupIds: ResetGroupId[]): Promise<ResetPreview> {
  const db = await getEngine()
  const byTable: Record<string, number> = {}
  let total = 0

  for (const group of RESET_GROUPS) {
    if (!groupIds.includes(group.id)) continue
    for (const table of group.tables) {
      const spec = DELETES[table]
      if (!spec) continue
      try {
        const row = await db.get<{ count: number }>(spec.countSql)
        const n = Number(row?.count ?? 0)
        byTable[table] = n
        total += n
      } catch {
        byTable[table] = 0
      }
    }
  }

  return { byTable, total, live: await liveHoldings(), world: currentStripeWorld() }
}

export interface ResetResult {
  deleted: Record<string, number>
  total: number
  /** Live rows that were deliberately left in place. */
  live: LiveHoldings
  at: string
}

/** KV key holding the last reset, so the page can show what happened and when. */
export const RESET_LOG_KEY = 'portal:go-live:last-reset'

export interface ResetLogEntry extends ResetResult {
  groups: ResetGroupId[]
  by: string | null
  world: StripeWorld
}

/**
 * Clear the selected groups.
 *
 * Deletes run parent-first so each dependent sweep sees the state it expects.
 * Counts are read immediately before each delete, because a count taken up front
 * would be wrong by the time the parents are gone — which is the entire point of
 * the sweeps.
 *
 * @param by Founder email, recorded in the audit entry.
 */
export async function runReset(
  groupIds: ResetGroupId[],
  by: string | null = null,
): Promise<ResetResult> {
  const db = await getEngine()
  const deleted: Record<string, number> = {}
  let total = 0

  for (const group of RESET_GROUPS) {
    if (!groupIds.includes(group.id)) continue
    for (const table of group.tables) {
      const spec = DELETES[table]
      if (!spec) continue
      const row = await db.get<{ count: number }>(spec.countSql)
      const n = Number(row?.count ?? 0)
      await db.run(spec.sql)
      deleted[table] = n
      total += n
    }
  }

  const result: ResetResult = { deleted, total, live: await liveHoldings(), at: new Date().toISOString() }

  // The audit entry lives in `kv`, which no reset group touches — a record of a
  // deletion that the next deletion erases is not a record.
  const entry: ResetLogEntry = { ...result, groups: groupIds, by, world: currentStripeWorld() }
  await kvSet(RESET_LOG_KEY, entry)

  return result
}

export async function lastReset(): Promise<ResetLogEntry | undefined> {
  return kvGet<ResetLogEntry>(RESET_LOG_KEY)
}

/**
 * A JSON dump of everything a reset would delete, for downloading first.
 *
 * Not a backup of the database — it is a copy of the rows about to go, so that
 * "I deleted the wrong thing" is recoverable by reading a file rather than by
 * restoring a snapshot. Bounded per table, because this is served through a
 * serverless function with a memory limit and the honest answer at scale is a
 * real database export.
 */
export async function exportBeforeReset(groupIds: ResetGroupId[], limit = 5000): Promise<Record<string, unknown[]>> {
  const db = await getEngine()
  const out: Record<string, unknown[]> = {}
  for (const group of RESET_GROUPS) {
    if (!groupIds.includes(group.id)) continue
    for (const table of group.tables) {
      if (!DELETES[table]) continue
      try {
        // The table name is not user input — it comes from RESET_GROUPS above.
        out[table] = await db.all(`SELECT * FROM ${table} LIMIT ${limit}`)
      } catch {
        out[table] = []
      }
    }
  }
  return out
}

/** True when the deployment is charging real cards right now. */
export function isLiveNow(): boolean {
  return getPaymentSource() === 'stripe' && currentStripeWorld() === 'live'
}
