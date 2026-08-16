/**
 * Keeping Stripe in step with a member's plan.
 *
 * Every assertion here is about someone's bill. The behaviour being pinned:
 * a hub change reaches Stripe, a Stripe refusal stops us storing a plan the
 * card disagrees with, and — the one exception — a cancellation is never
 * blocked by either.
 */
import type { MemberSubscription } from '@/lib/recharge/types'
import { syncSubscriptionToStripe, syncMonthlyAmount } from '@/lib/payments/subscription-sync'

const updateSubscriptionAmount = jest.fn()
const updateSubscriptionDelivery = jest.fn()
const cancelStripeSubscription = jest.fn()
const pauseStripeSubscription = jest.fn()
const resumeStripeSubscription = jest.fn()

jest.mock('@/lib/payments/stripe', () => ({
  updateSubscriptionAmount: (...a: unknown[]) => updateSubscriptionAmount(...a),
  updateSubscriptionDelivery: (...a: unknown[]) => updateSubscriptionDelivery(...a),
  cancelStripeSubscription: (...a: unknown[]) => cancelStripeSubscription(...a),
  pauseStripeSubscription: (...a: unknown[]) => pauseStripeSubscription(...a),
  resumeStripeSubscription: (...a: unknown[]) => resumeStripeSubscription(...a),
}))

function sub(over: Partial<MemberSubscription> = {}): MemberSubscription {
  return {
    id: 's',
    status: 'active',
    customerEmail: 'a@b.c',
    flatMonthly: 70,
    dispatchDayOfMonth: 15,
    minMonths: 1,
    monthsActive: 0,
    startedAt: new Date().toISOString(),
    paymentMethod: null,
    lines: [],
    stripeSubscriptionId: 'sub_stripe_1',
    ...over,
  }
}

beforeEach(() => {
  jest.clearAllMocks()
  process.env.PAYMENTS_SOURCE = 'stripe'
  process.env.STRIPE_SECRET_KEY = 'sk_test_x'
})

afterEach(() => {
  delete process.env.PAYMENTS_SOURCE
  delete process.env.STRIPE_SECRET_KEY
})

describe('when there is nothing to tell Stripe', () => {
  it('does nothing in mock payment mode', async () => {
    process.env.PAYMENTS_SOURCE = 'mock'
    const result = await syncSubscriptionToStripe(sub(), sub({ flatMonthly: 90 }))
    expect(result.ok).toBe(true)
    expect(updateSubscriptionAmount).not.toHaveBeenCalled()
  })

  it('does nothing for a plan Stripe has never heard of', async () => {
    const local = sub({ stripeSubscriptionId: undefined })
    const result = await syncSubscriptionToStripe(local, { ...local, flatMonthly: 90 })
    expect(result.ok).toBe(true)
    expect(updateSubscriptionAmount).not.toHaveBeenCalled()
  })

  it('does not churn Stripe when the amount has not moved', async () => {
    // Most hub writes are not price changes — they save the whole document.
    await syncSubscriptionToStripe(sub(), sub({ dispatchDayOfMonth: 20 }))
    expect(updateSubscriptionAmount).not.toHaveBeenCalled()
  })

  it('ignores sub-penny drift', async () => {
    await syncMonthlyAmount(sub({ flatMonthly: 70.004 }), 70)
    expect(updateSubscriptionAmount).not.toHaveBeenCalled()
  })
})

describe('re-pricing', () => {
  it('pushes a new monthly to Stripe when a member changes their plan', async () => {
    const result = await syncSubscriptionToStripe(sub(), sub({ flatMonthly: 92.5 }))
    expect(result.ok).toBe(true)
    expect(updateSubscriptionAmount).toHaveBeenCalledWith('sub_stripe_1', 92.5)
  })

  it('reports failure so the caller refuses to save', async () => {
    // A stored plan that disagrees with the card charge is worse than a change
    // that didn't happen: nobody finds out until a statement arrives.
    updateSubscriptionAmount.mockRejectedValueOnce(new Error('card_declined'))
    const result = await syncSubscriptionToStripe(sub(), sub({ flatMonthly: 92.5 }))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('card_declined')
  })
})

describe('cancellation', () => {
  it('cancels in Stripe', async () => {
    const result = await syncSubscriptionToStripe(sub(), sub({ status: 'cancelled' }))
    expect(result.ok).toBe(true)
    expect(cancelStripeSubscription).toHaveBeenCalledWith('sub_stripe_1')
  })

  it('is NEVER blocked by a Stripe failure — the member still leaves', async () => {
    // Withholding someone's right to cancel until a third-party API cooperates
    // is exactly the term that gets struck down. The caller persists anyway and
    // logs `cancelError` for someone to reconcile by hand.
    cancelStripeSubscription.mockRejectedValueOnce(new Error('stripe down'))
    const result = await syncSubscriptionToStripe(sub(), sub({ status: 'cancelled' }))
    expect(result.ok).toBe(true)
    expect(result.cancelError).toContain('stripe down')
  })

  it('does not try to re-price a subscription it is cancelling', async () => {
    // Removing every line drops the monthly to 0 on the way out; pushing that to
    // Stripe is a pointless call that can fail and block the cancellation.
    await syncSubscriptionToStripe(sub(), sub({ status: 'cancelled', flatMonthly: 0 }))
    expect(updateSubscriptionAmount).not.toHaveBeenCalled()
  })

  it('does not cancel twice', async () => {
    await syncSubscriptionToStripe(sub({ status: 'cancelled' }), sub({ status: 'cancelled' }))
    expect(cancelStripeSubscription).not.toHaveBeenCalled()
  })
})

