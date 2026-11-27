/**
 * A shop basket bought every month, through the quiz plan's checkout. Runs
 * against the in-memory DB in mock payments, like `finalize.test.ts`.
 */
import { finalizeCheckout, ShopPlanRefused } from '../finalize'
import { buildShopPlan } from '../shop-plan'
import type { CheckoutPayload } from '../types'
import { createUser } from '@/lib/db/users'
import { getSubscription, getQuiz } from '@/lib/db/hub-data'
import { getResolvedCatalogue } from '@/lib/catalogue/resolve'
import { hubAccessFrom } from '@/lib/hub/access'
import { TERMS_VERSION, DISCLAIMER_VERSION } from '@/lib/legal/content'
import { setPortalPricingOverrides, resetPortalPricing } from '@/lib/portal/store'
import type { MemberSubscription } from '@/lib/recharge/types'

const mockCreateSubscriptionSession = jest.fn()
jest.mock('@/lib/payments/stripe', () => ({
  createSubscriptionSession: (...args: unknown[]) => mockCreateSubscriptionSession(...args),
}))

const consent = { accepted: true, termsVersion: TERMS_VERSION, disclaimerVersion: DISCLAIMER_VERSION }

const stripeEnv = { PAYMENTS_SOURCE: process.env.PAYMENTS_SOURCE, STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY }
afterEach(async () => {
  await resetPortalPricing()
  process.env.PAYMENTS_SOURCE = stripeEnv.PAYMENTS_SOURCE
  process.env.STRIPE_SECRET_KEY = stripeEnv.STRIPE_SECRET_KEY
})

async function basket(count = 2) {
  const { products } = await getResolvedCatalogue()
  return products
    .filter((p) => p.variants.some((v) => v.available))
    .sort((a, b) => b.variants[0].price - a.variants[0].price)
    .slice(0, count)
    .map((p) => ({ productId: p.id, variantId: p.variants.find((v) => v.available)!.id, quantity: 1 }))
}

/** What the browser might send: a plan that claims to cost a penny. */
const tampered = { id: 'evil', flatMonthly: 0.01, firstMonth: 0.01, lines: [] } as unknown as MemberSubscription

describe('a monthly shop basket at checkout', () => {
  it('is priced from the catalogue, whatever plan the browser sent', async () => {
    const user = await createUser({ email: 'monthly@example.com', passwordHash: 'h' })
    const lines = await basket()
    const { products } = await getResolvedCatalogue()
    const expected = buildShopPlan(lines, products)
    expect(expected.ok).toBe(true)
    if (!expected.ok) return

    const result = await finalizeCheckout(user.id, user.email, { subscription: tampered, shop: { lines }, consent } as CheckoutPayload)
    expect(result.checkoutUrl).toBe('#mock-subscription')

    const stored = await getSubscription(user.id)
    expect(stored?.flatMonthly).toBeCloseTo(expected.monthly, 2)
    expect(stored?.firstMonth).toBeCloseTo(expected.monthly, 2)
    expect(stored?.subscriptionDiscountRate).toBe(expected.rate)
    expect(stored?.subscriptionDiscountRate).toBeGreaterThan(0)
    expect(stored?.lines.map((l) => l.productId)).toEqual(lines.map((l) => l.productId))
    expect(stored?.customerEmail).toBe('monthly@example.com')
  })

  it('carries no quiz, no gift, and nothing personal into the guide', async () => {
    const user = await createUser({ email: 'noquiz@example.com', passwordHash: 'h' })
    await finalizeCheckout(user.id, user.email, {
      subscription: tampered,
      shop: { lines: await basket() },
      consent,
      quiz: { answers: { name: 'Mallory' } } as unknown as CheckoutPayload['quiz'],
      bonus: { productId: 'x', level: 'performance' },
    } as CheckoutPayload)
    expect(await getQuiz(user.id)).toBeNull()
    const stored = await getSubscription(user.id)
    expect(stored?.bonus ?? null).toBeNull()
    // Every order gets the stack guide; a shop plan's knows nothing about them.
    expect(stored?.guideSeed?.firstName ?? null).toBeNull()
    expect(stored?.guideSeed?.goals ?? []).toEqual([])
  })

  it('opens the member hub, as any plan does', async () => {
    const user = await createUser({ email: 'hub@example.com', passwordHash: 'h' })
    await finalizeCheckout(user.id, user.email, { subscription: tampered, shop: { lines: await basket() }, consent } as CheckoutPayload)
    const stored = await getSubscription(user.id)
    const access = hubAccessFrom({ plan: stored ? { status: stored.status as 'active' } : null, latestOrderAt: null, now: new Date() })
    expect(access.state).toBe('subscriber')
  })

  it('refuses a basket under the monthly minimum, before anything is stored', async () => {
    const user = await createUser({ email: 'small@example.com', passwordHash: 'h' })
    await setPortalPricingOverrides({ minSubscriptionMonthly: 100_000 })
    await expect(
      finalizeCheckout(user.id, user.email, { subscription: tampered, shop: { lines: await basket(1) }, consent } as CheckoutPayload),
    ).rejects.toBeInstanceOf(ShopPlanRefused)
    expect(await getSubscription(user.id)).toBeNull()
  })

  it('refuses a product that is no longer sold', async () => {
    const user = await createUser({ email: 'gone@example.com', passwordHash: 'h' })
    const lines = await basket(1)
    await expect(
      finalizeCheckout(user.id, user.email, { subscription: tampered, shop: { lines: [{ ...lines[0], variantId: 'gone' }] }, consent } as CheckoutPayload),
    ).rejects.toMatchObject({ name: 'ShopPlanRefused', reason: 'unavailable' })
  })

  it('still asks for consent first', async () => {
    const user = await createUser({ email: 'noconsent@example.com', passwordHash: 'h' })
    await expect(
      finalizeCheckout(user.id, user.email, { subscription: tampered, shop: { lines: await basket() } } as CheckoutPayload),
    ).rejects.toMatchObject({ name: 'CheckoutRejected' })
  })

  it('bills Stripe the catalogue price, tagged as a shop plan', async () => {
    process.env.PAYMENTS_SOURCE = 'stripe'
    process.env.STRIPE_SECRET_KEY = 'sk_test_x'
    mockCreateSubscriptionSession.mockResolvedValueOnce({ id: 'cs_1', url: 'https://checkout.stripe.test/cs_1' })
    const user = await createUser({ email: 'live@example.com', passwordHash: 'h' })
    const lines = await basket()
    const { products } = await getResolvedCatalogue()
    const expected = buildShopPlan(lines, products)
    const result = await finalizeCheckout(user.id, user.email, { subscription: tampered, shop: { lines }, consent } as CheckoutPayload, 'https://shop.test')
    expect(result.checkoutUrl).toBe('https://checkout.stripe.test/cs_1')
    const args = mockCreateSubscriptionSession.mock.calls.at(-1)?.[0]
    expect(expected.ok && args.monthlyTotal).toBeCloseTo(expected.ok ? expected.monthly : 0, 2)
    expect(args.introDiscountRate).toBe(0)
    expect(args.metadata).toEqual({ userId: user.id, source: 'shop' })
  })
})

