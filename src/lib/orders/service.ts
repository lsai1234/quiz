/**
 * Order lifecycle service.
 *
 * Pure-ish orchestration over the repo + the supplier provider:
 *   • createOrderFromCheckout — raise a paid order (from the Stripe webhook, or
 *     immediately in mock-payments mode).
 *   • submitOrderToSupplier   — send it to PowerBody for dropship fulfilment.
 *   • syncSupplierStatus      — pull supplier status/tracking back onto the order.
 *   • refundOrder / cancelOrder — terminal transitions.
 *
 * Every transition appends an audit event and is guarded so a bad call (e.g.
 * submitting an unpaid order) fails loudly rather than corrupting state.
 */
import crypto from 'crypto'
import { getSupplier } from '@/lib/supplier'
import type { SupplierOrderStatus, SupplierAddress } from '@/lib/supplier/types'
import { now } from '@/lib/db/engine'
import type { CatalogueProduct } from '@/lib/catalogue/types'
import type { MemberSubscription } from '@/lib/recharge/types'
import { getOrder, listStalePendingOrders, saveOrder, updateOrder } from './repo'
import type { CreateOrderInput, Order, OrderLine, OrderStatus, OrderEvent } from './types'

const round = (n: number) => Math.round(n * 100) / 100

function event(type: string, detail?: string): OrderEvent {
  return { at: now(), type, ...(detail ? { detail } : {}) }
}

export function newOrderId(): string {
  return `ord_${crypto.randomBytes(9).toString('hex')}`
}

/** Raise an order that has been (or is treated as) paid. Idempotent-friendly:
 *  pass a stable `id` and a repeated call updates the same row. */
export async function createOrderFromCheckout(input: CreateOrderInput): Promise<Order> {
  const subtotal = round(input.lines.reduce((s, l) => s + l.unitPrice * l.quantity, 0))
  const shipping = round(input.shipping ?? 0)
  const status: OrderStatus = input.status ?? 'paid'
  const order: Order = {
    id: input.id ?? newOrderId(),
    channel: input.channel,
    status,
    userId: input.userId ?? null,
    email: input.email ?? null,
    currency: input.currency ?? 'GBP',
    subtotal,
    shipping,
    total: round(subtotal + shipping),
    lines: input.lines,
    shippingAddress: input.shippingAddress ?? null,
    stripeSessionId: input.stripeSessionId ?? null,
    stripePaymentIntentId: input.stripePaymentIntentId ?? null,
    supplierOrderId: null,
    supplierStatus: null,
    trackingNumber: null,
    events: [event('created', `channel=${input.channel}`), ...(status === 'paid' ? [event('paid')] : [])],
    createdAt: now(),
    updatedAt: now(),
  }
  await saveOrder(order)
  return order
}

/** Turn a member's subscription bundle into order lines, resolving supplier SKUs
 *  and per-unit price from the catalogue. */
export function subscriptionOrderLines(sub: MemberSubscription, catalogue: CatalogueProduct[]): OrderLine[] {
  return sub.lines.map((line) => {
    const product = catalogue.find((p) => p.id === line.productId)
    const variant =
      product?.variants.find((v) => (v.flavour || v.size || v.title) === line.variantTitle) ??
      product?.variants.find((v) => v.available) ??
      product?.variants[0]
    return {
      sku: variant?.sku ?? null,
      productId: line.productId,
      title: line.productTitle,
      variantTitle: line.variantTitle || null,
      quantity: line.quantity,
      unitPrice: round(line.pricePerDelivery / Math.max(1, line.quantity)),
      supplierCost: product?.cost ?? null,
    }
  })
}

/** Raise a paid subscription order (first box or a renewal). Idempotent when a
 *  stable id is passed (e.g. `ord_inv_<stripeInvoiceId>`). */
export async function createSubscriptionOrder(input: {
  id?: string
  userId?: string | null
  email?: string | null
  sub: MemberSubscription
  catalogue: CatalogueProduct[]
  stripeSubscriptionId?: string | null
  /** Where to ship it. Held on the subscription because Stripe asks once, at signup. */
  shippingAddress?: SupplierAddress | null
  /** The charge behind this invoice, so the order is refundable for real. */
  stripePaymentIntentId?: string | null
}): Promise<Order> {
  // Idempotency: if this invoice already produced an order, return it unchanged.
  if (input.id) {
    const existing = await getOrder(input.id)
    if (existing) return existing
  }
  return createOrderFromCheckout({
    id: input.id,
    channel: 'subscription',
    userId: input.userId ?? null,
    email: input.email ?? input.sub.customerEmail ?? null,
    lines: subscriptionOrderLines(input.sub, input.catalogue),
    shippingAddress: input.shippingAddress ?? input.sub.shippingAddress ?? null,
    stripePaymentIntentId: input.stripePaymentIntentId ?? null,
    status: 'paid',
  })
}

