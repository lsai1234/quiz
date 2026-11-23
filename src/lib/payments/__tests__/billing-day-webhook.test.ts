import type Stripe from 'stripe'

/** Stripe's own record of the subscription: billed on the 27th, on a Mastercard. */
jest.mock('@/lib/payments/stripe', () => ({
  ...jest.requireActual('@/lib/payments/stripe'),
  subscriptionFactsFor: async () => ({ card: { brand: 'mastercard', last4: '4444' }, billingDay: 27 }),
}))

import { handleStripeEvent } from '@/lib/payments/webhook'
import { createMockSubscription } from '@/lib/recharge/mock'
import { getSubscription, saveSubscription } from '@/lib/db/hub-data'
import { MOCK_CATALOGUE } from '@/lib/catalogue/mock-catalogue'
import { createUser } from '@/lib/db/users'

/**
 * Once Stripe has the subscription, its billing day is the plan's day: Stripe
 * charges on it and every renewal box is raised by that charge. The plan used to
 * keep "the 15th" for good.
 */
it('takes the plan’s day and card from Stripe when the subscription is linked', async () => {
  const user = await createUser({ email: 'anchor-day@example.com' })
  await saveSubscription(user.id, { ...createMockSubscription(MOCK_CATALOGUE, 'anchor-day@example.com'), dispatchDayOfMonth: 15 })

  await handleStripeEvent({
    id: 'evt_anchor',
    type: 'checkout.session.completed',
    data: { object: { id: 'cs_anchor', mode: 'subscription', client_reference_id: user.id, subscription: 'sub_anchor', customer: 'cus_anchor' } as Stripe.Checkout.Session },
  } as unknown as Stripe.Event)

  const sub = await getSubscription(user.id)
  expect(sub?.dispatchDayOfMonth).toBe(27)
  expect(sub?.paymentMethod).toEqual({ brand: 'mastercard', last4: '4444' })
})
