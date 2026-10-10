/**
 * Automatic sending: a paid order goes to PowerBody by itself.
 *
 * Until this existed nothing reached the supplier unless a founder pressed Send,
 * which was the right rule while the integration was young and is now the
 * bottleneck: every order waited for somebody to be at a phone. With the switch
 * on (Settings → Supplier, and only while order sending is live), an order that
 * is paid and clean goes the moment payment is confirmed.
 *
 * ── "Clean" is the whole design ─────────────────────────────────────────────
 * Automatic sending only ever does the boring case. Anything that needs a
 * judgement is HELD — left in the review queue with the reason written on it and
 * a notification to the founders — never guessed at:
 *
 *   • the send's own gate refuses it (`sendBlocker`: no address, somewhere
 *     PowerBody will not ship, nothing with a PowerBody code);
 *   • any line has no PowerBody code (sending the rest would silently drop it);
 *   • it is free — a founder code or a partner's starter, which always get a look;
 *   • there is no phone or email for the courier;
 *   • PowerBody say something is short, OR cannot confirm it in time. This is
 *     the one place stock fails CLOSED: an unconfirmed item means a person looks.
 *
 * An out-of-stock item is then a founder's call on the order page — swap it,
 * send the rest and refund it, or send the rest and back-order it — because each
 * of those is a decision about a customer's money and what lands on their
 * doorstep. See `./line-changes`.
 *
 * ── Exactly once ─────────────────────────────────────────────────────────────
 * The payment webhook triggers it straight after the response, and the daily
 * sweep catches anything that trigger missed. Both claim the order first
 * (`Order.autoSend`), so the second to arrive leaves it alone; and a send that
 * does race a founder's press is answered ALREADY_EXISTS by PowerBody, which the
 * adapter reads as success.
 *
 * Server-only.
 */
import { getAutoSendSince, isAutoSendActive } from '@/lib/supplier/ordering'
import { checkLiveStock, type StockCheckItem, type StockCheckResult } from '@/lib/supplier/stock-check'
import type { SupplierProvider } from '@/lib/supplier/types'
import type { CatalogueProduct } from '@/lib/catalogue/types'
import { runAfterResponse } from '@/lib/after-response'
import { getOrder, listAwaitingFulfilment, updateOrder } from './repo'
import { approveOrderForSupplier, orderReference, reviewStateOf, sendBlocker, submitOrderToSupplier } from './service'
import { neverPaid } from './unpaid'
import type { Order } from './types'

export type AutoSendResult =
  | { outcome: 'off' | 'skipped'; reason: string }
  | { outcome: 'sent' | 'held' | 'failed'; reasons: string[] }

export interface AutoSendDeps {
  /** Injected by tests; otherwise the configured supplier. */
  supplier?: SupplierProvider
  /** Injected by tests; otherwise the resolved catalogue. */
  catalogue?: CatalogueProduct[]
}

/** The background budget for asking PowerBody about stock — nobody is waiting. */
const STOCK_DEADLINE_MS = 25_000

const AUTO = 'Automatic sending'

async function catalogueFor(deps: AutoSendDeps): Promise<CatalogueProduct[]> {
  if (deps.catalogue) return deps.catalogue
  try {
    const { getResolvedCatalogue } = await import('@/lib/catalogue/resolve')
    return (await getResolvedCatalogue()).products
  } catch {
    // Costs the product-id shortcut; the SKU search still runs.
    return []
  }
}

/** An order's lines, as a stock check reads them. */
export function stockItemsFor(order: Pick<Order, 'lines'>, catalogue: CatalogueProduct[]): StockCheckItem[] {
  return order.lines
    .filter((line) => line.sku)
    .map((line) => ({
      sku: line.sku!,
      quantity: line.quantity,
      title: line.variantTitle ? `${line.title} (${line.variantTitle})` : line.title,
      supplierProductId: catalogue.find((p) => p.id === line.productId)?.supplierProductId ?? null,
    }))
}

/** A stock check's findings, as sentences for the review queue. */
export function stockReasons(check: StockCheckResult): string[] {
  const reasons = check.shortfalls.map((s) => {
    switch (s.reason) {
      case 'not-enough':
        return `${s.title} (${s.sku}): PowerBody have ${s.stock}, the order needs ${s.wanted}`
      case 'discontinued':
        return `${s.title} (${s.sku}) is no longer sold by PowerBody`
      case 'not-carried':
        return `${s.title} (${s.sku}) is not on your PowerBody account`
      default:
        return `${s.title} (${s.sku}) is out of stock at PowerBody`
    }
  })
  if (check.unconfirmed.length > 0) {
    reasons.push(
      `Could not confirm stock at PowerBody for ${check.unconfirmed.join(', ')}${check.error ? ` (${check.error})` : ''}`,
    )
  }
  return reasons
}

