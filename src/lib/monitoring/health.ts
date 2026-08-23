/**
 * System health — the checks that catch a failure nothing threw for.
 *
 * The error log answers "what broke?". It cannot answer the more dangerous
 * question, which is "what *silently* stopped working?" — because the
 * characteristic shape of the worst failures here is an absence, not an
 * exception:
 *
 *   - Stripe's webhook stops reaching us. Nothing throws. Customers are charged,
 *     orders sit at `pending_payment` forever, and you find out from an email
 *     asking where the parcel is.
 *   - The daily cron stops firing. Nothing throws. Subscriptions quietly stop
 *     advancing.
 *   - Emails queue and never send. Nothing throws.
 *
 * So each check below is a question asked of the data rather than a listener
 * waiting for an event, and each one names the thing a founder should do about
 * it. A check that only reports a number is a check nobody acts on.
 *
 * Server-only. Every check is individually guarded: one failing query must not
 * blank the whole page.
 */
import { getEngine } from '@/lib/db/engine'
import { kvGet, kvSet } from '@/lib/db/kv'
import { getPaymentSource } from '@/lib/payments'
import { criticalCountSince } from './repo'

export type HealthStatus = 'ok' | 'warn' | 'fail'

export interface HealthCheck {
  id: string
  title: string
  status: HealthStatus
  /** One sentence: what is true, and what it means. */
  detail: string
  /** Where in the hub to go and do something about it. */
  href?: string
}

/** KV key holding the last successful daily-cron run. Written by the cron route. */
export const CRON_HEARTBEAT_KEY = 'monitoring:cron:daily'

export interface CronHeartbeat {
  at: string
  ok: boolean
  ms?: number
}

export async function recordCronHeartbeat(beat: CronHeartbeat): Promise<void> {
  try {
    await kvSet(CRON_HEARTBEAT_KEY, beat)
  } catch {
    /* the heartbeat must never fail the job it is timing */
  }
}

const HOUR = 3_600_000

function iso(msAgo: number): string {
  return new Date(Date.now() - msAgo).toISOString()
}

async function count(sql: string, params: unknown[]): Promise<number> {
  const db = await getEngine()
  const row = await db.get<{ count: number }>(sql, params)
  return Number(row?.count ?? 0)
}

/**
 * Orders that took a payment intent and never heard back.
 *
 * This is the single most valuable check in the file. `pending_payment` means
 * we sent someone to Stripe and never received `checkout.session.completed`.
 * A handful of very recent ones are just people still typing their card in, so
 * the window starts at two hours — beyond that, either they abandoned it (fine,
 * and it'll be closed by `checkout.session.expired`) or the webhook is not
 * arriving (not fine, and every one of these is a customer charged for an order
 * you have no record of).
 */
async function checkStuckCheckouts(): Promise<HealthCheck> {
  const stuck = await count(
    "SELECT COUNT(*) AS count FROM orders WHERE status = 'pending_payment' AND created_at < ? AND created_at >= ?",
    [iso(2 * HOUR), iso(72 * HOUR)],
  )
  if (stuck === 0) {
    return {
      id: 'stuck-checkouts',
      title: 'Checkouts completing',
      status: 'ok',
      detail: 'No orders have been waiting on Stripe for more than two hours.',
    }
  }
  return {
    id: 'stuck-checkouts',
    title: 'Checkouts stuck at pending payment',
    // Several at once is the signature of a broken webhook rather than a few
    // abandoned baskets, so it escalates on volume.
    status: stuck >= 3 ? 'fail' : 'warn',
    detail:
      `${stuck} order${stuck === 1 ? '' : 's'} from the last three days never moved past pending payment. ` +
      'Either they were abandoned, or Stripe’s webhook is not reaching us — check Stripe → Developers → Webhooks for non-200 responses.',
    href: '/founderhub/commerce/orders',
  }
}

/** Orders that failed outright in the last day. */
async function checkFailedOrders(): Promise<HealthCheck> {
  const failed = await count(
    "SELECT COUNT(*) AS count FROM orders WHERE status = 'failed' AND updated_at >= ?",
    [iso(24 * HOUR)],
  )
  return failed === 0
    ? {
        id: 'failed-orders',
        title: 'No failed orders',
        status: 'ok',
        detail: 'Nothing failed in the last 24 hours.',
      }
    : {
        id: 'failed-orders',
        title: 'Orders failed',
        status: 'fail',
        detail: `${failed} order${failed === 1 ? '' : 's'} failed in the last 24 hours.`,
        href: '/founderhub/commerce/orders',
      }
}

/**
 * The outbox, stalled.
 *
 * `failed` is unambiguous. `queued` is not: on the default `manual` provider
 * everything sits queued by design, waiting for a founder to copy it out — so
 * only a queue that has gone stale is worth flagging, and it is worth flagging
 * as a nudge rather than a fault.
 */
async function checkOutbox(): Promise<HealthCheck> {
  const failed = await count("SELECT COUNT(*) AS count FROM notifications WHERE status = 'failed'", [])
  if (failed > 0) {
    return {
      id: 'outbox',
      title: 'Emails failed to send',
      status: 'fail',
      detail: `${failed} notification${failed === 1 ? '' : 's'} failed. They can be retried from the Emails page.`,
      href: '/founderhub/emails',
    }
  }
  const stale = await count(
    "SELECT COUNT(*) AS count FROM notifications WHERE status = 'queued' AND created_at < ?",
    [iso(48 * HOUR)],
  )
  return stale === 0
    ? { id: 'outbox', title: 'Outbox clear', status: 'ok', detail: 'Nothing is stuck in the email queue.' }
    : {
        id: 'outbox',
        title: 'Emails waiting to go out',
        status: 'warn',
        detail: `${stale} email${stale === 1 ? '' : 's'} ha${stale === 1 ? 's' : 've'} been queued for more than two days.`,
        href: '/founderhub/emails',
      }
}

