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
  it('separates the till total from what we actually keep after VAT', () => {
    const w = moneyWindow(ago(24), [order(), order()], PRICING_CONFIG)
    expect(w.orders).toBe(2)
    // What customers paid…
    expect(w.revenue).toBe(80)
    // …of which a fifth was never ours.
    expect(w.netRevenue).toBeCloseTo(66.67, 2)
    expect(w.vat).toBeCloseTo(13.33, 2)
    expect(w.aov).toBe(40)
  })

  it('counts goods, PowerBody’s weight-banded delivery and card fees', () => {
    const w = moneyWindow(ago(24), [order(), order()], PRICING_CONFIG)
    expect(w.cogs).toBe(24)
    // No weight on the lines, so the default 1kg — Royal Mail Tracked 48,
    // blended across zones — on each of the two orders.
    expect(w.delivery).toBeCloseTo(6.6, 1)
    expect(w.paymentFees).toBeCloseTo(80 * 0.015 + 0.4, 2)
    expect(w.grossProfit).toBeCloseTo(w.netRevenue - w.cogs - w.delivery - w.paymentFees, 1)
    // The naive "£80 − £24 = 70% margin" is nowhere near the truth.
    expect(w.marginPct).toBeLessThan(0.55)
  })

  it('subtracts what the member paid for postage, net of its own VAT', () => {
    const w = moneyWindow(ago(24), [order({ shipping: 3.95, total: 43.95 })], PRICING_CONFIG)
    // £3.95 collected is £3.29 net against a ~£3.30 cost, so we carry ~nothing.
    expect(w.delivery).toBeCloseTo(0, 1)
    expect(w.revenue).toBe(43.95)
  })

  it('leaves orders it cannot cost out of the margin, and says how many', () => {
    const uncosted = order({ lines: [{ sku: 'S', productId: 'p', title: 'P', quantity: 1, unitPrice: 40 }] })
    const w = moneyWindow(ago(24), [order(), uncosted], PRICING_CONFIG)
    expect(w.orders).toBe(2)
    expect(w.revenue).toBe(80) // revenue still counts both
    expect(w.ordersWithUnknownCost).toBe(1)
    // …but the margin is measured only against the one order we could cost.
    expect(w.cogs).toBe(12)
    const costedNet = 40 / 1.2
    expect(w.marginPct).toBeCloseTo((costedNet - 12 - w.delivery - w.paymentFees) / costedNet, 2)
  })

  it('costs the supplier’s VAT in when we cannot reclaim it', () => {
    const unregistered = { ...PRICING_CONFIG, vat: { ...PRICING_CONFIG.vat, registered: false } }
    const w = moneyWindow(ago(24), [order()], unregistered)
    // Not registered: we keep the whole £40, but the £12 of goods costs £14.40.
    expect(w.netRevenue).toBe(40)
    expect(w.vat).toBe(0)
    expect(w.cogs).toBeCloseTo(14.4, 2)
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
