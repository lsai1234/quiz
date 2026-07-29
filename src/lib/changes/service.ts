/**
 * Change detection and resolution — the orchestration layer.
 *
 * Everything with side effects lives here: reading the supplier feed, loading
 * subscriptions, persisting snapshots and events, and writing an applied change
 * back to a member's plan. The decisions themselves are all in the pure modules
 * (`detect`, `policy`, `apply`, `event`), so this file is deliberately mostly
 * plumbing — if it starts making judgement calls, they belong somewhere else.
 *
 * The run does four things, in order:
 *
 *   1. **Snapshot the feed** and diff it against last time. The first run only
 *      establishes a baseline; you cannot detect a change against nothing.
 *   2. **Raise or refresh an event** for every affected subscription line,
 *      carrying what we intend to do and when it lands unattended.
 *   3. **Cancel events the supplier has resolved for us** — a SKU that came
 *      back in stock is not a problem anyone needs to look at.
 *   4. **Apply everything that's due**, which on a routine outage is
 *      immediately.
 *
 * Server-only.
 */
import type { CatalogueProduct } from '@/lib/catalogue/types'
import type { MemberSubscription } from '@/lib/recharge/types'
import { getSubscription, listActiveSubscriptions, saveSubscription } from '@/lib/db/hub-data'
import { getSupplier } from '@/lib/supplier'
import { getPricingConfig, type PricingConfig } from '@/lib/stack-blueprint/pricing'
import { applyResolution } from './apply'
import {
  diffSupplierFeed,
  findAffectedLines,
  inStockCatalogue,
  skuForLine,
  type FeedEntry,
  type SupplierSnapshot,
} from './detect'
import { changeEventId, createChangeEvent } from './event'
import { anyCategoryCandidate, findReplacement, isDueForAutoApply } from './policy'
import { getChange, listChanges, listDueForAutoApply, saveChange, updateChange } from './repo'
import { constraintsFor } from './safety'
import { listSnapshots, saveSnapshots } from './snapshots'
import { OPEN_STATUSES, type ChangeEvent, type ChangeResolution } from './types'

export interface RunOptions {
  /** Injected in tests; otherwise read from the supplier and the database. */
  feed?: FeedEntry[]
  previousSnapshots?: SupplierSnapshot[]
  subscriptions?: { userId: string; subscription: MemberSubscription }[]
  catalogue?: CatalogueProduct[]
  now?: Date
  config?: PricingConfig
  /** Compute and report without writing anything. The founder's dry run. */
  dryRun?: boolean
}

export interface ChangeDetectionResult {
  scannedSubscriptions: number
  outOfStockSkus: string[]
  discontinuedSkus: string[]
  recoveredSkus: string[]
  /** Events raised or refreshed by this run. */
  events: ChangeEvent[]
  /** Events closed because the supplier recovered. */
  cancelled: ChangeEvent[]
  /** Events whose intended action was applied by this run. */
  applied: ChangeEvent[]
  /** Member emails actually sent by this run. */
  notified: number
  /** True when this run only established a baseline. */
  baselineOnly: boolean
  dryRun: boolean
}

// ─── Detection ────────────────────────────────────────────────────────────────

export async function runChangeDetection(opts: RunOptions = {}): Promise<ChangeDetectionResult> {
  const config = opts.config ?? getPricingConfig()
  const now = opts.now ?? new Date()

  const feed = opts.feed ?? (await readFeed())
  const previous = opts.previousSnapshots ?? (await listSnapshots())
  const diff = diffSupplierFeed(previous, feed, { now, config })

  // Nothing to compare against on the very first run: snapshot and stop, rather
  // than reporting the whole catalogue as newly broken.
  const baselineOnly = previous.length === 0
  if (!opts.dryRun) await saveSnapshots(diff.next)

  const result: ChangeDetectionResult = {
    scannedSubscriptions: 0,
    outOfStockSkus: diff.outOfStock,
    discontinuedSkus: diff.discontinued,
    recoveredSkus: diff.recovered,
    events: [],
    cancelled: [],
    applied: [],
    notified: 0,
    baselineOnly,
    dryRun: opts.dryRun ?? false,
  }
  if (baselineOnly) return result

  const subscriptions = opts.subscriptions ?? (await listActiveSubscriptions())
  const catalogue = opts.catalogue ?? (await loadCatalogue())
  result.scannedSubscriptions = subscriptions.length

  const unavailable = new Set([...diff.outOfStock, ...diff.discontinued])
  const available = inStockCatalogue(catalogue, unavailable)
  const affected = findAffectedLines(diff, subscriptions, catalogue)

  for (const { userId, subscription, line, sku, kind } of affected) {
    const id = changeEventId(userId, line.id, kind)
    const existing = await getChange(id)
    // A founder-resolved event stays resolved; re-raising it would undo their call.
    if (existing && !OPEN_STATUSES.includes(existing.status)) continue

    const constraints = constraintsFor(subscription)
    const replacement = findReplacement({ candidates: available, line, constraints, config })
    // Distinguish "the category is empty" from "nothing here is safe for you" —
    // they read very differently to someone whose plan just shrank.
    const unsafeCandidateExists =
      replacement === null && anyCategoryCandidate({ candidates: available, line, config })

    const event = createChangeEvent({
      kind,
      userId,
      subscription,
      line,
      replacement,
      unsafeCandidateExists,
      sku,
      now,
      config,
      createdAt: existing?.createdAt,
    })
    // Keep the original deadline: a founder's review window shouldn't restart
    // every time the daily job confirms the product is still gone.
    if (existing) event.autoApplyAt = existing.autoApplyAt

    if (!opts.dryRun) await saveChange(event)
    result.events.push(event)
  }

  // A discontinuation supersedes any open out-of-stock event for the same line:
  // same problem, stronger fact, and two queue entries saying different things
  // about one product helps nobody.
  if (!opts.dryRun) {
    for (const event of result.events.filter((e) => e.kind === 'discontinued')) {
      const superseded = await getChange(changeEventId(event.userId, event.lineId, 'out-of-stock'))
      if (superseded && OPEN_STATUSES.includes(superseded.status)) {
        const closed = await closeEvent(superseded.id, 'Superseded — the product is discontinued, not just out of stock')
        if (closed) result.cancelled.push(closed)
      }
    }
  }

  if (!opts.dryRun) {
    result.cancelled.push(...(await cancelRecovered(diff.recovered, catalogue)))
    result.applied = await applyDueChanges({ now, config, catalogue })
    // Send what applying just queued, so a run leaves nobody wondering why
    // their box changed.
    result.notified = (await flushChangeNotifications()).sent
  }

  return result
}

