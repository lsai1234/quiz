/**
 * The plan saving, one rule everywhere: 13%, 15% or 20% by the plan's size, the
 * quiz's own bands, moving when a change takes a plan into another band.
 */
import { MOCK_CATALOGUE } from '@/lib/catalogue/mock-catalogue'
import { getPricingConfig, discountWithFloor, unitCostOf } from '@/lib/stack-blueprint/pricing'
import { bandFor, listMonthlyOf, nextBand, planBands, planRateChange, rerateLines, withPlanRate } from '../plan-rate'
import { normaliseIncomingSubscription } from '../reprice'
import { addLine, removeLine } from '../mock'
import type { MemberSubscription, MemberSubscriptionLine } from '../types'

const config = getPricingConfig()
const product = (fragment: string) => MOCK_CATALOGUE.find((p) => p.title.includes(fragment))!

/** A plan of these products, each priced at `rate`, one of each, at their sized rhythm. */
function planOf(fragments: [string, number][], rate: number): MemberSubscription {
  const lines: MemberSubscriptionLine[] = fragments.map(([fragment, every], i) => {
    const p = product(fragment)
    const v = p.variants.find((x) => x.available) ?? p.variants[0]
    const unit = discountWithFloor(v.price, rate, unitCostOf(p, v.price, config), config)
    return {
      id: `line-${i}`,
      productId: p.id,
      productTitle: p.title,
      variantTitle: '',
      variantId: v.id,
      slotTitle: p.category,
      stackSlot: p.stackSlots[0],
      quantity: 1,
      deliveryIntervalMonths: every,
      pricePerDelivery: Math.round(unit * 100) / 100,
      swapGroup: p.swapGroup,
      addedAt: '2026-10-01T00:00:00.000Z',
      deliveriesMade: 1,
    } as MemberSubscriptionLine
  })
  return {
    id: 'sub',
    status: 'active',
    customerEmail: 'a@b.c',
    flatMonthly: Math.round(lines.reduce((s, l) => s + l.pricePerDelivery / l.deliveryIntervalMonths, 0) * 100) / 100,
    subscriptionDiscountRate: rate,
    dispatchDayOfMonth: 1,
    minMonths: 1,
    monthsActive: 1,
    startedAt: new Date(2026, 9, 1, 12).toISOString(),
    paymentMethod: null,
    lines,
  }
}

describe('the bands', () => {
  it('are the quiz’s own: 13% to start, 15% from £35 a month, 20% from £55', () => {
    expect(planBands(config).map((b) => [b.level, b.rate, b.from])).toEqual([
      ['complete', 0.2, 55],
      ['performance', 0.15, 35],
      ['essentials', 0.13, 0],
    ])
  })

  it('read a plan’s size at shop prices, at each band’s own saving', () => {
    expect(bandFor(30).rate).toBe(0.13)
    // £40 a month at shop prices is £34 at 15% off: not yet a 15% plan.
    expect(bandFor(40).rate).toBe(0.13)
    expect(bandFor(42).rate).toBe(0.15)
    expect(bandFor(68).rate).toBe(0.15)
    expect(bandFor(70).rate).toBe(0.2)
  })

  it('only ever go up as a plan grows', () => {
    let last = 0
    for (let list = 0; list <= 150; list += 0.5) {
      const rate = bandFor(list).rate
      expect(rate).toBeGreaterThanOrEqual(last)
      last = rate
    }
  })

  it('say how much more reaches the next one', () => {
    const next = nextBand(30)!
    expect(next.band.rate).toBe(0.15)
    expect(next.moreAtShopPrices).toBeCloseTo(35 / 0.85 - 30, 1)
    expect(nextBand(80)).toBeNull()
  })
})

