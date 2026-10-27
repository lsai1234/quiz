/**
 * @jest-environment node
 */
/**
 * /api/cart re-checks the hero and the bonus against the hub's settings as they
 * are now, and says what changed before taking any money.
 */
jest.mock('@/lib/supplier/stock-check', () => ({
  checkLiveStock: async () => ({ ran: true, confirmed: true, shortfalls: [], unconfirmed: [], live: [], error: null }),
}))
jest.mock('@/lib/supplier/sync', () => ({ rememberLiveStock: async () => 0 }))
jest.mock('@/lib/portal/store', () => ({ ...jest.requireActual('@/lib/portal/store'), syncPortalRuntime: async () => {} }))
jest.mock('@/lib/payments', () => ({ ...jest.requireActual('@/lib/payments'), getPaymentSource: () => 'mock' }))
jest.mock('@/lib/catalogue/resolve', () => ({
  getResolvedCatalogue: async () => ({ products: jest.requireActual('@/lib/catalogue/mock-catalogue').MOCK_CATALOGUE }),
}))

import { POST } from '../route'
import { MOCK_CATALOGUE } from '@/lib/catalogue/mock-catalogue'
import { writeJson } from '@/lib/portal/persist'
import { allOn, approved } from '@/lib/offer/__tests__/fixtures'
import { DEFAULT_OFFER } from '@/lib/offer/settings'

const variantOf = (id: string) => MOCK_CATALOGUE.find((p) => p.id === id)!.variants.find((v) => v.available)!.id
const STACK = ['chrgd-whey-protein', 'chrgd-creatine', 'chrgd-pre-workout', 'chrgd-bcaa', 'chrgd-clear-whey']

async function setOffer(settings: unknown) {
  // Through the portal's own writer, so this instance's read cache sees it at once.
  await writeJson('offer', settings)
}

function stack(bonus: unknown) {
  const lines = STACK.map((id) => ({ variantId: variantOf(id), quantity: 1, attributes: [{ key: 'source', value: 'quiz-stack-builder' }] }))
  return POST(new Request('http://localhost/api/cart', { method: 'POST', body: JSON.stringify({ lines, bonus }) }))
}

afterEach(async () => {
  await setOffer(DEFAULT_OFFER)
})

it('takes the order when the bonus still qualifies', async () => {
  await setOffer({ ...allOn(), heroes: {} })
  const res = await stack({ productId: 'chrgd-vitamin-c-zinc', level: 'complete' })
  expect(res.status).toBe(200)
})

it('says so before payment when the bonus has been switched off', async () => {
  await setOffer(DEFAULT_OFFER)
  const res = await stack({ productId: 'chrgd-vitamin-c-zinc', level: 'complete' })
  expect(res.status).toBe(409)
  const body = await res.json()
  expect(body).toMatchObject({ bonusChanged: true, bonus: null, reason: 'off' })
  expect(body.error).toMatch(/Nothing has been charged/)
})

it('refuses a hero whose approval has been withdrawn', async () => {
  await setOffer({ ...allOn(), heroes: { 'chrgd-magnesium': { ...approved('chrgd-magnesium'), safetyReviewed: false } } })
  const id = 'chrgd-magnesium'
  const res = await POST(
    new Request('http://localhost/api/cart', {
      method: 'POST',
      body: JSON.stringify({
        lines: [{ variantId: variantOf(id), quantity: 1, attributes: [{ key: 'source', value: 'last-chance' }] }],
        lastChance: { variantId: variantOf(id), hero: true },
      }),
    }),
  )
  expect(res.status).toBe(409)
  expect(await res.json()).toMatchObject({ offerChanged: true, heroChanged: true })
})
