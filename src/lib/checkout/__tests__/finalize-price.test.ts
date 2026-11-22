/**
 * Quiz and bundle plans are priced in the browser. The server holds them to
 * our own prices: no lower than every line at the deepest saving we offer,
 * and no lower than the monthly minimum (`assertPlanPrice`).
 */
import { finalizeCheckout, assertPlanPrice, PlanPriceRefused } from '../finalize'
import { createUser } from '@/lib/db/users'
import { getSubscription } from '@/lib/db/hub-data'
import { buildMemberSubscription } from '@/lib/recharge/mock'
import { MOCK_BLUEPRINT } from '@/lib/stack-blueprint/mock-blueprint'
import { getResolvedCatalogue } from '@/lib/catalogue/resolve'
import { TERMS_VERSION, DISCLAIMER_VERSION } from '@/lib/legal/content'
import type { MemberSubscription } from '@/lib/recharge/types'

jest.mock('@/lib/payments/stripe', () => ({ createSubscriptionSession: jest.fn() }))

const consent = { accepted: true, termsVersion: TERMS_VERSION, disclaimerVersion: DISCLAIMER_VERSION }

async function realPlan(level?: 'essentials' | 'performance' | 'complete'): Promise<MemberSubscription> {
  const { products } = await getResolvedCatalogue()
  return buildMemberSubscription(MOCK_BLUEPRINT, products, '', null, { level, id: `sub-${level ?? 'x'}` })
}

describe('a browser-priced plan', () => {
  it('passes at the price the quiz worked out, at every depth', async () => {
    for (const level of ['essentials', 'performance', 'complete'] as const) {
      await expect(assertPlanPrice(await realPlan(level))).resolves.toBeUndefined()
    }
  })

  it('is refused at a price we never sell it for, and nothing is stored', async () => {
    const user = await createUser({ email: 'penny@example.com', passwordHash: 'h' })
    const plan = { ...(await realPlan()), flatMonthly: 0.01 }
    await expect(finalizeCheckout(user.id, user.email, { subscription: plan, consent })).rejects.toBeInstanceOf(PlanPriceRefused)
    expect(await getSubscription(user.id)).toBeNull()
  })

  it('is refused when a delivery gap is stretched to shrink the monthly', async () => {
    const plan = await realPlan()
    const line = plan.lines[0]
    const stretched: MemberSubscription = {
      ...plan,
      lines: [{ ...line, deliveryIntervalMonths: 12 }],
      flatMonthly: Math.round((line.pricePerDelivery / 12) * 100) / 100,
    }
    await expect(assertPlanPrice(stretched)).rejects.toBeInstanceOf(PlanPriceRefused)
  })

  it('is refused under the monthly minimum, so nobody gets a plan (or the hub) for less', async () => {
    const plan = { ...(await realPlan()), lines: [], flatMonthly: 5 }
    await expect(assertPlanPrice(plan)).rejects.toThrow(/start at £10 a month/)
  })

  it('leaves products it doesn’t sell to the checks that handle them', async () => {
    const plan = { ...(await realPlan()), lines: [{ ...(await realPlan()).lines[0], productId: 'not-in-the-catalogue' }], flatMonthly: 42 }
    await expect(assertPlanPrice(plan)).resolves.toBeUndefined()
  })
})
