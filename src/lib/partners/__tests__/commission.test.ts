/**
 * What a partner earns on one order, and the guard that stops the commission
 * being what turns an order into a loss.
 */
import {
  commissionFor,
  confirmAfterFor,
  contributionOf,
  kindForOrder,
  netBasisOf,
  renewalEarns,
} from '@/lib/partners/commission'
import { PRICING_CONFIG, type PricingConfig } from '@/lib/stack-blueprint/pricing'
import type { Order, OrderLine } from '@/lib/orders/types'

const cfg = (over: Partial<PricingConfig> = {}): PricingConfig => ({ ...PRICING_CONFIG, ...over })

function order(lines: Partial<OrderLine>[], subtotal?: number): Pick<Order, 'lines' | 'subtotal'> {
  const full = lines.map((l, i) => ({
    sku: `sku-${i}`,
    productId: `p${i}`,
    title: 'Thing',
    quantity: 1,
    unitPrice: 30,
    supplierCost: 15,
    ...l,
  })) as OrderLine[]
  return { lines: full, subtotal: subtotal ?? full.reduce((s, l) => s + l.unitPrice * l.quantity, 0) }
}

describe('the basis a rate is applied to', () => {
  it('is net revenue, never gross', () => {
    // Up to a fifth of a gross price is HMRC's money, and paying partners out of
    // the VAT account is not a mistake anyone notices quickly.
    const o = order([{ unitPrice: 120 }])
    const net = netBasisOf(o, cfg({ vat: { ...PRICING_CONFIG.vat, registered: true, standardRate: 0.2 } }))
    expect(net).toBe(100)
  })

  it('is the shelf price when we are not VAT-registered', () => {
    const o = order([{ unitPrice: 120 }])
    expect(netBasisOf(o, cfg({ vat: { ...PRICING_CONFIG.vat, registered: false } }))).toBe(120)
  })
})

describe('what an order actually makes', () => {
  it('counts the whole parcel’s delivery, not a fraction of it', () => {
    // The order IS the parcel. Apportioning it across the lines would all but
    // erase the delivery cost — on a three-item box, £7.87 becomes £0.13.
    const three = contributionOf(order([{}, {}, {}]), cfg())
    const one = contributionOf(order([{ unitPrice: 90, supplierCost: 45 }]), cfg())
    // Same money, same goods, same parcel — so within rounding, the same answer.
    expect(Math.abs(three - one)).toBeLessThan(1)
  })

  it('does not treat a line with no cost on file as free', () => {
    // An order that looked costless would let the guard wave through a
    // commission the margin cannot carry.
    const costed = contributionOf(order([{ supplierCost: 15 }]), cfg())
    const uncosted = contributionOf(order([{ supplierCost: null }]), cfg())
    expect(uncosted).toBeLessThan(30)
    expect(Math.abs(uncosted - costed)).toBeLessThan(15)
  })
})

