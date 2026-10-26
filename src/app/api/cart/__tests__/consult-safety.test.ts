/**
 * @jest-environment node
 */
/**
 * A one-off order from a consult stack keeps what the consult kept out — but
 * only with the circuit check's consent, and only as known ingredient families.
 */
jest.mock('@/lib/supplier/stock-check', () => ({
  checkLiveStock: async () => ({ ran: true, confirmed: true, shortfalls: [], unconfirmed: [], live: [], error: null }),
}))
jest.mock('@/lib/supplier/sync', () => ({ rememberLiveStock: async () => 0 }))
jest.mock('@/lib/portal/store', () => ({ syncPortalRuntime: async () => {} }))
jest.mock('@/lib/payments', () => ({
  ...jest.requireActual('@/lib/payments'),
  getPaymentSource: () => 'mock',
}))
const mockUser = { current: null as null | { id: string; email: string } }
jest.mock('@/lib/auth/session', () => ({ getHubUser: async () => mockUser.current }))

const D3 = {
  id: 'd3',
  title: 'Vitamin D3 4000IU',
  cost: 3,
  basePrice: 24,
  variants: [{ id: 'v-d3', title: '90 caps', flavour: null, size: '90 caps', price: 24, compareAtPrice: null, available: true, sku: 'D1', cost: 3 }],
}
jest.mock('@/lib/catalogue/resolve', () => ({ getResolvedCatalogue: async () => ({ products: [D3] }) }))

import { POST } from '../route'
import { getOrder } from '@/lib/orders/repo'
import { createUser } from '@/lib/db/users'
import { listConsents } from '@/lib/legal/consent'
import { HEALTH_DATA_VERSION } from '@/lib/legal/content'

const CONSENT = { accepted: true, version: HEALTH_DATA_VERSION, at: '2026-10-30T10:15:00.000Z' }

async function checkout(safety: unknown) {
  const lines = [{ variantId: 'v-d3', quantity: 1, attributes: [{ key: 'source', value: 'quiz-stack-builder' }] }]
  const res = await POST(new Request('http://localhost/api/cart', { method: 'POST', body: JSON.stringify({ lines, safety }) }))
  if (res.status !== 200) throw new Error(JSON.stringify(await res.json()))
  return getOrder((await res.json()).orderId)
}

afterEach(() => {
  mockUser.current = null
})

it('keeps the exclusions on the order, with the consent they came under', async () => {
  const order = await checkout({ excluded: ['vitamin-k', 'fish-oil', 'not-a-family'], healthDataConsent: CONSENT })
  expect(order!.safetyConstraints).toEqual({ dietaryTags: [], noStimulants: false, safetyFlags: [], excludedIngredients: ['fish-oil', 'vitamin-k'] })
  expect(order!.healthDataConsent).toEqual(CONSENT)
})

it('drops them without a current consent', async () => {
  for (const healthDataConsent of [null, { ...CONSENT, version: '2020-01-01' }]) {
    const order = await checkout({ excluded: ['vitamin-k'], healthDataConsent })
    expect(order!.safetyConstraints).toBeUndefined()
    expect(order!.healthDataConsent).toBeUndefined()
  }
})

it('records the health-data consent for a signed-in buyer', async () => {
  const user = await createUser({ email: 'oneoff-consult@example.com', passwordHash: 'h' })
  mockUser.current = { id: user.id, email: user.email! }
  await checkout({ excluded: ['vitamin-k'], healthDataConsent: CONSENT })
  const health = (await listConsents(user.id)).filter((c) => c.context === 'health-data')
  expect(health).toHaveLength(1)
  expect(health[0].acceptedAt).toBe(CONSENT.at)
})

it('a quiz or shop order carries nothing', async () => {
  const order = await checkout(undefined)
  expect(order!.safetyConstraints).toBeUndefined()
})