/** Close open out-of-stock events whose product is buyable again. */
async function cancelRecovered(
  recoveredSkus: string[],
  catalogue: CatalogueProduct[],
): Promise<ChangeEvent[]> {
  if (recoveredSkus.length === 0) return []
  const recovered = new Set(recoveredSkus)
  const open = await listChanges({ status: OPEN_STATUSES, kind: 'out-of-stock' })

  const cancelled: ChangeEvent[] = []
  for (const event of open) {
    const sku = event.sku ?? skuForLine({ productId: event.productId, variantTitle: '' }, catalogue)
    if (!sku || !recovered.has(sku)) continue
    const closed = await closeEvent(event.id, 'Back in stock at the supplier — no change needed')
    if (closed) cancelled.push(closed)
  }
  return cancelled
}

async function closeEvent(id: string, detail: string): Promise<ChangeEvent | null> {
  return updateChange(id, (e) => {
    e.status = 'cancelled'
    e.resolution = { type: 'dismiss' }
    e.resolutionSource = 'system'
    e.resolutionDetail = detail
    e.resolvedAt = new Date().toISOString()
  })
}

// ─── Applying ─────────────────────────────────────────────────────────────────

/**
 * Apply every event whose moment has come — immediately for a routine outage on
 * a healthy plan, or once the founder's review window has elapsed.
 *
 * This is what guarantees the queue drains itself. A founder who never opens the
 * hub delays a change by `founderReviewHours`; they cannot stall it forever.
 */
export async function applyDueChanges(
  opts: { now?: Date; config?: PricingConfig; catalogue?: CatalogueProduct[] } = {},
): Promise<ChangeEvent[]> {
  const now = opts.now ?? new Date()
  const due = await listDueForAutoApply(now.toISOString())
  if (due.length === 0) return []

  const catalogue = opts.catalogue ?? (await loadCatalogue())
  const applied: ChangeEvent[] = []

  for (const event of due) {
    if (!isDueForAutoApply(event.autoApplyAt, now)) continue
    // Price events default to `absorb`, which changes nothing on the member's
    // plan. Applying one means closing it, not billing anyone.
    const result = await applyChangeEvent(event, event.intendedAction.resolution, 'system', {
      now,
      config: opts.config,
      catalogue,
    })
    if (result) applied.push(result)
  }
  return applied
}

/**
 * Apply one resolution to the member's stored plan and close the event.
 *
 * Shared by the automatic sweep and the founder's manual resolve, so both go
 * through identical billing maths and leave identical audit trails — the only
 * difference is `source`.
 *
 * A rejected substitution falls through to removal rather than failing: the
 * member is owed an outcome, and removal is always available. That mirrors what
 * `createChangeEvent` already decided at detection, and covers the case where
 * the catalogue moved between detection and application.
 */