/** Why this order needs a person before it goes, without asking PowerBody. */
export function localHoldReasons(order: Order): string[] {
  const reasons: string[] = []
  const blocked = sendBlocker(order, { assumeApproved: true })
  if (blocked) reasons.push(blocked)

  const uncoded = order.lines.filter((l) => !l.sku)
  if (uncoded.length > 0) {
    reasons.push(`${uncoded.map((l) => l.title).join(', ')} ${uncoded.length === 1 ? 'has' : 'have'} no PowerBody code`)
  }
  if (order.founderCode || order.starterCode || order.total <= 0) {
    reasons.push('A free order (founder code or partner starter) — these always get a look first')
  }
  const address = order.shippingAddress
  if (address && !address.phone && !address.email && !order.email) {
    reasons.push('No phone number or email for the courier to send a delivery code to')
  }
  return reasons
}

/**
 * A claim whose run never reported back.
 *
 * The send runs after the webhook's response, inside the platform's time limit;
 * cut off mid-way, it leaves the order claimed as `sending` with nothing sent.
 * Past this age the claim is presumed dead and may be taken again. Sending twice
 * is safe — PowerBody answer ALREADY_EXISTS, which reads as success.
 */
const STALE_CLAIM_MS = 15 * 60 * 1000

function isStaleClaim(order: Pick<Order, 'autoSend' | 'status'>, now = Date.now()): boolean {
  return (
    order.autoSend?.outcome === 'sending' &&
    order.status === 'paid' &&
    now - new Date(order.autoSend.at).getTime() > STALE_CLAIM_MS
  )
}

/** Buzz the founders about an order that needs them. Never throws. */
async function tellFounders(order: Order, title: string, body: string): Promise<void> {
  try {
    const { sendToDevices } = await import('@/lib/push/send')
    const { reviewCount } = await import('@/lib/push/badge')
    await sendToDevices({
      title,
      body,
      url: `/founderhub/commerce/orders/${order.id}`,
      tag: `auto-send-${order.id}`,
      badge: await reviewCount(),
    })
  } catch (err) {
    console.error('[auto-send] founder notification failed:', err)
  }
}

/**
 * Send one paid order if it is clean, or hold it with the reasons written on.
 * Never throws; the outcome says what happened.
 */
export async function autoSendOrder(id: string, deps: AutoSendDeps = {}): Promise<AutoSendResult> {
  if (!isAutoSendActive()) return { outcome: 'off', reason: 'Automatic sending is off.' }

  const order = await getOrder(id)
  if (!order) return { outcome: 'skipped', reason: 'No such order.' }
  if (order.status !== 'paid') return { outcome: 'skipped', reason: `The order is ${order.status}.` }
  if (neverPaid(order)) return { outcome: 'skipped', reason: 'Never paid.' }
  if (order.supplierOrderId) return { outcome: 'skipped', reason: 'Already with PowerBody.' }
  // A founder has already decided — held, rejected, or approved to send by hand.
  if (reviewStateOf(order) !== 'pending') return { outcome: 'skipped', reason: `Review is ${reviewStateOf(order)}.` }
  if (order.lines.length === 0) return { outcome: 'skipped', reason: 'Nothing to send.' }
  // Free orders always get a look, and already have their own "free order to
  // review" alert — holding them here would only buzz the phone twice.
  if (order.founderCode || order.starterCode || order.total <= 0) {
    return { outcome: 'skipped', reason: 'A free order — reviewed by hand.' }
  }

  // The claim. Whoever writes the record first owns the attempt — except a
  // claim left at `sending` by a run that was cut off, which is retried.
  let claimed = false
  await updateOrder(id, (o) => {
    if (o.supplierOrderId || (o.autoSend && !isStaleClaim(o))) return
    o.autoSend = { at: new Date().toISOString(), outcome: 'sending', reasons: [] }
    claimed = true
  })
  if (!claimed) return { outcome: 'skipped', reason: 'Already handled by automatic sending.' }

  const reasons = localHoldReasons(order)
  // Only worth asking PowerBody when nothing local already stops it.
  if (reasons.length === 0) {
    const catalogue = await catalogueFor(deps)
    const check = await checkLiveStock(stockItemsFor(order, catalogue), {
      supplier: deps.supplier,
      allowSkuSearch: true,
      deadlineMs: STOCK_DEADLINE_MS,
    })
    if (!check.ran) reasons.push('Stock could not be checked: the supplier is not set to live PowerBody')
    reasons.push(...stockReasons(check))
    if (check.live.length > 0) {
      const { rememberLiveStock } = await import('@/lib/supplier/sync')
      await rememberLiveStock(check.live)
    }
  }

  if (reasons.length > 0) {
    await updateOrder(id, (o) => {
      o.autoSend = { at: new Date().toISOString(), outcome: 'held', reasons }
      o.review = {
        ...(o.review ?? { state: 'pending' }),
        state: 'pending',
        by: AUTO,
        at: new Date().toISOString(),
        note: `Not sent automatically: ${reasons[0]}${reasons.length > 1 ? ` (and ${reasons.length - 1} more)` : ''}.`,
      }
      o.events.push({ at: new Date().toISOString(), type: 'auto_send_held', detail: reasons.join('; ') })
    })
    await tellFounders(order, `Order needs you · ${orderReference(order)}`, reasons[0])
    return { outcome: 'held', reasons }
  }

  try {
    await approveOrderForSupplier(id, AUTO, 'Sent automatically once paid')
    await submitOrderToSupplier(id)
    await updateOrder(id, (o) => {
      o.autoSend = { at: new Date().toISOString(), outcome: 'sent', reasons: [] }
    })
    return { outcome: 'sent', reasons: [] }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await updateOrder(id, (o) => {
      o.autoSend = { at: new Date().toISOString(), outcome: 'failed', reasons: [message] }
    })
    await tellFounders(order, `PowerBody refused ${orderReference(order)}`, message)
    return { outcome: 'failed', reasons: [message] }
  }
}

