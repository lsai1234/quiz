import {
  applyPassOn,
  applyRemoval,
  applyResolution,
  applySubstitution,
  earliestIncreaseDate,
  lineOverpayment,
  removalWouldBreakPlan,
} from '@/lib/changes/apply'
import { getPricingConfig, resetPricingOverrides, setPricingOverrides } from '@/lib/stack-blueprint/pricing'
import { line, product, subscriptionWith } from './fixtures'

afterEach(() => resetPricingOverrides())

const NOW = new Date('2026-07-29T09:00:00.000Z')
const opts = { now: NOW, event: { id: 'chg_1', kind: 'discontinued' as const } }

describe('substitution never raises the member’s bill', () => {
  it('prices a like-for-like swap at the member’s bundle rate', () => {
    const sub = subscriptionWith([line({ pricePerDelivery: 30 })], { subscriptionDiscountRate: 0.2 })
    const replacement = product({ id: 'whey-b', price: 30, cost: 12 })

    const { subscription, billingChange, absorbedPerDelivery } = applySubstitution(sub, 'l1', replacement, opts)

    expect(subscription.lines[0].productId).toBe('whey-b')
    expect(subscription.lines[0].pricePerDelivery).toBe(24) // £30 less 20%
    expect(subscription.flatMonthly).toBe(24)
    expect(absorbedPerDelivery).toBeUndefined()
    expect(billingChange?.previousMonthly).toBe(30)
    expect(billingChange?.newMonthly).toBe(24)
  })

  it('caps a dearer replacement at what they already pay, and absorbs the rest', () => {
    // Replacement lists at £40; at the 15% bundle rate that's £34 — more than
    // the £30 they signed up for. They asked to keep their plan whole, not to
    // pay more for a swap they didn't choose.
    const sub = subscriptionWith([line({ pricePerDelivery: 30 })])
    const replacement = product({ id: 'whey-dear', price: 40, cost: 12 })

    const { subscription, absorbedPerDelivery } = applySubstitution(sub, 'l1', replacement, opts)

    expect(subscription.lines[0].pricePerDelivery).toBe(30)
    expect(subscription.flatMonthly).toBe(30)
    expect(absorbedPerDelivery).toBe(4)
  })

  it('refuses a swap it could only honour by selling below the margin floor', () => {
    // Cost £28 → floor £32.20, above the £30 the member pays. Capping would
    // lose money on every delivery, so this isn't a viable swap.
    const sub = subscriptionWith([line({ pricePerDelivery: 30 })])
    const replacement = product({ id: 'whey-costly', price: 45, cost: 28 })

    const result = applySubstitution(sub, 'l1', replacement, opts)

    expect(result.rejected).toBe('below-margin-floor')
    expect(result.subscription).toBe(sub) // untouched
    expect(result.billingChange).toBeNull()
  })

  it('takes effect at the next billing cycle, never retroactively', () => {
    const sub = subscriptionWith([line({ pricePerDelivery: 30 })], { dispatchDayOfMonth: 15 })
    const { billingChange } = applySubstitution(sub, 'l1', product({ id: 'whey-b', price: 30 }), opts)
    expect(new Date(billingChange!.effectiveFrom).getTime()).toBeGreaterThan(NOW.getTime())
  })
})

describe('removal we caused', () => {
  it('lowers the monthly and records the change', () => {
    const sub = subscriptionWith([line({ id: 'l1', pricePerDelivery: 30 }), line({ id: 'l2', productId: 'p2', pricePerDelivery: 20 })])
    const { subscription, billingChange } = applyRemoval(sub, 'l1', opts)

    expect(subscription.lines).toHaveLength(1)
    expect(subscription.flatMonthly).toBe(20)
    expect(billingChange).toMatchObject({ previousMonthly: 50, newMonthly: 20, lineId: 'l1', reason: 'discontinued' })
    expect(subscription.billingHistory).toHaveLength(1)
  })

  it('waives the pay-for-what-shipped settlement — the member didn’t cause this', () => {
    // 3 months in, a quarterly line that has shipped once: £45 of goods against
    // £15/mo × 3 = £45 paid. A member-initiated removal could bill a settlement
    // here; a discontinuation must not.
    const l = line({ pricePerDelivery: 45, deliveryIntervalMonths: 3, deliveriesMade: 1 })
    const sub = subscriptionWith([l, line({ id: 'l2', productId: 'p2', pricePerDelivery: 20 })], { monthsActive: 1 })

    const { billingChange } = applyRemoval(sub, 'l1', opts)

    // No settlement field is ever set on an involuntary removal.
    expect(billingChange).not.toHaveProperty('settlement')
    expect(billingChange?.oneOffCredit).toBeUndefined() // paid £15, shipped £45 → nothing owed back
  })

  it('credits value the member paid for but will never receive', () => {
    // 6 months of a quarterly line that only ever shipped once: they've paid
    // £90 towards £45 of goods. The £45 difference goes back to them.
    const l = line({ pricePerDelivery: 45, deliveryIntervalMonths: 3, deliveriesMade: 1 })
    const sub = subscriptionWith([l, line({ id: 'l2', productId: 'p2', pricePerDelivery: 20 })], { monthsActive: 6 })

    expect(lineOverpayment(l, sub)).toBe(45)
    expect(applyRemoval(sub, 'l1', opts).billingChange?.oneOffCredit).toBe(45)
  })

  it('is a no-op when the line has already gone', () => {
    const sub = subscriptionWith([line({ id: 'l1' })])
    expect(applyRemoval(sub, 'nope', opts).rejected).toBe('line-not-found')
  })
})

