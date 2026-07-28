/**
 * Checkout finalize — persists the member's bundle + quiz to their account and
 * returns a payment URL (mock mode returns a placeholder). Runs against the
 * in-memory DB.
 */
import { finalizeCheckout, claimIntroDiscount } from '../finalize'
import type { CheckoutPayload } from '../types'
import { createUser } from '@/lib/db/users'
import { getSubscription, getQuiz } from '@/lib/db/hub-data'
import type { MemberSubscription } from '@/lib/recharge/types'
import type { QuizAnswers } from '@/lib/types'

const subscription = {
  id: 'sub-x',
  status: 'active',
  customerEmail: '',
  flatMonthly: 42,
  dispatchDayOfMonth: 15,
  minMonths: 1,
  monthsActive: 0,
  startedAt: new Date().toISOString(),
  paymentMethod: null,
  lines: [{ id: 'l1', productId: 'p1', productTitle: 'Whey' }],
} as unknown as MemberSubscription

describe('finalizeCheckout', () => {
  it('saves the bundle + quiz to the account and returns a mock payment URL', async () => {
    const user = await createUser({ email: 'buyer@example.com', passwordHash: 'h' })
    const payload: CheckoutPayload = {
      subscription,
      quiz: { answers: { name: 'Sam', goals: ['muscle'] } as unknown as QuizAnswers },
      lines: [],
    }

    const result = await finalizeCheckout(user.id, user.email, payload)
    expect(result.mock).toBe(true)
    expect(result.checkoutUrl).toBe('#mock-subscription')

    const stored = await getSubscription(user.id)
    expect(stored?.id).toBe('sub-x')
    // The account's real email is stamped onto the stored subscription.
    expect(stored?.customerEmail).toBe('buyer@example.com')

    const quiz = await getQuiz<{ answers: { name: string } }>(user.id)
    expect(quiz?.answers.name).toBe('Sam')
  })

  it('banks the revealed scratch discount onto the stored subscription', async () => {
    const user = await createUser({ email: 'lucky@example.com', passwordHash: 'h' })
    await finalizeCheckout(user.id, user.email, {
      subscription: { ...subscription, introDiscountRate: 0.5 },
      lines: [],
    })

    const stored = await getSubscription(user.id)
    expect(stored?.introDiscountRate).toBe(0.5)
    expect(stored?.firstMonth).toBe(21) // 42 × 0.5
  })

  it('refuses a discount the client made up, without failing the checkout', async () => {
    const user = await createUser({ email: 'chancer@example.com', passwordHash: 'h' })
    const result = await finalizeCheckout(user.id, user.email, {
      subscription: { ...subscription, introDiscountRate: 0.9 },
      lines: [],
    })

    expect(result.checkoutUrl).toBe('#mock-subscription')
    const stored = await getSubscription(user.id)
    expect(stored?.introDiscountRate).toBe(0)
    expect(stored?.firstMonth).toBe(42) // billed in full
  })
})

describe('claimIntroDiscount', () => {
  const sub = { ...subscription, flatMonthly: 40 } as MemberSubscription

  it.each([0.5, 0.25, 0.1])('honours the configured outcome %s', (rate) => {
    const claimed = claimIntroDiscount({ ...sub, introDiscountRate: rate })
    expect(claimed.introDiscountRate).toBe(rate)
    expect(claimed.firstMonth).toBe(Math.round(40 * (1 - rate) * 100) / 100)
  })

  it('claims nothing when no card was scratched', () => {
    const claimed = claimIntroDiscount(sub)
    expect(claimed.introDiscountRate).toBe(0)
    expect(claimed.firstMonth).toBe(40)
  })

  it('recomputes firstMonth from our own total, ignoring the one sent', () => {
    const claimed = claimIntroDiscount({ ...sub, introDiscountRate: 0.25, firstMonth: 1 })
    expect(claimed.firstMonth).toBe(30)
  })

  it('leaves a per-product minimum term alone', () => {
    const claimed = claimIntroDiscount({ ...sub, minMonths: 6 })
    expect(claimed.minMonths).toBe(6)
  })
})
