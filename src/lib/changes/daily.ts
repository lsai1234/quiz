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
import { sweepStalePendingOrders, sweepSupplierStatuses } from '@/lib/orders/service'
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
  /** Orders in flight with the supplier that were asked for a status. */
  supplierChecked?: number
  /** Of those, how many had moved since we last looked. */
  supplierUpdated?: number
  /** Of those, how many arrived. */
  supplierDelivered?: number
  /** Orders the supplier could not be asked about this run. */
  supplierCheckFailed?: number
  /** Anonymous share cards swept past their retention window. */
  shareCardsSwept?: number
  /** Imported products whose stock/cost was refreshed from the supplier. */
  productsRefreshed?: number
  /** Imported products whose SKU is no longer in the supplier feed. */
  productsMissing?: number
  /** Partner commissions whose return window passed, now payable. */
  commissionsConfirmed?: number
  /** Snoozed plans whose return date arrived and are now active again. */
  snoozesResumed?: number
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
 *   • `sweepSupplierStatuses`, which asks the supplier what happened to every
 *     order already sent. PowerBody push us nothing, so status and tracking only
 *     ever moved when a founder opened an order and pressed sync — this is the
 *     same read on a schedule. It cannot send anything: the approval gate lives
 *     in `submitOrderToSupplier` and nothing here calls it.
 *
 * All are idempotent — applying an applied event is a no-op, and the outbox's
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

  // Ask the supplier what happened to everything already sent. Read-only, and
  // it cannot dispatch anything — the approval gate is in `submitOrderToSupplier`
  // and this never calls it. Without this, an order's status was only ever as
  // fresh as the last time a founder opened it and pressed sync, so a parcel
  // could ship and be delivered while the hub still said "submitted".
  // Never allowed to fail the rest of the job.
  let supplier = { checked: 0, updated: 0, delivered: 0, failures: [] as { id: string; error: string }[] }
  try {
    supplier = await sweepSupplierStatuses()
    if (supplier.failures.length > 0) {
      console.error(`[daily] ${supplier.failures.length} order(s) could not be checked with the supplier`)
    }
  } catch (err) {
    console.error('[daily] supplier status sweep failed:', err)
  }
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

  // Snoozes that have run out. The hub tells a member "back on 14 March" and
  // nothing used to make that true — a three-month snooze simply stayed paused
  // forever. Never allowed to fail the rest of the job.
  let snoozesResumed = 0
  try {
    const { resumeDueSnoozes } = await import('@/lib/recharge/resume')
    const result = await resumeDueSnoozes()
    snoozesResumed = result.resumed
    if (result.stripeErrors.length > 0) {
      console.error(`[daily] ${result.stripeErrors.length} snooze(s) resumed locally but NOT in Stripe`)
    }
  } catch (err) {
    console.error('[daily] snooze resume failed:', err)
  }

  // Anonymous share cards past their year. Only cards with no account behind
  // them — a card attached to a customer is theirs, and deleting it because a
  // year passed is deleting something of theirs on a schedule they never agreed
  // to. Never allowed to fail the rest of the job.
  let shareCardsSwept = 0
  try {
    const { sweepExpiredShareCards } = await import('@/lib/db/share-cards')
    shareCardsSwept = await sweepExpiredShareCards()
  } catch (err) {
    console.error('[daily] share card sweep failed:', err)
  }

  return {
    dryRun: false,
    baselineOnly: detection.baselineOnly,
    shareCardsSwept,
    ...base,
    cancelled: detection.cancelled.length,
    // Applied during detection, plus anything whose own clock came due.
    applied: detection.applied.length + dueNow.length,
    notified: detection.notified + outbox.sent,
    notifyFailed: outbox.failed,
    awaitingSend: outbox.awaitingSend,
    staleOrdersClosed,
    supplierChecked: supplier.checked,
    supplierUpdated: supplier.updated,
    supplierDelivered: supplier.delivered,
    supplierCheckFailed: supplier.failures.length,
    productsRefreshed: productSync.updated,
    productsMissing: productSync.missing.length,
    commissionsConfirmed,
    snoozesResumed,
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
