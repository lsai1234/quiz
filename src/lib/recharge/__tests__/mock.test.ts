import {
  createMockSubscription,
  nextDispatchDate,
  setDispatchDay,
  pauseSubscription,
  resumeSubscription,
  cancelSubscription,
  canCancel,
  monthsRemainingOnTerm,
  swapSubscriptionLine,
  swappableForLine,
  flatMonthlyOf,
  computeSwapImpact,
} from '../mock'
import { MOCK_CATALOGUE } from '@/lib/catalogue/mock-catalogue'

const sub = () => createMockSubscription(MOCK_CATALOGUE, 'test@example.com')

describe('createMockSubscription', () => {
  it('builds an active subscription with lines and a flat monthly price', () => {
    const s = sub()
    expect(s.status).toBe('active')
    expect(s.customerEmail).toBe('test@example.com')
    expect(s.lines.length).toBeGreaterThan(0)
    expect(s.flatMonthly).toBeGreaterThan(0)
    expect(s.minMonths).toBeGreaterThanOrEqual(1)
  })

  it('flatMonthly equals the summed amortised line prices', () => {
    const s = sub()
    expect(s.flatMonthly).toBeCloseTo(flatMonthlyOf(s.lines), 1)
  })
})

describe('nextDispatchDate', () => {
  it('returns the next occurrence of the chosen day', () => {
    const from = new Date('2026-06-10')
    expect(nextDispatchDate(15, from).getDate()).toBe(15) // later this month
    expect(nextDispatchDate(5, from).getMonth()).toBe(from.getMonth() + 1) // already passed → next month
  })

  it('caps the day at 28', () => {
    expect(nextDispatchDate(31, new Date('2026-06-01')).getDate()).toBe(28)
  })
})

describe('dispatch day + pause/resume', () => {
  it('updates the dispatch day (clamped 1–28)', () => {
    expect(setDispatchDay(sub(), 20).dispatchDayOfMonth).toBe(20)
    expect(setDispatchDay(sub(), 40).dispatchDayOfMonth).toBe(28)
  })

  it('pauses (once past the minimum term) and resumes', () => {
    const eligible = { ...sub(), minMonths: 4, monthsActive: 4 }
    const paused = pauseSubscription(eligible)
    expect(paused.status).toBe('paused')
    expect(resumeSubscription(paused).status).toBe('active')
  })

  it('blocks pause during the minimum term', () => {
    const s = { ...sub(), minMonths: 4, monthsActive: 2 }
    expect(pauseSubscription(s).status).toBe('active')
  })
})

describe('minimum-term cancel guard', () => {
  it('blocks cancel before the minimum term and reports months left', () => {
    const s = { ...sub(), minMonths: 4, monthsActive: 2 }
    expect(monthsRemainingOnTerm(s)).toBe(2)
    expect(canCancel(s)).toBe(false)
    expect(cancelSubscription(s).status).toBe('active') // unchanged
  })

  it('allows cancel once the minimum term is met', () => {
    const s = { ...sub(), minMonths: 4, monthsActive: 4 }
    expect(canCancel(s)).toBe(true)
    expect(cancelSubscription(s).status).toBe('cancelled')
  })
})

describe('swapSubscriptionLine', () => {
  it('replaces a line with a same-group product and re-prices the flat monthly', () => {
    const s = sub()
    const line = s.lines[0]
    const alternatives = swappableForLine(line, MOCK_CATALOGUE)
    expect(alternatives.length).toBeGreaterThan(0)

    const swapped = swapSubscriptionLine(s, line.id, alternatives[0])
    const newLine = swapped.lines.find((l) => l.id === line.id)!
    expect(newLine.productId).toBe(alternatives[0].id)
    expect(swapped.flatMonthly).toBeCloseTo(flatMonthlyOf(swapped.lines), 1)
  })

  it('only offers eligible, same-slot, non-refill products', () => {
    const s = sub()
    for (const alt of swappableForLine(s.lines[0], MOCK_CATALOGUE)) {
      expect(alt.stackSlots).toContain(s.lines[0].stackSlot)
      expect(alt.isSubscriptionOnly).toBeFalsy()
      expect(alt.subscriptionEligible).toBe(true)
    }
  })
})

describe('computeSwapImpact', () => {
  it('reports the monthly change, one-off and effective date for a swap', () => {
    const s = sub()
    const line = s.lines[0]
    const alt = swappableForLine(line, MOCK_CATALOGUE)[0]
    const impact = computeSwapImpact(s, line.id, alt)

    expect(impact.currentMonthly).toBe(s.flatMonthly)
    expect(impact.newMonthly).toBe(swapSubscriptionLine(s, line.id, alt).flatMonthly)
    expect(impact.monthlyDelta).toBeCloseTo(impact.newMonthly - impact.currentMonthly, 2)
    // one-off equals the per-delivery price difference for the imminent box
    const newPpd = swapSubscriptionLine(s, line.id, alt).lines.find((l) => l.id === line.id)!.pricePerDelivery
    expect(impact.oneOffNow).toBeCloseTo(newPpd - line.pricePerDelivery, 2)
    expect(new Date(impact.effectiveFrom).getTime()).toBeGreaterThan(0)
  })
})
