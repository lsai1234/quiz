/**
 * The other half of sending an order: finding out what happened to it.
 *
 * Covers the scheduled status sweep and the in-flight list that makes a sent
 * order visible until it arrives. Both exist because PowerBody push us nothing
 * — an order's status used to be only as fresh as the last time a founder
 * opened it and pressed sync.
 */
import {
  approveOrderForSupplier,
  createOrderFromCheckout,
  submitOrderToSupplier,
  sweepSupplierStatuses,
} from '@/lib/orders/service'
import { getOrder, listInFlightWithSupplier } from '@/lib/orders/repo'
import { buildInFlightList } from '@/lib/orders/queue'
import type { Order, OrderLine } from '@/lib/orders/types'

const LINES: OrderLine[] = [
  { sku: 'ON-CREA-634', productId: 'creatine', title: 'Creatine', quantity: 1, unitPrice: 27.99, supplierCost: 16 },
]
const ADDRESS = { name: 'A B', line1: '1 Test St', city: 'London', postcode: 'E1 1AA', country: 'GB' }

/** A paid order, approved and sent — the state the sweep is about. */
async function sent() {
  const order = await createOrderFromCheckout({
    channel: 'shop',
    email: 'a@b.com',
    lines: LINES,
    shippingAddress: ADDRESS,
  })
  await approveOrderForSupplier(order.id, 'Lewis')
  return (await submitOrderToSupplier(order.id))!
}

describe('the supplier status sweep', () => {
  it('picks up orders that are with the supplier', async () => {
    const order = await sent()
    const inFlight = await listInFlightWithSupplier()
    expect(inFlight.map((o) => o.id)).toContain(order.id)
  })

  it('ignores orders still waiting on review — there is nothing to ask about', async () => {
    const unsent = await createOrderFromCheckout({
      channel: 'shop',
      email: 'a@b.com',
      lines: LINES,
      shippingAddress: ADDRESS,
    })
    expect((await listInFlightWithSupplier()).map((o) => o.id)).not.toContain(unsent.id)
  })

  it('checks everything in flight and reports what it found', async () => {
    const order = await sent()
    const result = await sweepSupplierStatuses()
    expect(result.checked).toBeGreaterThan(0)
    expect(result.failures).toEqual([])
    // The order is still known, and still carries the supplier's handle for it.
    expect((await getOrder(order.id))?.supplierOrderId).toBe(order.supplierOrderId)
  })

  it('never sends anything — the approval gate is untouched', async () => {
    // An order nobody approved must not acquire a supplier id because a sweep
    // ran. This is the whole reason the sweep is read-only.
    const unapproved = await createOrderFromCheckout({
      channel: 'shop',
      email: 'a@b.com',
      lines: LINES,
      shippingAddress: ADDRESS,
    })
    await sweepSupplierStatuses()
    const after = await getOrder(unapproved.id)
    expect(after?.supplierOrderId).toBeNull()
    expect(after?.status).toBe('paid')
  })
})

describe('the in-flight list', () => {
  const NOW = new Date('2026-08-10T09:00:00.000Z')

  const order = (over: Partial<Order> = {}): Order =>
    ({
      id: `ord_${Math.random().toString(36).slice(2, 8)}`,
      reference: 'CHRGD-TEST',
      channel: 'shop',
      status: 'submitted_to_supplier',
      userId: null,
      email: 'a@b.com',
      currency: 'GBP',
      subtotal: 20,
      shipping: 0,
      total: 20,
      lines: LINES,
      shippingAddress: ADDRESS,
      stripeSessionId: null,
      stripePaymentIntentId: null,
      supplierOrderId: 'PB-123',
      supplierStatus: 'received',
      trackingNumber: null,
      events: [{ at: '2026-08-09T09:00:00.000Z', type: 'submitted_to_supplier' }],
      createdAt: '2026-08-09T09:00:00.000Z',
      updatedAt: '2026-08-09T09:00:00.000Z',
      ...over,
    }) as Order

  it('reads when it was sent off the audit trail, not the order date', () => {
    const row = buildInFlightList(
      [
        order({
          createdAt: '2026-08-01T09:00:00.000Z',
          events: [{ at: '2026-08-08T09:00:00.000Z', type: 'submitted_to_supplier' }],
        }),
      ],
      NOW,
    )[0]
    // Paid on the 1st, sent on the 8th — two days waiting, not nine.
    expect(row.sentAt).toBe('2026-08-08T09:00:00.000Z')
    expect(row.daysWaiting).toBe(2)
  })

  it('flags an order the supplier has not picked up after two days', () => {
    const stale = order({ events: [{ at: '2026-08-07T09:00:00.000Z', type: 'submitted_to_supplier' }] })
    const fresh = order()
    const rows = buildInFlightList([stale, fresh], NOW)
    expect(rows.find((r) => r.id === stale.id)?.stalled).toBe(true)
    expect(rows.find((r) => r.id === fresh.id)?.stalled).toBe(false)
  })

  it('does not call an order stuck once the supplier has started on it', () => {
    // Being packed for a week is slow, not stuck — and flagging it as stuck is
    // how a flag gets trained into background noise.
    const packing = order({
      status: 'supplier_confirmed',
      supplierStatus: 'processing',
      events: [{ at: '2026-08-01T09:00:00.000Z', type: 'submitted_to_supplier' }],
    })
    expect(buildInFlightList([packing], NOW)[0].stalled).toBe(false)
  })

  it('puts the longest-waiting order first', () => {
    const recent = order({ events: [{ at: '2026-08-09T09:00:00.000Z', type: 'submitted_to_supplier' }] })
    const oldest = order({ events: [{ at: '2026-08-02T09:00:00.000Z', type: 'submitted_to_supplier' }] })
    expect(buildInFlightList([recent, oldest], NOW).map((r) => r.id)).toEqual([oldest.id, recent.id])
  })

  it('says when an order was only simulated', () => {
    const real = order()
    const simulated = order({ supplierSimulated: true, supplierOrderId: 'SIM-1' })
    const rows = buildInFlightList([real, simulated], NOW)
    expect(rows.find((r) => r.id === simulated.id)?.simulated).toBe(true)
    expect(rows.find((r) => r.id === real.id)?.simulated).toBe(false)
  })

  it('copes with an order that has no submit event recorded', () => {
    const noTrail = order({ events: [] })
    const row = buildInFlightList([noTrail], NOW)[0]
    expect(row.sentAt).toBeNull()
    expect(row.daysWaiting).toBeNull()
    // Unknown is not overdue — it must not be reported as stuck.
    expect(row.stalled).toBe(false)
  })
})