export async function applyChangeEvent(
  event: ChangeEvent,
  resolution: ChangeResolution,
  source: 'system' | 'founder',
  opts: { now?: Date; config?: PricingConfig; catalogue?: CatalogueProduct[] } = {},
): Promise<ChangeEvent | null> {
  const now = opts.now ?? new Date()
  const subscription = await getSubscription(event.userId)
  if (!subscription) {
    return updateChange(event.id, (e) => {
      e.status = 'cancelled'
      e.resolutionSource = source
      e.resolutionDetail = 'The member no longer has a subscription'
      e.resolvedAt = now.toISOString()
    })
  }

  const catalogue = opts.catalogue ?? (await loadCatalogue())
  const applyOpts = { catalogue, event, now, config: opts.config }

  let outcome = applyResolution(subscription, event.lineId, resolution, applyOpts)
  let effective = resolution

  if (outcome.rejected === 'below-margin-floor' || outcome.rejected === 'replacement-not-found') {
    effective = { type: 'remove' }
    outcome = applyResolution(subscription, event.lineId, effective, applyOpts)
  }

  // `hold`, `absorb` and `dismiss` deliberately leave the plan alone; the event
  // still closes. Only a genuinely missing line is a no-op worth reporting.
  if (outcome.rejected === 'line-not-found') {
    return updateChange(event.id, (e) => {
      e.status = 'cancelled'
      e.resolutionSource = source
      e.resolutionDetail = 'That product is no longer on the member’s plan'
      e.resolvedAt = now.toISOString()
    })
  }

  if (!outcome.rejected) {
    await saveSubscription(event.userId, outcome.subscription)
  }

  // Queue the member's email against the plan as it now stands. Queueing is
  // deliberately separate from sending: the change is done and must not be
  // undone by a mail provider having a bad afternoon, so a failure here leaves
  // a retryable row rather than an inconsistent subscription. Never throws.
  await queueMemberNotification(event, effective, outcome.subscription, catalogue)

  return updateChange(event.id, (e) => {
    e.status = 'applied'
    e.resolution = effective
    e.resolutionSource = source
    e.resolutionDetail = describeResolution(effective, outcome.subscription, resolution)
    e.billingChangeId = outcome.billingChange?.id
    e.resolvedAt = now.toISOString()
    e.appliedAt = now.toISOString()
    // Left null on purpose: the member hasn't been told yet. The outbox sweep
    // (P5) picks applied-but-unnotified events up.
    e.notifiedAt = e.notifiedAt ?? null
  })
}

/**
 * Render and queue the member's email for a change we just applied.
 *
 * Swallows its own errors on purpose. An applied change is a fact about
 * someone's plan and their bill; a notification that couldn't be queued is a
 * problem with our mail plumbing. Letting the second undo the first would be
 * the wrong trade every time — the event stays visible with `notifiedAt: null`,
 * which is exactly what the outbox sweep looks for.
 */
async function queueMemberNotification(
  event: ChangeEvent,
  resolution: ChangeResolution,
  subscription: MemberSubscription,
  catalogue: CatalogueProduct[],
): Promise<void> {
  try {
    const { notificationForEvent } = await import('@/lib/notify/from-change')
    const { queueNotification } = await import('@/lib/notify/outbox')
    const { appBaseUrl } = await import('@/lib/notify')

    const input = notificationForEvent(
      { ...event, resolution },
      { baseUrl: appBaseUrl(), subscription, catalogue },
    )
    if (input) await queueNotification(input)
  } catch (err) {
    console.error('[changes] queueing the member notification failed:', err)
  }
}

/**
 * Send what's queued, and record on each change that its member has actually
 * been told. Called at the end of a detection run and by the daily job.
 */
export async function flushChangeNotifications(): Promise<{ sent: number; failed: number }> {
  const { flushOutbox } = await import('@/lib/notify/outbox')
  const result = await flushOutbox({
    onSent: async (notification) => {
      if (!notification.changeEventId) return
      await updateChange(notification.changeEventId, (e) => {
        e.notifiedAt = notification.sentAt ?? new Date().toISOString()
      })
    },
  })
  return { sent: result.sent.length, failed: result.failed.length }
}

function describeResolution(
  effective: ChangeResolution,
  next: MemberSubscription,
  requested: ChangeResolution,
): string {
  const fellBack = effective.type !== requested.type
  switch (effective.type) {
    case 'substitute': {
      const line = next.lines.find((l) => l.productId === effective.replacementProductId)
      return `Swapped to ${line?.productTitle ?? effective.replacementProductId}`
    }
    case 'remove':
      return fellBack
        ? 'Removed — no replacement we could offer at the member’s price'
        : 'Removed from the plan'
    case 'hold':
      return 'Held — next box for this line skipped'
    case 'absorb':
      return 'Absorbed — the member’s price is unchanged'
    case 'pass-on':
      return 'Passed on to the member after notice'
    case 'dismiss':
      return 'Dismissed'
  }
}

// ─── Sources ──────────────────────────────────────────────────────────────────

async function readFeed(): Promise<FeedEntry[]> {
  const supplier = await getSupplier()
  const products = await supplier.listProducts()
  return products.map((p) => ({
    sku: p.sku,
    stock: p.stock,
    inStock: p.inStock,
    wholesalePrice: p.wholesalePrice,
    rrp: p.rrp,
  }))
}

async function loadCatalogue(): Promise<CatalogueProduct[]> {
  const { getResolvedCatalogue } = await import('@/lib/catalogue/resolve')
  return (await getResolvedCatalogue()).products
}
