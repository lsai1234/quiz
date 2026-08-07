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
import { applyResolution, earliestIncreaseDate } from './apply'
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
import { OPEN_STATUSES, PRICE_KINDS, type ChangeEvent, type ChangeResolution } from './types'

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
  /** Member emails actually sent by this run (0 when sending is manual). */
  notified: number
  /** Emails written and waiting for a person to send them. */
  awaitingSend: number
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
    awaitingSend: 0,
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

  // Price moves. Raised per affected line — the money, the notice date and the
  // email are all per-member — and grouped back together for the founder by the
  // hub. Their intended action is `absorb`, so an unattended queue costs the
  // member nothing.
  for (const { sku, move } of diff.priceMoves) {
    for (const { userId, subscription } of subscriptions) {
      for (const line of subscription.lines) {
        if (skuForLine(line, catalogue) !== sku) continue

        const kind = move.wholesaleDeltaPct > 0 ? 'price-increase' : 'price-decrease'
        const existing = await getChange(changeEventId(userId, line.id, kind))
        if (existing && !OPEN_STATUSES.includes(existing.status)) continue

        const event = createChangeEvent({
          kind, userId, subscription, line, sku, price: move, now, config,
          createdAt: existing?.createdAt,
        })
        if (existing) event.autoApplyAt = existing.autoApplyAt
        if (!opts.dryRun) await saveChange(event)
        result.events.push(event)
      }
    }
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
    // their box changed. Manual mode sends nothing and reports the backlog
    // instead — the founder is the delivery mechanism there.
    const outbox = await flushChangeNotifications()
    result.notified = outbox.sent
    result.awaitingSend = outbox.awaitingSend
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
    // A resolution already on the event is a decision someone made — most often
    // a scheduled price pass-on waiting out its notice. Applying the ORIGINAL
    // intent here would quietly undo it. Fall back to the intended action only
    // when nobody has decided anything.
    const resolution = event.resolution ?? event.intendedAction.resolution
    const source = event.resolutionSource ?? 'system'
    const result = await applyChangeEvent(event, resolution, source, {
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
    // Stripe before us. It's what actually takes the money, so if it refuses
    // the new amount we must not store a plan that disagrees with the card
    // charge — the event stays open with the reason on it instead.
    const billingError = await syncBilling(event, outcome.subscription)
    if (billingError) {
      return updateChange(event.id, (e) => {
        e.error = billingError
        e.resolutionDetail = `Could not update billing: ${billingError}`
      })
    }
    await saveSubscription(event.userId, outcome.subscription)
  }

  // Queue the member's email against the plan as it now stands. Queueing is
  // deliberately separate from sending: the change is done and must not be
  // undone by a mail provider having a bad afternoon, so a failure here leaves
  // a retryable row rather than an inconsistent subscription. Never throws.
  await queueMemberNotification(event, effective, outcome.subscription, catalogue)

  return updateChange(event.id, (e) => {
    // `dismiss` closes an event without anything having happened; everything
    // else genuinely changed (or deliberately left alone) the member's plan.
    e.status = effective.type === 'dismiss' ? 'cancelled' : 'applied'
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
 * Open AND undecided — nobody has chosen absorb or pass-on yet.
 *
 * A scheduled pass-on is still "open" (it hasn't billed), but it is decided.
 * Offering it back to a founder as a fresh choice would let them absorb
 * something a member has already been given notice of.
 */
export function isUndecided(event: ChangeEvent): boolean {
  return event.resolution === undefined
}

/**
 * Push a new recurring amount to Stripe. Returns an error message on failure,
 * or null when there was nothing to do (mock mode, no Stripe subscription, or
 * the amount hasn't moved).
 */
async function syncBilling(event: ChangeEvent, next: MemberSubscription): Promise<string | null> {
  const previous = event.billingPreview?.currentMonthly
  if (previous !== undefined && Math.abs(next.flatMonthly - previous) < 0.01) return null
  if (!next.stripeSubscriptionId) return null

  const { getPaymentSource } = await import('@/lib/payments')
  if (getPaymentSource() !== 'stripe') return null

  try {
    const { updateSubscriptionAmount } = await import('@/lib/payments/stripe')
    await updateSubscriptionAmount(next.stripeSubscriptionId, next.flatMonthly)
    return null
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[changes] Stripe rejected the new amount:', message)
    return message
  }
}

/**
 * Schedule a price pass-on for everyone holding a product.
 *
 * The member's plan is deliberately NOT touched here. An increase can't bill
 * until its notice has run, so the event is parked as `scheduled` with
 * `autoApplyAt` set to the effective date and the re-price recorded on it; the
 * ordinary due-changes sweep applies it when the day comes. The notice email
 * goes out NOW, which is the entire point of a notice period.
 *
 * That reuse matters: there is exactly one code path that changes a member's
 * price, and it's the same one a swap or a removal goes through.
 */
export async function schedulePassOn(
  productId: string,
  passOnPct: number,
  opts: { now?: Date; config?: PricingConfig; catalogue?: CatalogueProduct[] } = {},
): Promise<{ scheduled: ChangeEvent[]; notified: number; awaitingSend: number }> {
  const config = opts.config ?? getPricingConfig()
  const now = opts.now ?? new Date()
  const catalogue = opts.catalogue ?? (await loadCatalogue())
  const product = catalogue.find((p) => p.id === productId)

  const events = (await listChanges({ status: OPEN_STATUSES, kind: PRICE_KINDS })).filter(
    (e) => e.productId === productId && e.price && isUndecided(e),
  )
  if (!product || events.length === 0) return { scheduled: [], notified: 0, awaitingSend: 0 }

  const subscriptions = new Map<string, MemberSubscription>()
  for (const event of events) {
    const sub = await getSubscription(event.userId)
    if (sub) subscriptions.set(event.userId, sub)
  }

  const { summarisePriceGroup } = await import('./price')
  const impact = summarisePriceGroup({ product, events, subscriptions, passOnPct, config })

  const scheduled: ChangeEvent[] = []
  for (const event of events) {
    const sub = subscriptions.get(event.userId)
    const member = impact.members.find((m) => m.eventId === event.id)
    if (!sub || !member) continue

    const effectiveFrom = earliestIncreaseDate(sub, now, config)
    const updated = await updateChange(event.id, (e) => {
      e.status = 'scheduled'
      e.resolution = { type: 'pass-on', newUnitPrice: impact.passOnUnitPrice }
      e.resolutionSource = 'founder'
      e.resolutionDetail = `Passing on ${Math.round(passOnPct * 100)}% — ${member.monthlyBefore.toFixed(2)} → ${member.monthlyAfter.toFixed(2)}/mo from ${effectiveFrom.slice(0, 10)}`
      // The sweep applies it on the day, through the same path as everything else.
      e.autoApplyAt = effectiveFrom
    })
    if (!updated) continue
    scheduled.push(updated)

    await queuePriceNotice(updated, member, effectiveFrom, config)
  }

  const { sent, awaitingSend } = await flushChangeNotifications()
  return { scheduled, notified: sent, awaitingSend }
}

/**
 * Absorb a supplier move: record the new cost, leave the member's price alone.
 *
 * The cost baseline updates either way — that's simply what the product costs
 * now — so margin reporting stays honest whichever way the decision went.
 */
export async function absorbPriceChange(
  productId: string,
  opts: { now?: Date } = {},
): Promise<ChangeEvent[]> {
  const events = (await listChanges({ status: OPEN_STATUSES, kind: PRICE_KINDS })).filter(
    (e) => e.productId === productId && e.price && isUndecided(e),
  )
  if (events.length === 0) return []

  await recordNewCost(productId, events[0].price!.newWholesale)

  const resolved: ChangeEvent[] = []
  for (const event of events) {
    const updated = await updateChange(event.id, (e) => {
      e.status = 'applied'
      e.resolution = { type: 'absorb' }
      e.resolutionSource = 'founder'
      e.resolutionDetail = `Absorbed — cost now ${event.price!.newWholesale.toFixed(2)}, member's price unchanged`
      e.resolvedAt = (opts.now ?? new Date()).toISOString()
      e.appliedAt = (opts.now ?? new Date()).toISOString()
    })
    if (updated) resolved.push(updated)
  }
  return resolved
}

/** Persist what a product now costs us, as a founder-level product override. */
async function recordNewCost(productId: string, cost: number): Promise<void> {
  try {
    const { setProductOverride } = await import('@/lib/portal/store')
    await setProductOverride(productId, { cost })
  } catch (err) {
    console.error('[changes] could not record the new cost:', err)
  }
}

/** The advance notice a member gets before an increase bills. */
async function queuePriceNotice(
  event: ChangeEvent,
  member: { monthlyBefore: number; monthlyAfter: number },
  effectiveFrom: string,
  config: PricingConfig,
): Promise<void> {
  if (!event.customerEmail) return
  try {
    const { priceChangeNotice } = await import('@/lib/notify/templates')
    const { queueNotification } = await import('@/lib/notify/outbox')
    const { appBaseUrl } = await import('@/lib/notify')

    await queueNotification({
      userId: event.userId,
      email: event.customerEmail,
      template: 'price-change-notice',
      changeEventId: event.id,
      rendered: priceChangeNotice({
        productTitle: event.productTitle,
        monthlyBefore: member.monthlyBefore,
        monthlyAfter: member.monthlyAfter,
        effectiveFrom,
        noticeDays: config.priceChangeNoticeDays,
        hubUrl: `${appBaseUrl()}/hub`,
      }),
    })
  } catch (err) {
    console.error('[changes] could not queue the price notice:', err)
  }
}

/**
 * A founder resolving an event from the hub.
 *
 * Goes through exactly the same billing maths and audit trail as the automatic
 * sweep — the only difference is `source`, so a founder's call and the system's
 * are equally reconstructable afterwards. `dismiss` is the one that isn't an
 * "apply": it closes the event as cancelled, because nothing happened.
 */
export async function resolveChangeEvent(
  id: string,
  resolution: ChangeResolution,
  opts: { now?: Date; config?: PricingConfig; catalogue?: CatalogueProduct[] } = {},
): Promise<ChangeEvent | null> {
  const event = await getChange(id)
  if (!event) return null
  if (!OPEN_STATUSES.includes(event.status)) return event // already settled — don't redo it

  if (resolution.type === 'dismiss') {
    return updateChange(id, (e) => {
      e.status = 'cancelled'
      e.resolution = resolution
      e.resolutionSource = 'founder'
      e.resolutionDetail = 'Dismissed by a founder — no change made'
      e.resolvedAt = (opts.now ?? new Date()).toISOString()
    })
  }

  return applyChangeEvent(event, resolution, 'founder', opts)
}

export interface BulkResolveResult {
  resolved: ChangeEvent[]
  /** Events that couldn't be resolved, with why. */
  skipped: { id: string; reason: string }[]
}

/**
 * Resolve every open event for one product in a single action.
 *
 * When a popular SKU dies this is the difference between usable and unusable:
 * the alternative is the same decision made forty times. Each member still goes
 * through the full per-member path — their own policy, their own billing maths,
 * their own email — so "bulk" is about the founder's effort, never about
 * treating people as a batch.
 */
export async function bulkResolveByProduct(
  productId: string,
  resolution: ChangeResolution,
  opts: { now?: Date; config?: PricingConfig; catalogue?: CatalogueProduct[] } = {},
): Promise<BulkResolveResult> {
  const open = (await listChanges({ status: OPEN_STATUSES })).filter((e) => e.productId === productId)
  const catalogue = opts.catalogue ?? (await loadCatalogue())

  const result: BulkResolveResult = { resolved: [], skipped: [] }
  for (const event of open) {
    // A member who asked us to take things off never gets a swap applied to
    // them just because a founder chose one for the group.
    if (resolution.type === 'substitute' && event.policy === 'remove') {
      const removed = await applyChangeEvent(event, { type: 'remove' }, 'founder', { ...opts, catalogue })
      if (removed) result.resolved.push(removed)
      continue
    }
    const resolved = await resolveChangeEvent(event.id, resolution, { ...opts, catalogue })
    if (resolved) result.resolved.push(resolved)
    else result.skipped.push({ id: event.id, reason: 'Not found' })
  }

  await flushChangeNotifications()
  return result
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
 *
 * In manual mode (the default) this sends nothing — the emails wait in the hub
 * for a person. `awaitingSend` is what the founder needs to see: how many
 * members are owed a message right now.
 */
export async function flushChangeNotifications(): Promise<{
  sent: number
  failed: number
  awaitingSend: number
}> {
  const { flushOutbox, listNotifications } = await import('@/lib/notify/outbox')
  const result = await flushOutbox({
    onSent: async (notification) => {
      if (!notification.changeEventId) return
      await updateChange(notification.changeEventId, (e) => {
        e.notifiedAt = notification.sentAt ?? new Date().toISOString()
      })
    },
  })

  const waiting = await listNotifications({ status: 'queued', limit: 200 })
  return { sent: result.sent.length, failed: result.failed.length, awaitingSend: waiting.length }
}

/**
 * Stamp the change this notification concerns as told.
 *
 * Shared by every route an email can take — copied out by hand, sent with a
 * click, or flushed automatically — so the member's record and the outbox can
 * never disagree about whether they've heard from us.
 */
async function recordAsTold(notification: { changeEventId?: string | null; sentAt?: string | null }) {
  if (!notification.changeEventId) return
  await updateChange(notification.changeEventId, (e) => {
    e.notifiedAt = notification.sentAt ?? new Date().toISOString()
  })
}

/** A founder ticking an email off as sent from their own mail client. */
export async function markNotificationSentManually(notificationId: string) {
  const { markSentManually } = await import('@/lib/notify/outbox')
  const sent = await markSentManually(notificationId)
  if (!sent) return null
  await recordAsTold(sent)
  return sent
}

/**
 * The Send button: deliver one email through the configured provider.
 *
 * Only stamps the change as told when the send actually succeeded — a failure
 * leaves the member correctly showing as not-yet-told, which is what keeps the
 * hub's "outstanding" count meaningful.
 */
export async function sendNotificationNow(notificationId: string) {
  const { sendNotificationNow: send } = await import('@/lib/notify/outbox')
  const result = await send(notificationId)
  if (!result) return null
  if (result.status === 'sent') await recordAsTold(result)
  return result
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

/**
 * Today's stock and price for every SKU the supplier carries.
 *
 * Uses `getStockLevels()` rather than `listProducts()` on purpose. Against live
 * PowerBody the two are wildly different calls: stock levels are a handful of
 * paged requests, while the full product list additionally fetches descriptive
 * detail one product at a time — thousands of requests for fields (name, image,
 * description) that change detection never looks at. `SupplierStockLevel` is
 * exactly `FeedEntry`, so nothing downstream notices.
 */
async function readFeed(): Promise<FeedEntry[]> {
  const supplier = await getSupplier()
  const levels = await supplier.getStockLevels()
  return levels.map((l) => ({
    sku: l.sku,
    stock: l.stock,
    inStock: l.inStock,
    wholesalePrice: l.wholesalePrice,
    rrp: l.rrp,
  }))
}

async function loadCatalogue(): Promise<CatalogueProduct[]> {
  const { getResolvedCatalogue } = await import('@/lib/catalogue/resolve')
  return (await getResolvedCatalogue()).products
}
