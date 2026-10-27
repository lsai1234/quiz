/**
 * The free bonus on a subscription (plan Phase 4): re-checked at finalize,
 * stored on the plan, in the first box only, a £0.00 one-time line in Stripe,
 * and refused (nothing stored, nothing charged) when it no longer stands.
 */
jest.mock('@/lib/supplier/stock-check', () => ({
  checkLiveStock: async () => ({ ran: true, confirmed: true, shortfalls: [], unconfirmed: [], live: [], error: null }),
}))
jest.mock('@/lib/catalogue/resolve', () => ({
  getResolvedCatalogue: async () => ({ products: jest.requireActual('@/lib/catalogue/mock-catalogue').MOCK_CATALOGUE }),
}))

import { finalizeCheckout, BonusUnavailable } from '../finalize'
import type { CheckoutPayload } from '../types'
import { createUser } from '@/lib/db/users'
import { getSubscription } from '@/lib/db/hub-data'
import { listOrders } from '@/lib/orders/repo'
import { writeJson } from '@/lib/portal/persist'
import { TERMS_VERSION, DISCLAIMER_VERSION } from '@/lib/legal/content'
import { MOCK_CATALOGUE } from '@/lib/catalogue/mock-catalogue'
import type { MemberSubscription } from '@/lib/recharge/types'
import { allOn } from '@/lib/offer/__tests__/fixtures'
import { DEFAULT_OFFER } from '@/lib/offer/settings'

const STACK = ['chrgd-whey-protein', 'chrgd-creatine', 'chrgd-pre-workout', 'chrgd-bcaa', 'chrgd-clear-whey']
const consent = { accepted: true, termsVersion: TERMS_VERSION, disclaimerVersion: DISCLAIMER_VERSION }

function plan(): MemberSubscription {
  return {
    id: `sub-${Math.random().toString(36).slice(2, 8)}`,
    status: 'active',
    customerEmail: '',
    flatMonthly: 90,
    dispatchDayOfMonth: 15,
    minMonths: 1,
    monthsActive: 0,
    startedAt: new Date().toISOString(),
    paymentMethod: null,
    lines: STACK.map((id, i) => {
      const p = MOCK_CATALOGUE.find((x) => x.id === id)!
      const v = p.variants.find((x) => x.available)!
      return { id: `l${i}`, productId: id, productTitle: p.title, variantTitle: v.flavour || v.size || '', variantId: v.id, quantity: 1, pricePerDelivery: v.price, deliveryIntervalMonths: 1, deliveriesMade: 0, joinedAtMonth: 0 }
    }),
  } as unknown as MemberSubscription
}

const GIFT = { productId: 'chrgd-vitamin-c-zinc', level: 'complete' as const }

afterEach(async () => {
  await writeJson('offer', DEFAULT_OFFER)
})

it('stores the gift on the plan and ships it in the first box only', async () => {
  await writeJson('offer', { ...allOn(), heroes: {} })
  const user = await createUser({ email: 'gift-sub@example.com', passwordHash: 'h' })
  const payload: CheckoutPayload = { subscription: plan(), consent, bonus: GIFT }
  await finalizeCheckout(user.id, user.email, payload)
  const stored = await getSubscription(user.id)
  expect(stored?.bonus).toMatchObject({ productId: GIFT.productId, level: 'complete' })
  const [first] = (await listOrders({})).filter((o) => o.userId === user.id)
  expect(first.lines.find((l) => l.bonus)).toMatchObject({ productId: GIFT.productId, unitPrice: 0 })
})

it('refuses the gift before anything is stored when it no longer stands', async () => {
  await writeJson('offer', DEFAULT_OFFER)
  const user = await createUser({ email: 'gift-off@example.com', passwordHash: 'h' })
  await expect(finalizeCheckout(user.id, user.email, { subscription: plan(), consent, bonus: GIFT })).rejects.toBeInstanceOf(BonusUnavailable)
  expect(await getSubscription(user.id)).toBeNull()
})

it('refuses it to a member who has ordered before', async () => {
  await writeJson('offer', { ...allOn(), heroes: {} })
  const user = await createUser({ email: 'gift-again@example.com', passwordHash: 'h' })
  await finalizeCheckout(user.id, user.email, { subscription: plan(), consent })
  await expect(finalizeCheckout(user.id, user.email, { subscription: plan(), consent, bonus: GIFT })).rejects.toThrow(/first order only/)
})