/**
 * Called wherever an order becomes paid. Cheap when the switch is off — no
 * import, no read — and never blocks or throws into the payment path: the
 * attempt runs after the response, where the route allows.
 */
export function scheduleAutoSend(order: Pick<Order, 'id' | 'status'>): Promise<void> {
  if (!isAutoSendActive() || order.status !== 'paid') return Promise.resolve()
  return runAfterResponse('auto-send', () => autoSendOrder(order.id))
}

export interface AutoSendSweepResult {
  sent: number
  held: number
  failed: number
  /** Back-ordered items found back in stock — sent, or flagged ready to send. */
  backordersReleased: number
}

/**
 * The safety net, from the daily job: anything paid that automatic sending never
 * got to (a trigger cut short, an order paid while the switch was off), and
 * back-orders whose item has come back.
 *
 * Orders raised in the last few minutes are left to their own trigger, which is
 * very likely running right now.
 */
export async function sweepAutoSend(
  deps: AutoSendDeps & { now?: Date; limit?: number } = {},
): Promise<AutoSendSweepResult> {
  const result: AutoSendSweepResult = { sent: 0, held: 0, failed: 0, backordersReleased: 0 }
  const now = deps.now ?? new Date()
  const settled = new Date(now.getTime() - 5 * 60 * 1000).toISOString()
  const orders = await listAwaitingFulfilment(500)

  if (isAutoSendActive()) {
    // Only what was paid since the switch went on: a backlog nobody has looked
    // at is not something to start sending unannounced.
    const since = getAutoSendSince()
    const due = orders
      .filter(
        (o) =>
          o.status === 'paid' &&
          (!o.autoSend || isStaleClaim(o, now.getTime())) &&
          !o.backorder &&
          reviewStateOf(o) === 'pending',
      )
      .filter((o) => o.createdAt <= settled && (!since || o.createdAt >= since))
      .slice(0, deps.limit ?? 25)
    for (const order of due) {
      const outcome = await autoSendOrder(order.id, deps)
      if (outcome.outcome === 'sent') result.sent += 1
      else if (outcome.outcome === 'held') result.held += 1
      else if (outcome.outcome === 'failed') result.failed += 1
    }
  }

  for (const order of orders.filter((o) => o.backorder && !o.supplierOrderId && o.status === 'paid')) {
    if (await releaseBackorder(order, deps)) result.backordersReleased += 1
  }
  return result
}

/**
 * A back-ordered item: is it back? If so, send it (automatic sending on) or say
 * so on the order (off). Read-only at PowerBody until the send.
 */
async function releaseBackorder(order: Order, deps: AutoSendDeps): Promise<boolean> {
  const catalogue = await catalogueFor(deps)
  const check = await checkLiveStock(stockItemsFor(order, catalogue), { supplier: deps.supplier, allowSkuSearch: true, deadlineMs: STOCK_DEADLINE_MS })
  if (!check.ran || !check.confirmed || check.shortfalls.length > 0) return false

  if (isAutoSendActive() && localHoldReasons(order).length === 0) {
    try {
      await approveOrderForSupplier(order.id, AUTO, 'Back in stock — sent automatically')
      await submitOrderToSupplier(order.id)
      await updateOrder(order.id, (o) => {
        o.autoSend = { at: new Date().toISOString(), outcome: 'sent', reasons: [] }
        o.events.push({ at: new Date().toISOString(), type: 'backorder_released', detail: 'Back in stock at PowerBody — sent automatically' })
      })
      return true
    } catch (err) {
      await tellFounders(order, `Back-order refused · ${orderReference(order)}`, err instanceof Error ? err.message : String(err))
      return false
    }
  }

  // Off: say so where the founder will look, once.
  const note = 'Back in stock at PowerBody — ready to send.'
  if (order.review?.note === note) return false
  await updateOrder(order.id, (o) => {
    o.review = { ...(o.review ?? { state: 'held' }), note, at: new Date().toISOString() }
    o.events.push({ at: new Date().toISOString(), type: 'backorder_in_stock', detail: note })
  })
  await tellFounders(order, `Back in stock · ${orderReference(order)}`, `${order.backorder?.title ?? 'The back-ordered item'} can be sent now.`)
  return true
}
