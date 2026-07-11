/**
 * Checkout finalize — persists the member's bundle + quiz to their account and
 * returns a payment URL (mock mode returns a placeholder). Runs against the
 * in-memory DB.
 */
import { finalizeCheckout } from '../finalize'
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
  minMonths: 4,
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
})
