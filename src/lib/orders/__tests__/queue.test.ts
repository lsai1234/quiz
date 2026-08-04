import {
  createOrderFromCheckout,
  submitOrderToSupplier,
  approveOrderForSupplier,
  holdOrder,
  rejectOrderForFulfilment,
  returnOrderToQueue,
  reviewStateOf,
  awaitingReview,
} from '@/lib/orders/service'
import { getOrder, listAwaitingFulfilment } from '@/lib/orders/repo'
import { buildFulfilmentQueue } from '@/lib/orders/queue'
import type { Order, OrderLine } from '@/lib/orders/types'

const LINES: OrderLine[] = [
  { sku: 'ON-CREA-634', productId: 'creatine', title: 'Creatine', quantity: 2, unitPrice: 27.99, supplierCost: 16 },
]
const ADDRESS = { name: 'A B', line1: '1 Test St', city: 'London', postcode: 'E1 1AA', country: 'GB' }

const paid = () =>
  createOrderFromCheckout({ channel: 'shop', email: 'a@b.com', lines: LINES, shippingAddress: ADDRESS })

describe('the supplier review gate', () => {
  it('starts every order unreviewed', async () => {
    const order = await paid()
    expect(reviewStateOf(order)).toBe('pending')
    expect(awaitingReview(order)).toBe(true)
  })

  it('refuses to send an order nobody has approved', async () => {
    const order = await paid()
    await expect(submitOrderToSupplier(order.id)).rejects.toThrow(/not been approved/)
    expect((await getOrder(order.id))?.supplierOrderId).toBeNull()
  })

  it('sends once a founder approves, and records who', async () => {
    const order = await paid()
    await approveOrderForSupplier(order.id, 'Lewis', 'Address checks out')
    const approved = await getOrder(order.id)
    expect(approved?.review?.state).toBe('approved')
    expect(approved?.review?.by).toBe('Lewis')

    const sent = await submitOrderToSupplier(order.id)
    expect(sent?.status).toBe('submitted_to_supplier')
    expect(sent?.supplierOrderId).toMatch(/^PB-/)
  })

  it('refuses to send an order that is held or rejected', async () => {
    const held = await paid()
    await holdOrder(held.id, 'Lewis', 'Waiting on the member')
    await expect(submitOrderToSupplier(held.id)).rejects.toThrow(/not been approved/)

    const rejected = await paid()
    await rejectOrderForFulfilment(rejected.id, 'Lewis')
    await expect(submitOrderToSupplier(rejected.id)).rejects.toThrow(/not been approved/)
  })

  it('rejecting does not touch the money', async () => {
    const order = await paid()
    await rejectOrderForFulfilment(order.id, 'Lewis', 'Duplicate')
    const after = await getOrder(order.id)
    // Still paid — refunding is a separate, deliberate decision.
    expect(after?.status).toBe('paid')
    expect(after?.review?.state).toBe('rejected')
  })

  it('reopens a held order for a fresh decision', async () => {
    const order = await paid()
    await holdOrder(order.id, 'Lewis')
    await returnOrderToQueue(order.id, 'Lewis')
    expect((await getOrder(order.id))?.review?.state).toBe('pending')
  })

  it('drops out of the review once it has been sent', async () => {
    const order = await paid()
    await approveOrderForSupplier(order.id)
    const sent = await submitOrderToSupplier(order.id)
    expect(awaitingReview(sent!)).toBe(false)
    expect((await listAwaitingFulfilment()).map((o) => o.id)).not.toContain(order.id)
  })

  it('will not approve an order that has not been paid for', async () => {
    const pending = await createOrderFromCheckout({ channel: 'shop', lines: LINES, status: 'pending_payment' })
    await expect(approveOrderForSupplier(pending.id)).rejects.toThrow(/only a paid order/)
  })
})

describe('the daily queue', () => {
  const at = (iso: string, over: Partial<Order> = {}): Order =>
    ({
      id: `ord_${iso}_${Math.random().toString(36).slice(2, 7)}`,
      reference: 'CHRGD-TEST',
      channel: 'shop',
      status: 'paid',
      userId: null,
      email: 'a@b.com',
      currency: 'GBP',
      subtotal: 20,
      shipping: 0,
      total: 20,
      lines: [{ sku: 'SKU-1', productId: 'p', title: 'P', quantity: 1, unitPrice: 20, supplierCost: 8 }],
      shippingAddress: ADDRESS,
      stripeSessionId: null,
      stripePaymentIntentId: null,
      supplierOrderId: null,
      supplierStatus: null,
      trackingNumber: null,
      events: [],
      createdAt: `${iso}T09:00:00.000Z`,
      updatedAt: `${iso}T09:00:00.000Z`,
      ...over,
    }) as Order

  it('groups by the day the order was raised, newest first', () => {
    const q = buildFulfilmentQueue([at('2026-08-01'), at('2026-08-03'), at('2026-08-03')])
    expect(q.days.map((d) => d.date)).toEqual(['2026-08-03', '2026-08-01'])
    expect(q.days[0].orders).toHaveLength(2)
  })

  it('counts what is waiting, ready and parked', () => {
    const q = buildFulfilmentQueue([
      at('2026-08-03'),
      at('2026-08-03', { review: { state: 'approved' } }),
      at('2026-08-03', { review: { state: 'held' } }),
      at('2026-08-03', { review: { state: 'rejected' } }),
    ])
    expect(q.pending).toBe(1)
    expect(q.readyToSend).toBe(1)
    expect(q.held).toBe(1)
    expect(q.rejected).toBe(1)
    expect(q.total).toBe(80)
  })

  it('separates one-off orders from subscription renewals', () => {
    const orders = [at('2026-08-03'), at('2026-08-03', { channel: 'quiz' }), at('2026-08-03', { channel: 'subscription' })]
    expect(buildFulfilmentQueue(orders).oneOff).toBe(2)
    expect(buildFulfilmentQueue(orders).subscription).toBe(1)
    expect(buildFulfilmentQueue(orders, 'subscription').days[0].orders).toHaveLength(1)
    expect(buildFulfilmentQueue(orders, 'one-off').days[0].orders).toHaveLength(2)
  })

  it('flags orders that could not be dropshipped as they stand', () => {
    const noSku = at('2026-08-03', { lines: [{ sku: null, productId: 'p', title: 'P', quantity: 1, unitPrice: 20 }] })
    const noAddress = at('2026-08-03', { shippingAddress: null })
    const q = buildFulfilmentQueue([noSku, noAddress, at('2026-08-03')])
    expect(q.blocked).toBe(2)
  })

  it('treats an order written before the queue existed as needing review', () => {
    const legacy = at('2026-07-01')
    delete (legacy as Partial<Order>).review
    expect(buildFulfilmentQueue([legacy]).pending).toBe(1)
  })

  it('shows what an order costs us, and says so only when every line is known', () => {
    const known = buildFulfilmentQueue([at('2026-08-03')]).days[0].orders[0]
    expect(known.supplierCost).toBe(8)

    const partial = at('2026-08-03', {
      lines: [
        { sku: 'a', productId: 'a', title: 'A', quantity: 1, unitPrice: 10, supplierCost: 4 },
        { sku: 'b', productId: 'b', title: 'B', quantity: 1, unitPrice: 10 },
      ],
    })
    expect(buildFulfilmentQueue([partial]).days[0].orders[0].supplierCost).toBeNull()
  })
})
