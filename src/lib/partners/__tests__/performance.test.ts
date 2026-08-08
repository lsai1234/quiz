import { summarise } from '@/lib/partners/performance'
import type { Order, OrderStatus, OrderChannel } from '@/lib/orders/types'

function order(over: { status: OrderStatus; total?: number; channel?: OrderChannel; createdAt?: string }): Order {
  return {
    id: `ord_${Math.random()}`,
    channel: over.channel ?? 'shop',
    status: over.status,
    userId: null,
    email: 'buyer@example.com',
    currency: 'GBP',
    subtotal: over.total ?? 90,
    shipping: 0,
    total: over.total ?? 90,
    lines: [],
    shippingAddress: null,
    stripeSessionId: null,
    stripePaymentIntentId: null,
    supplierOrderId: null,
    supplierStatus: null,
    trackingNumber: null,
    partnerCode: 'SARAH20',
    events: [],
    createdAt: over.createdAt ?? '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
  }
}

describe('what a partner has brought in', () => {
  it('counts money that came in and stayed in', () => {
    const out = summarise('SARAH20', [
      order({ status: 'paid', total: 90 }),
      order({ status: 'shipped', total: 60 }),
      order({ status: 'delivered', total: 50 }),
    ])
    expect(out.orders).toBe(3)
    expect(out.revenue).toBe(200)
  })

  it('does not count somebody sitting on a payment page', () => {
    // An abandoned checkout is not a sale, and counting it would show a partner
    // revenue that never arrived.
    const out = summarise('SARAH20', [order({ status: 'pending_payment', total: 90 })])
    expect(out.orders).toBe(0)
    expect(out.revenue).toBe(0)
  })

  it('shows reversals rather than quietly dropping them', () => {
    const out = summarise('SARAH20', [
      order({ status: 'paid', total: 90 }),
      order({ status: 'refunded', total: 90 }),
      order({ status: 'cancelled', total: 40 }),
    ])
    // Counted from the orders themselves, so a refund stops counting the moment
    // its status changes — nothing has to remember to decrement a tally.
    expect(out.orders).toBe(1)
    expect(out.revenue).toBe(90)
    expect(out.reversed).toBe(2)
  })

  it('separates subscriptions from one-offs', () => {
    const out = summarise('SARAH20', [
      order({ status: 'paid', channel: 'subscription' }),
      order({ status: 'paid', channel: 'shop' }),
    ])
    expect(out.orders).toBe(2)
    expect(out.subscriptions).toBe(1)
  })

  it('reports the most recent qualifying order', () => {
    const out = summarise('SARAH20', [
      order({ status: 'paid', createdAt: '2026-08-01T00:00:00.000Z' }),
      order({ status: 'paid', createdAt: '2026-08-09T00:00:00.000Z' }),
      // A later refund must not become the "last order".
      order({ status: 'refunded', createdAt: '2026-08-20T00:00:00.000Z' }),
    ])
    expect(out.lastOrderAt).toBe('2026-08-09T00:00:00.000Z')
  })

  it('is all zeroes for a partner nobody has used yet', () => {
    expect(summarise('NEW20', [])).toEqual({
      code: 'NEW20',
      orders: 0,
      revenue: 0,
      subscriptions: 0,
      reversed: 0,
      lastOrderAt: null,
    })
  })
})
