import {
  createOrderFromCheckout,
  submitOrderToSupplier,
  syncSupplierStatus,
  refundOrder,
  cancelOrder,
  markOrderPaid,
  approveOrderForSupplier,
} from '@/lib/orders/service'
import { getOrder } from '@/lib/orders/repo'
import type { OrderLine } from '@/lib/orders/types'

const LINES: OrderLine[] = [
  { sku: 'ON-CREA-634', productId: 'creatine', title: 'Creatine', quantity: 2, unitPrice: 27.99, supplierCost: 16 },
  { sku: 'APP-CREA-250', productId: 'creatine-250', title: 'Creatine 250', quantity: 1, unitPrice: 12.99, supplierCost: 6.5 },
]

describe('order lifecycle', () => {
  it('creates a paid order with correct totals and events', async () => {
    const order = await createOrderFromCheckout({ channel: 'shop', email: 'a@b.com', lines: LINES })
    expect(order.status).toBe('paid')
    expect(order.subtotal).toBe(68.97)
    expect(order.total).toBe(68.97)
    expect(order.events.map((e) => e.type)).toEqual(['created', 'paid'])
  })

  it('submits an approved order to the supplier, then syncs its status', async () => {
    const order = await createOrderFromCheckout({
      channel: 'shop',
      lines: LINES,
      shippingAddress: { name: 'Sam Taylor', line1: '1 High Street', city: 'Leeds', postcode: 'LS1 4DY', country: 'GB' },
    })
    await approveOrderForSupplier(order.id, 'Test founder')
    const submitted = await submitOrderToSupplier(order.id)
    expect(submitted?.status).toBe('submitted_to_supplier')
    expect(submitted?.supplierOrderId).toMatch(/^PB-/)

    const synced = await syncSupplierStatus(order.id)
    expect(synced?.supplierStatus).toBe('received')
    expect(synced?.status).toBe('submitted_to_supplier')
  })

  it('refuses to submit an order that is not paid', async () => {
    const order = await createOrderFromCheckout({ channel: 'shop', lines: LINES, status: 'pending_payment' })
    await expect(submitOrderToSupplier(order.id)).rejects.toThrow(/only paid or failed/)
  })

  it('markOrderPaid is idempotent', async () => {
    const order = await createOrderFromCheckout({ channel: 'shop', lines: LINES, status: 'pending_payment' })
    await markOrderPaid(order.id, { stripeSessionId: 'cs_1', stripePaymentIntentId: 'pi_1', email: 'x@y.com' })
    const first = await getOrder(order.id)
    expect(first?.status).toBe('paid')
    expect(first?.stripePaymentIntentId).toBe('pi_1')

    await markOrderPaid(order.id, { stripeSessionId: 'cs_2' }) // second delivery — no-op
    const second = await getOrder(order.id)
    expect(second?.stripeSessionId).toBe('cs_1')
    expect(second?.events.filter((e) => e.type === 'paid')).toHaveLength(1)
  })

  it('refund and cancel are terminal transitions', async () => {
    const a = await createOrderFromCheckout({ channel: 'shop', lines: LINES })
    expect((await refundOrder(a.id))?.status).toBe('refunded')
    const b = await createOrderFromCheckout({ channel: 'quiz', lines: LINES })
    expect((await cancelOrder(b.id))?.status).toBe('cancelled')
  })
})
