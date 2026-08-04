import { buildVatPosition } from '../vat-position'
import { PRICING_CONFIG, type PricingConfig } from '@/lib/stack-blueprint/pricing'
import { unitEconomics } from '../unit-economics'
import type { Order, OrderStatus } from '@/lib/orders/types'

const NOW = new Date('2026-08-15T12:00:00.000Z')
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000).toISOString()

const unregistered: PricingConfig = { ...PRICING_CONFIG, vat: { ...PRICING_CONFIG.vat, registered: false } }
const registered: PricingConfig = { ...PRICING_CONFIG, vat: { ...PRICING_CONFIG.vat, registered: true } }

function order(total: number, days: number, status: OrderStatus = 'paid'): Order {
  return {
    id: `ord_${Math.random().toString(36).slice(2, 9)}`,
    channel: 'shop',
    status,
    userId: null,
    email: 'a@b.com',
    currency: 'GBP',
    subtotal: total,
    shipping: 0,
    total,
    lines: [{ sku: 'S', productId: 'p', title: 'P', quantity: 1, unitPrice: total, supplierCost: total * 0.4 }],
    shippingAddress: null,
    stripeSessionId: null,
    stripePaymentIntentId: null,
    supplierOrderId: null,
    supplierStatus: null,
    trackingNumber: null,
    events: [],
    createdAt: daysAgo(days),
    updatedAt: daysAgo(days),
  }
}

/** `count` orders of `total`, spread evenly over the last `days`. */
const spread = (count: number, total: number, days: number) =>
  Array.from({ length: count }, (_, i) => order(total, Math.floor((i / count) * days)))

const build = (orders: Order[], config = unregistered) =>
  buildVatPosition({ orders, config, averageCostRatio: 0.4, averageGrams: 1000, now: NOW })

describe('threshold tracking', () => {
  it('counts taxable turnover over the rolling 12 months', () => {
    const p = build([...spread(10, 50, 300), order(50, 400)]) // one order older than a year
    expect(p.rollingTurnover).toBe(500)
    expect(p.orderCount).toBe(10)
  })

  it('ignores refunded and unpaid orders', () => {
    const p = build([order(100, 10), order(100, 10, 'refunded'), order(100, 10, 'pending_payment')])
    expect(p.rollingTurnover).toBe(100)
  })

  it('reports headroom against HMRC’s threshold', () => {
    const p = build(spread(10, 100, 300))
    expect(p.threshold).toBe(90_000)
    expect(p.headroom).toBe(89_000)
    expect(p.mustRegister).toBe(false)
  })

  it('projects the crossing from the run rate over the months we have, not a full year', () => {
    // £6,000 over roughly 3 months is £2,000/month, not £500/month.
    const p = build(spread(60, 100, 90))
    expect(p.monthlyRunRate).toBeGreaterThan(1500)
    expect(p.monthsToThreshold).toBeGreaterThan(0)
    expect(p.projectedCrossing).not.toBeNull()
  })

  it('says registration is compulsory once the threshold is passed', () => {
    const p = build(spread(100, 1000, 300))
    expect(p.rollingTurnover).toBe(100_000)
    expect(p.mustRegister).toBe(true)
    expect(p.verdict.tone).toBe('act')
    expect(p.verdict.headline).toMatch(/compulsory/i)
  })

  it('warns before the threshold rather than at it', () => {
    const p = build(spread(100, 800, 300)) // £80k, ~89% of the way
    expect(p.mustRegister).toBe(false)
    expect(p.verdict.tone).toBe('watch')
  })

  it('is calm well below the threshold', () => {
    expect(build(spread(10, 50, 300)).verdict.tone).toBe('ok')
  })
})

describe('what registering is worth', () => {
  it('shows both sides — what we would reclaim and what we would hand over', () => {
    const p = build(spread(50, 100, 300))
    expect(p.inputVatLost).toBeGreaterThan(0)
    expect(p.outputVatOwed).toBeGreaterThan(0)
    // Output VAT is on the whole price, input only on costs, so it is the bigger.
    expect(p.outputVatOwed).toBeGreaterThan(p.inputVatLost)
  })

  it('finds registering a net COST for a business that makes a margin', () => {
    // This is the whole point: reclaiming input VAT looks attractive and loses.
    const p = build(spread(50, 100, 300))
    expect(p.netCostOfRegistering).toBeGreaterThan(0)
    expect(p.costPerOrder).toBeGreaterThan(0)
    expect(p.verdict.detail).toMatch(/would cost us, not save us/)
  })

  it('finds registering a net GAIN when costs exceed net revenue', () => {
    // Sell at £10 what costs £40 — losing money, so reclaiming beats handing over.
    const losing = spread(20, 10, 300).map((o) => ({
      ...o,
      lines: [{ ...o.lines[0], supplierCost: 40 }],
    }))
    expect(build(losing).netCostOfRegistering).toBeLessThan(0)
  })

  it('says how much prices would have to rise to hold the margin', () => {
    const p = build(spread(50, 100, 300))
    expect(p.repriceFactor).toBeGreaterThan(1)
    // Never more than the VAT rate itself — you only lose VAT on the margin.
    expect(p.repriceFactor).toBeLessThan(1 + PRICING_CONFIG.vat.standardRate)
  })

  it('quotes a reprice that actually restores the contribution', () => {
    // The real invariant, and the one the earlier version of this got wrong by
    // solving the two sides against different delivery assumptions (it came out
    // as a price CUT). Note the rise is BIGGER than the cost per order: raising
    // a price also raises the VAT and card fee on the increment, so it has to be
    // grossed up to net the shortfall.
    const avgOrder = 45
    const shape = { supplierCost: avgOrder * 0.4, grams: 1000, chargeDelivery: false as const }
    const p = build(spread(200, avgOrder, 300))

    const now = unitEconomics({ ...shape, shelfPrice: avgOrder }, unregistered).contribution
    const after = unitEconomics({ ...shape, shelfPrice: avgOrder * p.repriceFactor }, registered).contribution
    expect(after).toBeCloseTo(now, 1)

    // And the rise exceeds the raw per-order cost, for exactly that reason.
    expect(avgOrder * (p.repriceFactor - 1)).toBeGreaterThan(p.costPerOrder)
  })

  it('reads differently once we are actually registered', () => {
    const p = build(spread(50, 100, 300), registered)
    expect(p.registered).toBe(true)
    expect(p.verdict.tone).toBe('ok')
    expect(p.verdict.headline).toMatch(/Registered/)
  })

  it('is all zeroes rather than NaN with no orders at all', () => {
    const p = build([])
    expect(p.rollingTurnover).toBe(0)
    expect(p.netCostOfRegistering).toBe(0)
    expect(p.costPerOrder).toBe(0)
    expect(p.repriceFactor).toBe(1)
    expect(p.pctOfThreshold).toBe(0)
  })
})