/**
 * Did the daily job run?
 *
 * Vercel Cron gives no notification when it stops firing, and the most common
 * cause is mundane — `CRON_SECRET` unset, so the route closes itself in
 * production and every scheduled call 401s. That failure is completely silent
 * without this check.
 */
async function checkCron(): Promise<HealthCheck> {
  const beat = await kvGet<CronHeartbeat>(CRON_HEARTBEAT_KEY)
  if (!beat) {
    return {
      id: 'cron',
      title: 'Daily job has never run',
      status: 'warn',
      detail:
        'No run recorded. If this is a fresh deploy it will clear after 06:00 UTC; if not, check CRON_SECRET is set — without it the cron route is closed in production.',
    }
  }
  const ageHours = (Date.now() - Date.parse(beat.at)) / HOUR
  if (!beat.ok) {
    return {
      id: 'cron',
      title: 'Daily job failed',
      status: 'fail',
      detail: `The last run, ${Math.round(ageHours)}h ago, ended in an error.`,
      href: '/founderhub/monitoring',
    }
  }
  if (ageHours > 36) {
    return {
      id: 'cron',
      title: 'Daily job has not run',
      status: 'fail',
      detail: `Last successful run was ${Math.round(ageHours / 24)} days ago. Subscriptions stop advancing while it is not firing.`,
    }
  }
  return {
    id: 'cron',
    title: 'Daily job running',
    status: 'ok',
    detail: `Last ran ${ageHours < 1 ? 'less than an hour' : `${Math.round(ageHours)}h`} ago.`,
  }
}

/**
 * Is the payment configuration what you think it is?
 *
 * Not an error — a misconfiguration, and one with a wholly silent failure mode
 * in each direction: mock payments in production takes orders that never charge
 * anybody, and live keys on a preview deployment charges real cards from a
 * branch.
 */
function checkPayments(): HealthCheck {
  const source = getPaymentSource()
  const key = process.env.STRIPE_SECRET_KEY ?? ''
  const production = process.env.VERCEL_ENV === 'production' || process.env.NODE_ENV === 'production'

  if (source === 'mock') {
    return {
      id: 'payments',
      title: 'Payments are mocked',
      status: production ? 'warn' : 'ok',
      detail: production
        ? 'This deployment is production but checkout does not charge anybody. Set STRIPE_SECRET_KEY and switch payments to Stripe.'
        : 'Checkout returns a placeholder. Expected while building.',
      href: '/founderhub/settings/payments',
    }
  }
  if (!process.env.STRIPE_WEBHOOK_SECRET) {
    return {
      id: 'payments',
      title: 'Stripe webhook secret missing',
      status: 'fail',
      detail:
        'Stripe is taking payments but STRIPE_WEBHOOK_SECRET is unset, so no webhook can be verified — orders will never be marked paid.',
      href: '/founderhub/settings/payments',
    }
  }
  return {
    id: 'payments',
    title: key.startsWith('sk_live_') ? 'Stripe live' : 'Stripe test mode',
    status: 'ok',
    detail: key.startsWith('sk_live_')
      ? 'Taking real payments, with a webhook secret set.'
      : 'Taking test payments with a test key.',
    href: '/founderhub/settings/payments',
  }
}

/** Recent unresolved criticals, as a health line rather than a list. */
async function checkCriticals(): Promise<HealthCheck> {
  const n = await criticalCountSince(24)
  return n === 0
    ? {
        id: 'criticals',
        title: 'No critical errors',
        status: 'ok',
        detail: 'Nothing critical logged in the last 24 hours.',
      }
    : {
        id: 'criticals',
        title: 'Critical errors logged',
        status: 'fail',
        detail: `${n} critical error${n === 1 ? '' : 's'} in the last 24 hours, not yet resolved.`,
        href: '/founderhub/monitoring',
      }
}

/**
 * Run every check.
 *
 * Each is settled independently so a single broken query degrades to one
 * "couldn't check" row instead of an empty page — the health screen is the
 * thing you open *when* something is wrong, so it has to survive things being
 * wrong.
 */
export async function runHealthChecks(): Promise<HealthCheck[]> {
  const checks: (() => Promise<HealthCheck>)[] = [
    checkCriticals,
    checkStuckCheckouts,
    checkFailedOrders,
    checkOutbox,
    checkCron,
    async () => checkPayments(),
  ]

  return Promise.all(
    checks.map(async (run, i) => {
      try {
        return await run()
      } catch {
        return {
          id: `check-${i}`,
          title: 'Check could not run',
          status: 'warn' as HealthStatus,
          detail: 'This check failed to read the database.',
        }
      }
    }),
  )
}

/** The worst status present — what the dashboard badge shows. */
export function overallStatus(checks: HealthCheck[]): HealthStatus {
  if (checks.some((c) => c.status === 'fail')) return 'fail'
  if (checks.some((c) => c.status === 'warn')) return 'warn'
  return 'ok'
}