/**
 * One plan per account. A second checkout used to overwrite the stored plan
 * while the first Stripe subscription went on billing; a live plan is now
 * changed from the hub instead.
 */
describe('a member who already has a plan', () => {
  it('can’t start a second one while Stripe bills the first, and their plan is untouched', async () => {
    const { PlanAlreadyExists } = await import('../finalize')
    const { saveSubscription } = await import('@/lib/db/hub-data')
    const { createMockSubscription } = await import('@/lib/recharge/mock')
    const user = await createUser({ email: 'two-plans@example.com', passwordHash: 'h' })
    const { products } = await getResolvedCatalogue()
    const live = { ...createMockSubscription(products, user.email), stripeSubscriptionId: 'sub_live', stripeCustomerId: 'cus_live' }
    await saveSubscription(user.id, live)

    await expect(finalizeCheckout(user.id, user.email, { subscription: tampered, shop: { lines: await basket() }, consent } as CheckoutPayload)).rejects.toBeInstanceOf(PlanAlreadyExists)
    expect((await getSubscription(user.id))?.stripeSubscriptionId).toBe('sub_live')
    expect((await getSubscription(user.id))?.lines.map((l) => l.id)).toEqual(live.lines.map((l) => l.id))

    // Paused is still theirs; ended is not.
    await saveSubscription(user.id, { ...live, status: 'paused' })
    await expect(finalizeCheckout(user.id, user.email, { subscription: tampered, shop: { lines: await basket() }, consent } as CheckoutPayload)).rejects.toBeInstanceOf(PlanAlreadyExists)
    await saveSubscription(user.id, { ...live, status: 'cancelled' })
    await expect(finalizeCheckout(user.id, user.email, { subscription: tampered, shop: { lines: await basket() }, consent } as CheckoutPayload)).resolves.toMatchObject({ checkoutUrl: '#mock-subscription' })
  })

  it('still replaces a plan Stripe has never heard of (the demo)', async () => {
    const { saveSubscription } = await import('@/lib/db/hub-data')
    const { createMockSubscription } = await import('@/lib/recharge/mock')
    const user = await createUser({ email: 'demo-then-real@example.com', passwordHash: 'h' })
    const { products } = await getResolvedCatalogue()
    await saveSubscription(user.id, createMockSubscription(products, user.email))
    await expect(finalizeCheckout(user.id, user.email, { subscription: tampered, shop: { lines: await basket() }, consent } as CheckoutPayload)).resolves.toMatchObject({ checkoutUrl: '#mock-subscription' })
  })
})
