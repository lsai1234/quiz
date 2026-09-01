import { planComparison, type SubscriptionLine } from '../pricing'
import type { CatalogueProduct } from '@/lib/catalogue/types'

/**
 * The one-off / subscription comparison.
 *
 * The plan chooser put "£65.28" next to "£31.57/mo" and left the reader to
 * subtract them, which says subscribing costs more. It does not — `ladder.ts`
 * enforces that it is cheaper at every rung — but an undated basket and a
 * monthly price are not comparable quantities, so the interface was asserting
 * something false about our own better offer.
 *
 * These pin the figures the new copy quotes at customers, which is the reason
 * they are computed rather than written.
 */

const line = (over: Partial<SubscriptionLine> & { title?: string }): SubscriptionLine => ({
  product: { title: over.title ?? 'Thing', shortName: null } as unknown as CatalogueProduct,
  coversSlotIds: [],
  cadence: 'daily',
  occasionsPerMonth: 30,
  servingsPerUnit: 30,
  usageLevel: 'standard',
  unitsPerShipment: 1,
  shipEveryMonths: 1,
  monthlyUnits: 1,
  variantId: 'v',
  unitPrice: 20,
  unitCost: 8,
  pricePerDelivery: 17,
  monthlyBaseline: 20,
  monthlyPrice: 17,
  ...over,
} as SubscriptionLine)

const opts = {
  oneOffTotal: 65.28,
  subscriptionTotal: 31.57,
  subscriptionFirstMonth: 31.57,
  oneOffDiscountRate: 0.08,
}

describe('the comparison', () => {
  it('says nothing when there is no subscription to compare against', () => {
    expect(planComparison([], opts)).toBeNull()
  })

  /**
   * The whole point. A basket whose shortest pack is a 30-day multivitamin runs
   * out in a month, however long the probiotic beside it lasts — and "one-off"
   * printed with no duration is what made the comparison dishonest.
   */
  it('finds how long the basket actually lasts, and what ends it', () => {
    const c = planComparison(
      [
        line({ title: 'Multivitamin', monthlyUnits: 1 }),
        line({ title: 'Probiotic-10', monthlyUnits: 1 / 3 }),
        line({ title: 'Omega 3', monthlyUnits: 1 / 4 }),
      ],
      opts,
    )!
    expect(c.runsOutMonths).toBe(1)
    expect(c.firstToRunOut).toBe('Multivitamin')
    expect(c.lastsMonths).toBe(4)
    expect(c.longestLasting).toBe('Omega 3')
  })

  it('prices a month of the same supply at our own one-off rate', () => {
    // Two products at £20 undiscounted a month, less the 8% bundle rate.
    const c = planComparison([line({ monthlyBaseline: 20 }), line({ monthlyBaseline: 20 })], opts)!
    expect(c.oneOffPerMonth).toBe(36.8)
    // Quoting the "buy it yourself" column at list would inflate our own saving.
    expect(c.oneOffPerMonth).toBeLessThan(40)
  })

  it('reports the per-month saving in the direction that is true', () => {
    const c = planComparison([line({ monthlyBaseline: 40 })], { ...opts, subscriptionTotal: 34 })!
    expect(c.oneOffPerMonth).toBe(36.8)
    expect(c.perMonthSaving).toBeCloseTo(2.8, 2)
    expect(c.perMonthSaving).toBeGreaterThan(0)
  })

  /**
   * Jack's case, and the reason this is computed per stack rather than written
   * once. A heavy protein user gets TWO tubs in month one where the one-off
   * bought one — still cheaper per unit, but "the same box for less" would be a
   * lie the reader can check by counting the tubs.
   */
  it('knows when month one is not the same box', () => {
    const same = planComparison([line({}), line({})], opts)!
    expect(same.firstDeliveryIdentical).toBe(true)

    const bigger = planComparison(
      [line({ title: 'Whey', unitsPerShipment: 2, monthlyUnits: 2 }), line({})],
      opts,
    )!
    expect(bigger.firstDeliveryIdentical).toBe(false)
  })

  it('carries both first-delivery figures so the copy never subtracts them itself', () => {
    const c = planComparison([line({})], opts)!
    expect(c.oneOffToday).toBe(65.28)
    expect(c.subscriptionToday).toBe(31.57)
    expect(c.firstDeliverySaving).toBe(33.71)
  })

  it('uses the first month, not the ongoing month, for what you pay today', () => {
    // An intro discount makes the first payment lower, and the first-delivery
    // line is about today.
    const c = planComparison([line({})], { ...opts, subscriptionFirstMonth: 25 })!
    expect(c.subscriptionToday).toBe(25)
    expect(c.firstDeliverySaving).toBe(40.28)
  })

  it('trims a supplier title down to something that fits in a sentence', () => {
    const c = planComparison(
      [line({ title: 'Super Strong Omega 3, 500 EPA / 250 DHA, 120 caps', monthlyUnits: 0.25 })],
      opts,
    )!
    expect(c.longestLasting).toBe('Super Strong Omega 3')
  })

  it('survives a line that is never consumed rather than dividing by zero', () => {
    const c = planComparison([line({ monthlyUnits: 0 }), line({ monthlyUnits: 1 })], opts)!
    expect(Number.isFinite(c.runsOutMonths)).toBe(true)
    expect(c.runsOutMonths).toBe(1)
  })
})
