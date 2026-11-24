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

/** A renewal packs the extras its payment paid for (`hub/next-box`). */
it('packs a paid extra in the renewal box', async () => {
  const { getOrder } = await import('@/lib/orders/repo')
  const user = await createUser({ email: 'extra-renewal@example.com' })
  await saveSubscription(user.id, { ...createMockSubscription(MOCK_CATALOGUE, 'extra-renewal@example.com'), stripeSubscriptionId: 'sub_extra', stripeCustomerId: 'cus_extra' })
  const { linkStripeSubscription } = await import('@/lib/payments/subscription-link')
  await linkStripeSubscription('sub_extra', user.id)
  const extra = MOCK_CATALOGUE.find((p) => p.subscriptionEligible && !p.isSubscriptionOnly && p.variants.some((v) => v.available))!
  const variant = extra.variants.find((v) => v.available)!

  await handleStripeEvent({
    id: 'evt_extra',
    type: 'invoice.paid',
    data: {
      object: {
        id: 'in_extra',
        subscription: 'sub_extra',
        billing_reason: 'subscription_cycle',
        amount_paid: 6000,
        lines: { data: [{ amount: 1299, quantity: 1, description: 'extra', metadata: { chrgd_box_extra: '1', chrgd_product_id: extra.id, chrgd_variant_id: variant.id, chrgd_sku: variant.sku ?? '' } }] },
      } as unknown as Stripe.Invoice,
    },
  } as unknown as Stripe.Event)

  const order = await getOrder('ord_inv_in_extra')
  expect(order?.lines).toEqual(expect.arrayContaining([expect.objectContaining({ productId: extra.id, unitPrice: 12.99, quantity: 1 })]))
})
