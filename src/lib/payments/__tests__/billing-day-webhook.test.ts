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

/** A thank-you gift: free in the member's third box, once, and the box counted. */
it('packs the founders’ thank-you gift in the third box, once, and counts the box', async () => {
  const { getOrder } = await import('@/lib/orders/repo')
  const { savePlanPerks } = await import('@/lib/offer/store')
  const user = await createUser({ email: 'thank-you@example.com' })
  const base = createMockSubscription(MOCK_CATALOGUE, 'thank-you@example.com')
  const gift = MOCK_CATALOGUE.find((p) => !base.lines.some((l) => l.productId === p.id) && p.variants.some((v) => v.available) && !p.hasStimulants && !p.isSubscriptionOnly)!
  await savePlanPerks({ gifts: { on: true, milestones: [{ box: 3, productId: gift.id, variantId: null }, { box: 6, productId: null, variantId: null }] } })
  await saveSubscription(user.id, { ...base, boxesSent: 2, stripeSubscriptionId: 'sub_thanks', stripeCustomerId: 'cus_thanks' })
  const { linkStripeSubscription } = await import('@/lib/payments/subscription-link')
  await linkStripeSubscription('sub_thanks', user.id)

  const paid = (id: string) =>
    handleStripeEvent({
      id: `evt_${id}`,
      type: 'invoice.paid',
      data: { object: { id, subscription: 'sub_thanks', billing_reason: 'subscription_cycle', amount_paid: 5000, lines: { data: [] } } as unknown as Stripe.Invoice },
    } as unknown as Stripe.Event)

  await paid('in_box3')
  const third = await getOrder('ord_inv_in_box3')
  expect(third?.lines).toEqual(expect.arrayContaining([expect.objectContaining({ productId: gift.id, unitPrice: 0, quantity: 1, bonus: true })]))
  expect((await getSubscription(user.id))?.boxesSent).toBe(3)

  // The same invoice again: no second gift, no second count.
  await paid('in_box3')
  expect((await getSubscription(user.id))?.boxesSent).toBe(3)
  // The fourth box has no gift.
  await paid('in_box4')
  expect((await getOrder('ord_inv_in_box4'))?.lines.some((l) => l.productId === gift.id)).toBe(false)
  expect((await getSubscription(user.id))?.boxesSent).toBe(4)
  await savePlanPerks({ gifts: { on: true, milestones: [{ box: 3, productId: null, variantId: null }, { box: 6, productId: null, variantId: null }] } })
})