/** Mark a pending order paid (webhook path when the order was pre-created). */
export async function markOrderPaid(
  id: string,
  payment: {
    stripeSessionId?: string
    stripePaymentIntentId?: string
    email?: string | null
    shippingAddress?: SupplierAddress | null
  },
): Promise<Order | null> {
  return updateOrder(id, (o) => {
    if (o.status !== 'pending_payment') return // idempotent — already progressed
    o.status = 'paid'
    if (payment.stripeSessionId) o.stripeSessionId = payment.stripeSessionId
    if (payment.stripePaymentIntentId) o.stripePaymentIntentId = payment.stripePaymentIntentId
    if (payment.email && !o.email) o.email = payment.email
    if (payment.shippingAddress && !o.shippingAddress) o.shippingAddress = payment.shippingAddress
    o.events.push(event('paid'))
  })
}

const SUBMITTABLE: OrderStatus[] = ['paid', 'failed']

/** Send the order to PowerBody for dropship fulfilment. */
export async function submitOrderToSupplier(id: string): Promise<Order | null> {
  const order = await getOrder(id)
  if (!order) return null
  if (!SUBMITTABLE.includes(order.status)) {
    throw new Error(`Order ${id} is ${order.status} — only paid or failed orders can be submitted.`)
  }
  const fulfilable = order.lines.filter((l) => l.sku)
  if (fulfilable.length === 0) {
    throw new Error(`Order ${id} has no lines with a supplier SKU to fulfil.`)
  }

  const supplier = await getSupplier()
  try {
    const result = await supplier.placeOrder({
      reference: order.id,
      shippingAddress:
        order.shippingAddress ?? { name: order.email ?? 'Customer', line1: '', city: '', postcode: '', country: 'GB' },
      lines: fulfilable.map((l) => ({ sku: l.sku!, quantity: l.quantity })),
    })
    return updateOrder(id, (o) => {
      o.supplierOrderId = result.supplierOrderId
      o.supplierStatus = result.status
      o.status = 'submitted_to_supplier'
      o.events.push(event('submitted_to_supplier', `supplierOrderId=${result.supplierOrderId}`))
    })
  } catch (err) {
    await updateOrder(id, (o) => {
      o.status = 'failed'
      o.events.push(event('submit_failed', err instanceof Error ? err.message : String(err)))
    })
    throw err
  }
}

/** Map the supplier's status onto ours. */
function orderStatusForSupplier(s: SupplierOrderStatus): OrderStatus {
  switch (s) {
    case 'received': return 'submitted_to_supplier'
    case 'processing': return 'supplier_confirmed'
    case 'shipped': return 'shipped'
    case 'delivered': return 'delivered'
    case 'cancelled': return 'cancelled'
  }
}

/** Pull the latest supplier status + tracking onto the order. */
export async function syncSupplierStatus(id: string): Promise<Order | null> {
  const order = await getOrder(id)
  if (!order) return null
  if (!order.supplierOrderId) throw new Error(`Order ${id} has not been submitted to the supplier yet.`)

  const supplier = await getSupplier()
  const supplierOrder = await supplier.getOrder(order.supplierOrderId)
  if (!supplierOrder) return order

  const mapped = orderStatusForSupplier(supplierOrder.status)
  return updateOrder(id, (o) => {
    const changed = o.supplierStatus !== supplierOrder.status || o.trackingNumber !== supplierOrder.trackingNumber
    o.supplierStatus = supplierOrder.status
    o.trackingNumber = supplierOrder.trackingNumber
    // Don't regress a terminal side-exit (cancelled/refunded).
    if (!['cancelled', 'refunded'].includes(o.status)) o.status = mapped
    if (changed) o.events.push(event('supplier_status', `${supplierOrder.status}${supplierOrder.trackingNumber ? ` · ${supplierOrder.trackingNumber}` : ''}`))
  })
}

export async function refundOrder(id: string, detail?: string): Promise<Order | null> {
  return updateOrder(id, (o) => {
    o.status = 'refunded'
    o.events.push(event('refunded', detail))
  })
}

/**
 * Close out an order that never got paid — an expired or abandoned checkout.
 *
 * Guarded to `pending_payment` so a late `checkout.session.expired` can never
 * undo a payment that landed first; Stripe does not promise event order.
 */
export async function failOrder(id: string, detail?: string): Promise<Order | null> {
  return updateOrder(id, (o) => {
    if (o.status !== 'pending_payment') return
    o.status = 'failed'
    o.events.push(event('payment_not_completed', detail))
  })
}

/**
 * Sweep abandoned checkouts. `checkout.session.expired` handles these in the
 * normal case; this catches the ones whose webhook never arrived, so the orders
 * list and anything counting conversions off it stay truthful.
 */
export async function sweepStalePendingOrders(olderThanHours = 24, now: Date = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - olderThanHours * 3600_000).toISOString()
  const stale = await listStalePendingOrders(cutoff)
  let closed = 0
  for (const order of stale) {
    const updated = await failOrder(order.id, `No payment ${olderThanHours}h after checkout started`)
    if (updated) closed += 1
  }
  return closed
}

export async function cancelOrder(id: string, detail?: string): Promise<Order | null> {
  return updateOrder(id, (o) => {
    o.status = 'cancelled'
    o.events.push(event('cancelled', detail))
  })
}
