import { compare, reconcile, type StripeView } from '../reconcile'
import { createMockSubscription } from '@/lib/recharge/mock'
import { MOCK_CATALOGUE } from '@/lib/catalogue/mock-catalogue'
import type { MemberSubscription } from '@/lib/recharge/types'

/**
 * The nightly check of our plans against Stripe. What these hold: each kind of
 * disagreement is found and said, agreement says nothing, the plan's day is
 * corrected to Stripe's, and a Stripe outage skips a plan rather than calling
 * it missing.
 */

const plan = (over: Partial<MemberSubscription> = {}): MemberSubscription => ({
  ...createMockSubscription(MOCK_CATALOGUE, 'reconcile@example.com'),
  stripeSubscriptionId: 'sub_r',
  stripeCustomerId: 'cus_r',
  dispatchDayOfMonth: 14,
  ...over,
})
const view = (over: Partial<StripeView> = {}): StripeView => ({ status: 'active', paused: false, monthlyPence: 5000, billingDay: 14, ...over })

describe('one plan against its Stripe subscription', () => {
  it('agrees when status and amount match', () => {
    expect(compare(plan(), view(), 50)).toBeNull()
    expect(compare(plan({ status: 'paused' }), view({ paused: true }), 50)).toBeNull()
    expect(compare(plan({ status: 'cancelled' }), view({ status: 'canceled', monthlyPence: 0 }), 50)).toBeNull()
  })

  it('finds a plan still billing after we cancelled it, and the reverse', () => {
    expect(compare(plan({ status: 'cancelled' }), view(), 50)).toBe('status')
    expect(compare(plan(), view({ status: 'canceled' }), 50)).toBe('status')
    expect(compare(plan({ status: 'paused' }), view(), 50)).toBe('status')
    expect(compare(plan(), view({ paused: true }), 50)).toBe('status')
  })

  it('finds a monthly that differs by more than a penny, and one Stripe has never heard of', () => {
    expect(compare(plan(), view({ monthlyPence: 5001 }), 50)).toBeNull()
    expect(compare(plan(), view({ monthlyPence: 4500 }), 50)).toBe('amount')
    expect(compare(plan(), null, 50)).toBe('missing')
  })
})

describe('the nightly run', () => {
  it('reports what disagrees, fixes the day, and skips what Stripe could not answer', async () => {
    const saved: Array<[string, number]> = []
    const result = await reconcile({
      plans: [
        { userId: 'u-ok', subscription: plan() },
        { userId: 'u-amount', subscription: plan({ stripeSubscriptionId: 'sub_amount' }) },
        { userId: 'u-day', subscription: plan({ stripeSubscriptionId: 'sub_day', dispatchDayOfMonth: 15 }) },
        { userId: 'u-down', subscription: plan({ stripeSubscriptionId: 'sub_down' }) },
        { userId: 'u-mock', subscription: plan({ stripeSubscriptionId: undefined }) },
      ],
      read: async (id) => {
        if (id === 'sub_down') throw new Error('Stripe is down')
        if (id === 'sub_amount') return view({ monthlyPence: 4000 })
        if (id === 'sub_day') return view({ billingDay: 27 })
        return view()
      },
      expectedMonthly: () => 50,
      saveDay: async (userId, _sub, day) => {
        saved.push([userId, day])
      },
      now: new Date('2026-11-24T03:00:00Z'),
    })
    expect(result).toMatchObject({ at: '2026-11-24T03:00:00.000Z', checked: 3, daysFixed: 1, unreachable: 1 })
    expect(result.findings).toEqual([expect.objectContaining({ userId: 'u-amount', kind: 'amount', detail: expect.stringMatching(/£40\.00 a month; the plan is £50\.00/) })])
    expect(saved).toEqual([['u-day', 27]])
  })
})
