/**
 * A product the founders hold out of its next box (out of stock for a while):
 * it comes out of that box, and the credit for it reaches Stripe, as a
 * member's own skip does. It used to be shown in the hub and never paid.
 */
const mockCredit = jest.fn(async (_opts: unknown) => {})
jest.mock('@/lib/payments', () => ({ ...jest.requireActual('@/lib/payments'), getPaymentSource: () => 'stripe' }))
jest.mock('@/lib/payments/stripe', () => ({
  creditCustomerBalance: (opts: unknown) => mockCredit(opts),
  updateSubscriptionAmount: async () => {},
}))

import { applyChangeEvent } from '@/lib/changes/service'
import { createUser } from '@/lib/db/users'
import { getSubscription, saveSubscription } from '@/lib/db/hub-data'
import type { ChangeEvent } from '@/lib/changes/types'
import { line, product, subscriptionWith } from './fixtures'

process.env.NOTIFY_TEST_ALLOWLIST = '@example.com'

it('takes the held product out of its next box and credits it in Stripe, once per event', async () => {
  const user = await createUser({ email: 'held@example.com' })
  const sub = subscriptionWith(
    [line({ id: 'l1', productId: 'whey-a', pricePerDelivery: 30 }), line({ id: 'l2', productId: 'other', pricePerDelivery: 30 })],
    { stripeCustomerId: 'cus_held', stripeSubscriptionId: 'sub_held' },
  )
  await saveSubscription(user.id, sub)
  const event = {
    id: 'chg_hold_1',
    kind: 'out-of-stock',
    status: 'open',
    userId: user.id,
    customerEmail: 'held@example.com',
    subscriptionId: sub.id,
    lineId: 'l1',
    productId: 'whey-a',
    productTitle: 'Whey A',
    sku: null,
    slotTitle: 'Protein',
    swapGroup: 'protein-whey',
    policy: 'auto-swap',
    intendedAction: 'hold',
    autoApplyAt: new Date().toISOString(),
    suggestedReplacementId: null,
    suggestedReplacementTitle: null,
    billingPreview: null,
  } as unknown as ChangeEvent

  await applyChangeEvent(event, { type: 'hold' }, 'founder', { catalogue: [product({ id: 'whey-a' }), product({ id: 'other' })] })

  const stored = (await getSubscription(user.id))!
  const removedFrom = Object.values(stored.deliveryOverrides ?? {}).filter((o) => o.removedLineIds?.includes('l1'))
  expect(removedFrom).toHaveLength(1)
  expect(mockCredit).toHaveBeenCalledTimes(1)
  expect(mockCredit.mock.calls[0][0]).toMatchObject({ customerId: 'cus_held', amount: 30, idempotencyKey: 'hold:chg_hold_1' })
})