describe('pause and resume', () => {
  it('pauses billing in Stripe', async () => {
    const result = await syncSubscriptionToStripe(sub(), sub({ status: 'paused' }))
    expect(result.ok).toBe(true)
    expect(pauseStripeSubscription).toHaveBeenCalledWith('sub_stripe_1')
  })

  it('resumes billing in Stripe', async () => {
    const result = await syncSubscriptionToStripe(sub({ status: 'paused' }), sub({ status: 'active' }))
    expect(result.ok).toBe(true)
    expect(resumeStripeSubscription).toHaveBeenCalledWith('sub_stripe_1')
  })

  it('refuses the save when a pause fails', async () => {
    pauseStripeSubscription.mockRejectedValueOnce(new Error('nope'))
    const result = await syncSubscriptionToStripe(sub(), sub({ status: 'paused' }))
    expect(result.ok).toBe(false)
  })

  it('does not re-pause an already-paused plan', async () => {
    await syncSubscriptionToStripe(sub({ status: 'paused' }), sub({ status: 'paused', flatMonthly: 70 }))
    expect(pauseStripeSubscription).not.toHaveBeenCalled()
  })
})


/**
 * Postage crossing a delivery band.
 *
 * `updateSubscriptionAmount` writes the plan line and deliberately leaves
 * postage alone, so until `syncDeliveryLine` existed a plan that grew or shrank
 * kept billing whatever rate it signed up at for the rest of its life. The three
 * directions are not symmetrical, and the third could not be fixed by updating
 * anything: a plan that qualified for free delivery at signup has no postage
 * item at all.
 *
 * The rate ladder these lean on: up to £40 → £4.95, up to £100 → £2.95, above
 * £100 → free.
 */
describe('postage on a plan that changes size', () => {
  it('drops the rate when the plan grows into a cheaper band', async () => {
    // £38 → £45. Was billed £4.95 forever; owes £2.95.
    await syncSubscriptionToStripe(sub({ flatMonthly: 38 }), sub({ flatMonthly: 45 }))
    expect(updateSubscriptionDelivery).toHaveBeenCalledWith(
      'sub_stripe_1',
      expect.objectContaining({ price: 2.95 }),
    )
  })

  it('removes postage when the plan grows past the free-delivery line', async () => {
    // £90 → £110. Was billed £2.95 forever; owes nothing.
    await syncSubscriptionToStripe(sub({ flatMonthly: 90 }), sub({ flatMonthly: 110 }))
    expect(updateSubscriptionDelivery).toHaveBeenCalledWith('sub_stripe_1', null)
  })

  it('starts charging postage when the plan shrinks below the free line', async () => {
    // £110 → £90. The leak: no postage item was ever created for this plan, and
    // nothing outside checkout could add one, so it shipped free indefinitely.
    await syncSubscriptionToStripe(sub({ flatMonthly: 110 }), sub({ flatMonthly: 90 }))
    expect(updateSubscriptionDelivery).toHaveBeenCalledWith(
      'sub_stripe_1',
      expect.objectContaining({ price: 2.95 }),
    )
  })

  it('leaves Stripe alone when the plan moves within one band', async () => {
    // Ordinary hub saves must not churn Stripe with a second call.
    await syncSubscriptionToStripe(sub({ flatMonthly: 45 }), sub({ flatMonthly: 55 }))
    expect(updateSubscriptionDelivery).not.toHaveBeenCalled()
  })

  it('does not re-rate postage on a plan being cancelled', async () => {
    await syncSubscriptionToStripe(sub({ flatMonthly: 90 }), sub({ flatMonthly: 110, status: 'cancelled' }))
    expect(updateSubscriptionDelivery).not.toHaveBeenCalled()
  })

  it('does not touch postage when the price change itself was refused', async () => {
    // A plan Stripe would not re-price must not end up with new postage against
    // the old price — the same rule the amount sync follows.
    updateSubscriptionAmount.mockRejectedValueOnce(new Error('card_declined'))
    const result = await syncSubscriptionToStripe(sub({ flatMonthly: 90 }), sub({ flatMonthly: 110 }))
    expect(result.ok).toBe(false)
    expect(updateSubscriptionDelivery).not.toHaveBeenCalled()
  })
})