describe('a plan’s saving follows its size', () => {
  it('stays where it is for a change inside the band', () => {
    const plan = planOf([['Whey Protein', 1]], 0.13)
    const next = { ...plan, lines: plan.lines.map((l) => ({ ...l, deliveryIntervalMonths: 1 })) }
    expect(planRateChange(plan, next, MOCK_CATALOGUE)).toBeNull()
    expect(withPlanRate(plan, next, MOCK_CATALOGUE).subscriptionDiscountRate).toBe(0.13)
  })

  it('keeps a quiz depth’s saving on a stack that came in under its band, until a change crosses one', () => {
    // A 15% depth whose stack is small enough to sit in the 13% band.
    const plan = planOf([['Whey Protein', 1]], 0.15)
    const tweaked = { ...plan, lines: plan.lines.map((l) => ({ ...l, deliveryIntervalMonths: 1 })) }
    expect(withPlanRate(plan, tweaked, MOCK_CATALOGUE).subscriptionDiscountRate).toBe(0.15)
  })

  it('goes up when a product takes the plan into the next band, on everything on it', () => {
    const plan = planOf([['Whey Protein', 1]], 0.13)
    const grown = addLine(plan, product('Pre-Workout'), MOCK_CATALOGUE)
    const after = withPlanRate(plan, grown, MOCK_CATALOGUE)
    expect(listMonthlyOf(grown.lines, MOCK_CATALOGUE, 0.13)).toBeGreaterThan(41.2)
    expect(after.subscriptionDiscountRate).toBe(0.15)
    const whey = after.lines.find((l) => l.productId === product('Whey Protein').id)!
    expect(whey.pricePerDelivery).toBeCloseTo(34.99 * 0.85, 1)
    expect(after.flatMonthly).toBeCloseTo(after.lines.reduce((s, l) => s + l.pricePerDelivery / l.deliveryIntervalMonths, 0), 2)
    expect(planRateChange(plan, grown, MOCK_CATALOGUE)).toEqual({ from: 0.13, to: 0.15 })
  })

  it('comes down when a removal takes the plan into a smaller band', () => {
    const plan = planOf([['Whey Protein', 1], ['Pre-Workout', 1]], 0.15)
    const { sub: smaller } = removeLine(plan, plan.lines[1].id)
    const after = withPlanRate(plan, smaller, MOCK_CATALOGUE)
    expect(after.subscriptionDiscountRate).toBe(0.13)
    expect(after.lines[0].pricePerDelivery).toBeCloseTo(34.99 * 0.87, 1)
  })
})

describe('re-pricing a line at a new saving', () => {
  const whey = product('Whey Protein')
  const v = whey.variants.find((x) => x.available) ?? whey.variants[0]
  const line = { productId: whey.id, variantId: v.id, quantity: 1, deliveryIntervalMonths: 1, pricePerDelivery: 30 }

  it('keeps a held price in proportion rather than resetting it to today’s', () => {
    // Held at £30 on a 13% plan (today's 13% price is £30.44).
    const [at15] = rerateLines([line], 0.13, 0.15, MOCK_CATALOGUE)
    expect(at15.pricePerDelivery).toBeCloseTo((30 * 0.85) / 0.87, 2)
  })

  it('never charges more than the fresh price at the new saving, or less than the floor', () => {
    const dear = { ...line, pricePerDelivery: 40 }
    const [capped] = rerateLines([dear], 0.13, 0.15, MOCK_CATALOGUE)
    expect(capped.pricePerDelivery).toBeCloseTo(discountWithFloor(v.price, 0.15, unitCostOf(whey, v.price, config), config), 2)
    const [floored] = rerateLines([line], 0.13, 0.9, MOCK_CATALOGUE)
    expect(floored.pricePerDelivery).toBeCloseTo(discountWithFloor(v.price, 1, unitCostOf(whey, v.price, config), config), 2)
  })
})

describe('on the server', () => {
  it('re-prices the whole plan when a saved change crosses a band, whatever rate the browser sends', () => {
    const plan = planOf([['Whey Protein', 1]], 0.13)
    const grown = { ...addLine(plan, product('Pre-Workout'), MOCK_CATALOGUE), subscriptionDiscountRate: 0.5 }
    const result = normaliseIncomingSubscription(plan, grown, MOCK_CATALOGUE)
    if (!result.ok) throw new Error(result.reason)
    expect(result.subscription.subscriptionDiscountRate).toBe(0.15)
    expect(result.subscription.flatMonthly).toBeCloseTo(withPlanRate(plan, addLine(plan, product('Pre-Workout'), MOCK_CATALOGUE), MOCK_CATALOGUE).flatMonthly, 1)
  })
})
