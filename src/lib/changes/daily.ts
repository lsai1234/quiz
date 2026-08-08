/**
 * The daily job.
 *
 * Lives here rather than in the route so it can be tested without pulling in
 * Next's server helpers, and so a founder-facing "run it now" button and the
 * scheduler share one definition of what a run is.
 *
 * Server-only.
 */
import { syncPortalRuntime } from '@/lib/portal/store'
import { sweepStalePendingOrders } from '@/lib/orders/service'
import { syncImportedProducts } from '@/lib/supplier/sync'
import { applyDueChanges, flushChangeNotifications, runChangeDetection } from './service'

export interface DailyRunResult {
  dryRun: boolean
  baselineOnly?: boolean
  scanned: number
  outOfStock: number
  discontinued: number
  recovered: number
  /** Events raised or refreshed. */
  raised: number
  cancelled?: number
  applied?: number
  notified?: number
  notifyFailed?: number
  /** Emails written and waiting for a person to send (manual mode). */
  awaitingSend?: number
  /** Abandoned checkouts closed off (see `sweepStalePendingOrders`). */
  staleOrdersClosed?: number
  /** Imported products whose stock/cost was refreshed from the supplier. */
  productsRefreshed?: number
  /** Imported products whose SKU is no longer in the supplier feed. */
  productsMissing?: number
  /** Partner commissions whose return window passed, now payable. */
  commissionsConfirmed?: number
  note?: string
}

/**
 * `runChangeDetection` already does the whole sequence — snapshot the supplier
 * feed, diff it, raise or refresh events, close the ones the supplier fixed for
 * us, apply what's due and send what that queued. This adds the two sweeps that
 * aren't triggered by the feed moving:
 *
 *   • `applyDueChanges`, because a scheduled price rise comes due on its own
 *     clock. On most days detection finds nothing and this is the only thing
 *     with work to do.
 *   • `flushChangeNotifications`, so an email that failed yesterday is retried
 *     today rather than sitting in the outbox forever.
 *   • `sweepStalePendingOrders`, the backstop for abandoned checkouts whose
 *     `checkout.session.expired` webhook never arrived. Webhooks are
 *     best-effort; without this those rows sit at `pending_payment` forever and
 *     quietly poison anything counting conversions.
 *
 * Both are idempotent — applying an applied event is a no-op, and the outbox's
 * dedupe key means nobody is told the same thing twice — so running this more
 * often than daily is harmless.
 */
export async function runDailyJob(dryRun = false): Promise<DailyRunResult> {
  await syncPortalRuntime()

  const detection = await runChangeDetection({ dryRun })

  const base = {
    scanned: detection.scannedSubscriptions,
    outOfStock: detection.outOfStockSkus.length,
    discontinued: detection.discontinuedSkus.length,
    recovered: detection.recoveredSkus.length,
    raised: detection.events.length,
  }

  if (dryRun) {
    return { dryRun: true, ...base, note: 'Nothing was written and nobody was emailed.' }
  }

  const dueNow = await applyDueChanges()
  const outbox = await flushChangeNotifications()
  const staleOrdersClosed = await sweepStalePendingOrders()
  // Refresh the stock and cost stored against imported products. Detection above
  // works off snapshots of the feed; this is what writes today's numbers onto the
  // products the shop actually sells, so an item that went out of stock at the
  // supplier stops being buyable here.
  const productSync = await syncImportedProducts()
  // Commission past its return window becomes payable. Idempotent — a row
  // already confirmed is no longer `accrued`, so a second run today moves
  // nothing. Never allowed to fail the rest of the job.
  let commissionsConfirmed = 0
  try {
    const { confirmDue } = await import('@/lib/partners/ledger')
    commissionsConfirmed = await confirmDue()
  } catch (err) {
    console.error('[daily] commission confirmation failed:', err)
  }

  return {
    dryRun: false,
    baselineOnly: detection.baselineOnly,
    ...base,
    cancelled: detection.cancelled.length,
    // Applied during detection, plus anything whose own clock came due.
    applied: detection.applied.length + dueNow.length,
    notified: detection.notified + outbox.sent,
    notifyFailed: outbox.failed,
    awaitingSend: outbox.awaitingSend,
    staleOrdersClosed,
    productsRefreshed: productSync.updated,
    productsMissing: productSync.missing.length,
    commissionsConfirmed,
  }
}

/**
 * Whether a caller may trigger the job, from a shared secret compared in
 * constant time.
 *
 * A run changes what members are billed and sends them email, so an
 * unauthenticated caller must not be able to start one — and a timing oracle on
 * the comparison is a cheap thing to close.
 *
 * With no secret configured this is open outside production and CLOSED in it,
 * so a deploy that forgets the env var fails safe rather than leaving an open
 * trigger on the internet.
 */
export function isCronAuthorised(
  headers: { get(name: string): string | null },
  env: { CRON_SECRET?: string; NODE_ENV?: string } = process.env,
): boolean {
  const secret = env.CRON_SECRET
  if (!secret) return env.NODE_ENV !== 'production'

  const authorization = headers.get('authorization') ?? ''
  const provided = authorization.startsWith('Bearer ')
    ? authorization.slice(7)
    : (headers.get('x-cron-secret') ?? '')

  if (provided.length !== secret.length) return false
  let mismatch = 0
  for (let i = 0; i < secret.length; i++) mismatch |= provided.charCodeAt(i) ^ secret.charCodeAt(i)
  return mismatch === 0
}
