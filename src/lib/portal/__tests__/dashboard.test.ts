import { buildDashboard, moneyWindow } from '../dashboard'
import { PRICING_CONFIG } from '@/lib/stack-blueprint/pricing'
import type { Order, OrderLine, OrderStatus } from '@/lib/orders/types'
import type { SubscriptionSummary } from '@/lib/changes/health'

const NOW = new Date('2026-08-15T12:00:00.000Z')
const ago = (hours: number) => new Date(NOW.getTime() - hours * 3600_000).toISOString()

const LINE: OrderLine = { sku: 'S', productId: 'p', title: 'P', quantity: 1, unitPrice: 40, supplierCost: 12 }

function order(over: Partial<Order> = {}): Order {
  const lines = over.lines ?? [LINE]
  const subtotal = lines.reduce((s, l) => s + l.unitPrice * l.quantity, 0)
  return {
    id: `ord_${Math.random().toString(36).slice(2, 9)}`,
    channel: 'shop',
    status: 'paid' as OrderStatus,
    userId: null,
    email: 'a@b.com',
    currency: 'GBP',
    subtotal,
    shipping: 0,
    total: subtotal,
    lines,
    shippingAddress: null,
    stripeSessionId: null,
    stripePaymentIntentId: null,
    supplierOrderId: null,
    supplierStatus: null,
    trackingNumber: null,
    events: [],
    createdAt: ago(2),
    updatedAt: ago(2),
    ...over,
  }
}

const sub = (monthly: number, health: SubscriptionSummary['health'] = 'healthy'): SubscriptionSummary => ({
  userId: `u${Math.random()}`,
  email: 'm@b.com',
  status: 'active',
  flatMonthly: monthly,
  lineCount: 2,
  health,
  openCount: health === 'requires-action' ? 1 : 0,
  nextAutoApplyAt: null,
  defaultChangePolicy: 'auto-swap',
  overriddenLines: 0,
  startedAt: ago(500),
})

const base = {
  config: PRICING_CONFIG,
  awaitingReview: 0,
  readyToSend: 0,
  openChanges: 0,
  productsNeedingAttention: 0,
  now: NOW,
}

describe('money windows', () => {
  it('counts revenue, goods and the postage we carry', () => {
    const w = moneyWindow(ago(24), [order(), order()], PRICING_CONFIG)
    expect(w.orders).toBe(2)
    expect(w.revenue).toBe(80)
    expect(w.cogs).toBe(24)
    // One unit per order: £3.50 parcel + £0.40 unit, and the member paid nothing.
    expect(w.delivery).toBeCloseTo(7.8, 2)
    expect(w.grossProfit).toBeCloseTo(48.2, 2)
    expect(w.aov).toBe(40)
  })

  it('subtracts what the member paid for postage from what we carry', () => {
    const w = moneyWindow(ago(24), [order({ shipping: 3.95, total: 43.95 })], PRICING_CONFIG)
    expect(w.delivery).toBe(0) // £3.90 cost, £3.95 collected — nothing carried
    expect(w.revenue).toBe(43.95)
  })

  it('leaves orders it cannot cost out of the margin, and says how many', () => {
    const uncosted = order({ lines: [{ sku: 'S', productId: 'p', title: 'P', quantity: 1, unitPrice: 40 }] })
    const w = moneyWindow(ago(24), [order(), uncosted], PRICING_CONFIG)
    expect(w.orders).toBe(2)
    expect(w.revenue).toBe(80) // revenue still counts both
    expect(w.ordersWithUnknownCost).toBe(1)
    // …but the margin is measured only against the £40 we could cost.
    expect(w.cogs).toBe(12)
    expect(w.marginPct).toBeCloseTo((40 - 12 - 3.9) / 40, 2)
  })

  it('does not count money we gave back as revenue', () => {
    const w = moneyWindow(ago(24), [order(), order({ status: 'refunded' }), order({ status: 'cancelled' })], PRICING_CONFIG)
    expect(w.orders).toBe(1)
    expect(w.revenue).toBe(40)
    expect(w.refunded).toBe(2)
    expect(w.refundedValue).toBe(80)
  })

  it('ignores orders outside the window', () => {
    const w = moneyWindow(ago(24), [order(), order({ createdAt: ago(72) })], PRICING_CONFIG)
    expect(w.orders).toBe(1)
  })

  it('counts a shipped or delivered order as earned, and a pending one as not', () => {
    const w = moneyWindow(ago(24), [
      order({ status: 'shipped' }),
      order({ status: 'delivered' }),
      order({ status: 'pending_payment' }),
    ], PRICING_CONFIG)
    expect(w.orders).toBe(2)
  })
})

describe('dashboard summary', () => {
  it('splits the money into today, the week and the calendar month', () => {
    const orders = [order({ createdAt: ago(2) }), order({ createdAt: ago(48) }), order({ createdAt: ago(24 * 20) })]
    const d = buildDashboard({ ...base, orders, subscriptions: [] })
    expect(d.today.orders).toBe(1)
    expect(d.last7.orders).toBe(2)
    // The third order is 20 days back — before 1 August, so outside this month.
    expect(d.month.orders).toBe(2)
  })

  it('reports the subscription book', () => {
    const d = buildDashboard({ ...base, orders: [], subscriptions: [sub(40), sub(60), sub(50, 'requires-action')] })
    expect(d.subscriptions.active).toBe(3)
    expect(d.subscriptions.mrr).toBe(150)
    expect(d.subscriptions.arpu).toBe(50)
    expect(d.subscriptions.requiresAction).toBe(1)
  })

  it('lists what needs a founder, biggest first, and hides what does not', () => {
    const d = buildDashboard({
      ...base,
      orders: [],
      subscriptions: [sub(40, 'requires-action')],
      awaitingReview: 7,
      readyToSend: 2,
      openChanges: 0,
      productsNeedingAttention: 3,
    })
    expect(d.actionRequired.map((a) => a.count)).toEqual([7, 3, 2, 1])
    expect(d.actionRequired[0].label).toMatch(/review before we ask the supplier/)
    // Nothing open, so product changes are not on the list at all.
    expect(d.actionRequired.some((a) => a.label.includes('Product changes'))).toBe(false)
  })

  it('separates orders in flight from ones that failed to reach the supplier', () => {
    const d = buildDashboard({
      ...base,
      orders: [order({ status: 'shipped' }), order({ status: 'submitted_to_supplier' }), order({ status: 'failed' })],
      subscriptions: [],
    })
    expect(d.orders.inFlight).toBe(2)
    expect(d.orders.failed).toBe(1)
  })

  it('is all zeroes rather than NaN on a brand-new business', () => {
    const d = buildDashboard({ ...base, orders: [], subscriptions: [] })
    expect(d.month.revenue).toBe(0)
    expect(d.month.marginPct).toBe(0)
    expect(d.month.aov).toBe(0)
    expect(d.subscriptions.arpu).toBe(0)
    expect(d.actionRequired).toEqual([])
  })
})
