import { billingDayOf, billingDayOfAnchor, billingDayPhrase, dayInMonth, nextPlanDate } from '../billing-day'
import { buildMemberSubscription, nextDispatchDate } from '../mock'
import { buildShopPlan } from '@/lib/checkout/shop-plan'
import { MOCK_BLUEPRINT } from '@/lib/stack-blueprint/mock-blueprint'
import { MOCK_CATALOGUE } from '@/lib/catalogue'
import { getPricingConfig } from '@/lib/stack-blueprint/pricing'

/**
 * A plan's day is the day Stripe bills it: the day it was bought. These hold the
 * parts of that which are easy to get wrong: UK days rather than UTC ones, and
 * the 29th–31st in a shorter month.
 */
describe('the plan’s day', () => {
  it('is the UK day of the moment, not the UTC one', () => {
    // 23:30 UTC on 14 June is 00:30 on the 15th in London (summer time).
    expect(billingDayOf(new Date('2026-06-14T23:30:00Z'))).toBe(15)
    // In winter London is on UTC.
    expect(billingDayOf(new Date('2026-01-14T23:30:00Z'))).toBe(14)
    expect(billingDayOfAnchor(Date.parse('2026-03-03T10:00:00Z') / 1000)).toBe(3)
  })

  it('falls on a shorter month’s last day, as Stripe bills a plan started late in a month', () => {
    expect(dayInMonth(31, 2026, 1).getDate()).toBe(28) // February
    expect(dayInMonth(31, 2028, 1).getDate()).toBe(29) // a leap February
    expect(dayInMonth(31, 2026, 3).getDate()).toBe(30) // April
    expect(dayInMonth(31, 2026, 4).getDate()).toBe(31) // May
    expect(dayInMonth(14, 2026, 1).getDate()).toBe(14)
  })

  it('comes round next month once this month’s has passed', () => {
    const from = new Date(2026, 10, 23, 12) // 23 November
    expect(nextPlanDate(25, from)).toEqual(new Date(2026, 10, 25))
    expect(nextPlanDate(14, from)).toEqual(new Date(2026, 11, 14))
    expect(nextPlanDate(31, new Date(2027, 0, 31, 12))).toEqual(new Date(2027, 1, 28))
    // Across the year end.
    expect(nextPlanDate(5, new Date(2026, 11, 20))).toEqual(new Date(2027, 0, 5))
    expect(nextDispatchDate(30, new Date(2026, 3, 30, 9))).toEqual(new Date(2026, 4, 30))
  })

  it('says a late day honestly', () => {
    expect(billingDayPhrase(14)).toBe('the 14th')
    expect(billingDayPhrase(1)).toBe('the 1st')
    expect(billingDayPhrase(22)).toBe('the 22nd')
    expect(billingDayPhrase(23)).toBe('the 23rd')
    expect(billingDayPhrase(11)).toBe('the 11th')
    expect(billingDayPhrase(31)).toMatch(/^the 31st \(or the last day of a shorter month\)$/)
  })
})

describe('a new plan', () => {
  it('starts on the day it is made, not the 15th', () => {
    const sub = buildMemberSubscription(MOCK_BLUEPRINT, MOCK_CATALOGUE, 'day@example.com')
    expect(sub.dispatchDayOfMonth).toBe(billingDayOf(new Date(sub.startedAt)))
  })

  it('from the shop, starts on the day it is bought', () => {
    const product = MOCK_CATALOGUE.find((p) => p.variants.some((v) => v.available) && p.basePrice >= 12)!
    const variant = product.variants.find((v) => v.available)!
    const now = new Date('2026-07-09T10:00:00Z')
    const plan = buildShopPlan([{ productId: product.id, variantId: variant.id, quantity: 1 }], MOCK_CATALOGUE, getPricingConfig(), now)
    expect(plan.ok && plan.subscription.dispatchDayOfMonth).toBe(9)
  })
})