describe('the contribution guard', () => {
  it('pays the plain rate when the order can afford it', () => {
    const full = order([{ unitPrice: 90, supplierCost: 20 }])
    const calc = commissionFor(full, 0.15, cfg())
    expect(calc.capped).toBe(false)
    expect(calc.amount).toBe(calc.uncapped)
  })

  it('caps the payment at a share of what the order made', () => {
    // A deeply discounted order: net revenue and contribution come apart, and
    // 15% of net exceeds the whole margin. Without this the difference comes
    // out of our own pocket with nothing to say so.
    // £60 sold at a £40 cost keeps £5.63 once delivery, card fees and the
    // returns provision are out — while 15% of net is £9.00. Still more than
    // the order made.
    //
    // That £5.74 was £2.72 while free delivery started at £60: this exact order
    // sat on the threshold and shipped free, and we carried the £7.80 parcel.
    // Under the customer rate ladder it pays £2.95 and the free line moved to
    // £100, so the same order now keeps £3.02 more — £2.95 of postage plus the
    // Highlands surcharge blended over the orders that pay one. The cap still
    // binds — the guard is doing its job either way — it just binds less hard.
    const thin = order([{ unitPrice: 60, supplierCost: 40 }])
    const calc = commissionFor(thin, 0.15, cfg())

    expect(calc.contribution).toBeGreaterThan(0)
    expect(calc.uncapped).toBeGreaterThan(calc.contribution)
    expect(calc.capped).toBe(true)
    expect(calc.amount).toBe(5.45) // 95% of £5.74
    expect(calc.amount).toBeLessThanOrEqual(calc.contribution * PRICING_CONFIG.partners.maxShareOfContribution + 0.01)
  })

  it('pays nothing on an order that was already losing money', () => {
    // Not the guard rescuing a bad order — the deepest stacked rung is a known
    // acquisition cost (D2). It is refusing to make it worse.
    const losing = order([{ unitPrice: 20, supplierCost: 15 }])
    const calc = commissionFor(losing, 0.15, cfg())
    expect(calc.contribution).toBeLessThan(0)
    expect(calc.amount).toBe(0)
  })

  it('never pays out more than the order made, at any rate', () => {
    const o = order([{ unitPrice: 40, supplierCost: 20 }])
    for (const rate of [0.05, 0.15, 0.3, 0.9, 1]) {
      const calc = commissionFor(o, rate, cfg())
      expect(calc.amount).toBeLessThanOrEqual(Math.max(0, calc.contribution))
    }
  })

  it('reads a nonsense rate as nothing rather than guessing', () => {
    const o = order([{ unitPrice: 90, supplierCost: 20 }])
    expect(commissionFor(o, Number.NaN, cfg()).amount).toBe(0)
    expect(commissionFor(o, -1, cfg()).amount).toBe(0)
    // Above 1 is clamped, not multiplied out.
    expect(commissionFor(o, 5, cfg()).rate).toBe(1)
  })
})

describe('the return window', () => {
  it('sets confirmation 14 days after the order', () => {
    const at = confirmAfterFor('2026-08-01T00:00:00.000Z', cfg())
    expect(at).toBe('2026-08-15T00:00:00.000Z')
  })

  it('follows the configured window rather than a hard-coded fortnight', () => {
    const long = cfg({ partners: { ...PRICING_CONFIG.partners, confirmAfterDays: 30 } })
    expect(confirmAfterFor('2026-08-01T00:00:00.000Z', long)).toBe('2026-08-31T00:00:00.000Z')
  })
})

describe('how long renewals earn', () => {
  it('earns inside the window from SIGNUP, not from the order', () => {
    // A property of the relationship, so a delayed delivery cannot extend it.
    expect(renewalEarns('2026-01-15T00:00:00.000Z', '2026-05-15T00:00:00.000Z', 6)).toBe(true)
    expect(renewalEarns('2026-01-15T00:00:00.000Z', '2026-07-14T00:00:00.000Z', 6)).toBe(true)
  })

  it('stops earning past it', () => {
    expect(renewalEarns('2026-01-15T00:00:00.000Z', '2026-08-15T00:00:00.000Z', 6)).toBe(false)
  })

  it('refuses a date it cannot read rather than paying on a guess', () => {
    expect(renewalEarns('not a date', '2026-05-15T00:00:00.000Z', 6)).toBe(false)
  })
})

describe('which rate an order earns', () => {
  it('is the first-order rate for anything bought once', () => {
    // A shop order has no renewal behind it, so it is always a first.
    expect(kindForOrder({ channel: 'shop' }, false)).toBe('first')
    expect(kindForOrder({ channel: 'quiz' }, false)).toBe('first')
  })

  it('splits a subscription into its first box and its renewals', () => {
    expect(kindForOrder({ channel: 'subscription' }, true)).toBe('first')
    expect(kindForOrder({ channel: 'subscription' }, false)).toBe('renewal')
  })
})
