/**
 * @jest-environment node
 */
/**
 * The daily 25% codes at checkout, with the switch off as it now always is
 * unless a founder turns it back on. A row made before is still in the
 * database; typed into a stack's checkout or the shop basket it is refused out
 * loud and takes nothing off, while a store code of the founders' own still
 * discounts as it always has.
 */
jest.mock('@/lib/supplier/stock-check', () => ({
  checkLiveStock: async () => ({ ran: true, confirmed: true, shortfalls: [], unconfirmed: [], live: [], error: null }),
}))
jest.mock('@/lib/supplier/sync', () => ({ rememberLiveStock: async () => 0 }))
jest.mock('@/lib/portal/store', () => ({ syncPortalRuntime: async () => {} }))
jest.mock('@/lib/partners/referral', () => ({ resolveCheckoutCode: async (typed: string | null) => typed }))
jest.mock('@/lib/payments', () => ({
  ...jest.requireActual('@/lib/payments'),
  getPaymentSource: () => 'mock',
}))

const WHEY = {
  id: 'whey',
  title: 'CHRGD Whey Protein',
  cost: 12,
  basePrice: 34.99,
  variants: [{ id: 'v-whey', title: '1kg', flavour: 'Chocolate', size: '1kg', price: 34.99, compareAtPrice: null, available: true, sku: 'W1', cost: 12 }],
}
jest.mock('@/lib/catalogue/resolve', () => ({ getResolvedCatalogue: async () => ({ products: [WHEY] }) }))

import { POST } from '../route'
import { createStoreCode, ensureHousePartner } from '@/lib/store-codes'
import { dailyCodesEnabled } from '@/lib/store-codes/daily'
import { HOUSE_PARTNER_ID } from '@/lib/partners/house'
import * as repo from '@/lib/partners/repo'
import { getOrder } from '@/lib/orders/repo'

function checkout(code: string, source: string) {
  const lines = [{ variantId: 'v-whey', quantity: 1, attributes: [{ key: 'source', value: source }] }]
  return POST(new Request('http://localhost/api/cart', { method: 'POST', body: JSON.stringify({ lines, partnerCode: code }) }))
}

const STACK = 'quiz-stack-builder'
const SHOP = 'shop'

beforeAll(async () => {
  await ensureHousePartner()
  // A daily code's row as the old schedule made it, but on open terms, so
  // nothing but its being a daily code can refuse it whatever day this runs.
  await repo.createCode({
    code: 'BOOST25',
    partnerId: HOUSE_PARTNER_ID,
    discountPct: 0.25,
    terms: { firstOrderOnly: false, maxUses: null, uses: 0, startsAt: null, endsAt: null, minSpend: null },
  })
  await createStoreCode({ name: 'STORE10', percent: 10 })
})

it('refuses a daily code typed at checkout, for a stack and for the shop basket', async () => {
  expect(await dailyCodesEnabled()).toBe(false)
  for (const source of [STACK, SHOP]) {
    const res = await checkout('boost25', source)
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'That code is no longer active.', codeRejected: true })
  }
  expect((await repo.getCode('BOOST25'))?.terms.uses).toBe(0)
})

it('still takes a store code off, for a stack and for the shop basket', async () => {
  for (const source of [STACK, SHOP]) {
    const res = await checkout('store10', source)
    expect(res.status).toBe(200)
    const order = await getOrder((await res.json()).orderId)
    expect(order).toMatchObject({ partnerCode: 'STORE10', partnerDiscountPct: 0.1 })
  }
})