describe('price pass-on', () => {
  it('never bills an increase inside the notice period', () => {
    setPricingOverrides({ priceChangeNoticeDays: 30 })
    const sub = subscriptionWith([line({ pricePerDelivery: 30 })], { dispatchDayOfMonth: 1 })

    const { billingChange } = applyPassOn(sub, 'l1', 40, { ...opts, config: getPricingConfig() })

    const effective = new Date(billingChange!.effectiveFrom)
    const noticeEnds = new Date(NOW)
    noticeEnds.setDate(noticeEnds.getDate() + 30)
    expect(effective.getTime()).toBeGreaterThanOrEqual(noticeEnds.getTime())
    expect(billingChange?.noticeSentAt).toBe(NOW.toISOString())
    expect(billingChange!.newMonthly).toBeGreaterThan(billingChange!.previousMonthly)
  })

  it('keeps the member’s subscribe-&-save rate through a supplier increase', () => {
    const sub = subscriptionWith([line({ pricePerDelivery: 30 })], { subscriptionDiscountRate: 0.25 })
    const { subscription } = applyPassOn(sub, 'l1', 40, { ...opts, catalogue: [product({ id: 'whey-a', price: 40, cost: 14 })] })
    expect(subscription.lines[0].pricePerDelivery).toBe(30) // £40 less 25%, still above the £16.10 floor
  })

  it('passes a decrease down at the next cycle without a notice period', () => {
    setPricingOverrides({ priceChangeNoticeDays: 30 })
    const sub = subscriptionWith([line({ pricePerDelivery: 30 })], { dispatchDayOfMonth: 15 })
    const { billingChange } = applyPassOn(sub, 'l1', 20, { ...opts, config: getPricingConfig() })

    const noticeEnds = new Date(NOW)
    noticeEnds.setDate(noticeEnds.getDate() + 30)
    expect(new Date(billingChange!.effectiveFrom).getTime()).toBeLessThan(noticeEnds.getTime())
    expect(billingChange?.noticeSentAt).toBeUndefined()
  })

  it('earliestIncreaseDate takes the later of the next cycle and the notice end', () => {
    setPricingOverrides({ priceChangeNoticeDays: 0 })
    const sub = subscriptionWith([line()], { dispatchDayOfMonth: 15 })
    // Notice of 0 days → the next cycle governs.
    expect(earliestIncreaseDate(sub, NOW, getPricingConfig())).toBe(new Date(2026, 7, 15).toISOString())
  })
})

describe('applyResolution dispatch', () => {
  const sub = subscriptionWith([line({ id: 'l1' }), line({ id: 'l2', productId: 'p2' })])

  it('routes each resolution to its handler', () => {
    expect(applyResolution(sub, 'l1', { type: 'remove' }, opts).subscription.lines).toHaveLength(1)
    expect(
      applyResolution(sub, 'l1', { type: 'substitute', replacementProductId: 'whey-b' }, { ...opts, catalogue: [product({ id: 'whey-b', price: 30 })] })
        .subscription.lines[0].productId,
    ).toBe('whey-b')
  })

  it('leaves the plan and the price alone for absorb / dismiss', () => {
    for (const type of ['absorb', 'dismiss'] as const) {
      const result = applyResolution(sub, 'l1', { type }, opts)
      expect(result.rejected).toBe('no-subscription-change')
      expect(result.subscription).toBe(sub)
    }
  })

  it('skips the next box on a hold, banking the credit, without moving the monthly', () => {
    // The honest answer to a temporary outage a founder expects to clear: keep
    // the line, don't send this one, don't charge for what wasn't sent.
    const result = applyResolution(sub, 'l1', { type: 'hold' }, opts)

    expect(result.rejected).toBeUndefined()
    expect(result.billingChange).toBeNull() // recurring price is untouched
    expect(result.subscription.flatMonthly).toBe(sub.flatMonthly)
    expect(result.subscription.lines.find((l) => l.id === 'l1')!.pendingCredit).toBe(30)
  })

  it('reports a hold on a line that has already gone', () => {
    expect(applyResolution(sub, 'ghost', { type: 'hold' }, opts).rejected).toBe('line-not-found')
  })

  it('reports a missing replacement instead of silently doing nothing', () => {
    expect(applyResolution(sub, 'l1', { type: 'substitute', replacementProductId: 'ghost' }, opts).rejected)
      .toBe('replacement-not-found')
  })
})

describe('removalWouldBreakPlan', () => {
  it('is true when it was the last line', () => {
    expect(removalWouldBreakPlan(subscriptionWith([line({ id: 'l1' })]), 'l1')).toBe(true)
  })

  it('is true when what’s left falls under the minimum monthly', () => {
    setPricingOverrides({ minSubscriptionMonthly: 25 })
    const sub = subscriptionWith([line({ id: 'l1', pricePerDelivery: 30 }), line({ id: 'l2', productId: 'p2', pricePerDelivery: 10 })])
    expect(removalWouldBreakPlan(sub, 'l1', getPricingConfig())).toBe(true)
    expect(removalWouldBreakPlan(sub, 'l2', getPricingConfig())).toBe(false)
  })
})

describe('billing history', () => {
  it('accumulates every change in order', () => {
    const sub = subscriptionWith([line({ id: 'l1' }), line({ id: 'l2', productId: 'p2' }), line({ id: 'l3', productId: 'p3' })])
    const first = applyRemoval(sub, 'l1', opts).subscription
    const second = applyRemoval(first, 'l2', opts).subscription
    expect(second.billingHistory).toHaveLength(2)
    expect(second.billingHistory!.map((b) => b.lineId)).toEqual(['l1', 'l2'])
  })
})
