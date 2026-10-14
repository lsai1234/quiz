/**
 * @jest-environment node
 */
/**
 * The last-chance offer at checkout: one product, at a price the server works
 * out for itself. Whatever the browser sends, the order is billed at
 * `quoteOffer`'s figure — and only for one product bought on its own.
 */
jest.mock('@/lib/supplier/stock-check', () => ({
  checkLiveStock: async () => ({ ran: true, confirmed: true, shortfalls: [], unconfirmed: [], live: [], error: null }),
}))
jest.mock('@/lib/supplier/sync', () => ({ rememberLiveStock: async () => 0 }))
jest.mock('@/lib/portal/store', () => ({ syncPortalRuntime: async () => {} }))
jest.mock('@/lib/partners/referral', () => ({ resolveCheckoutCode: async (typed: string | null) => typed }))

const WHEY = {
  id: 'whey',
  title: 'CHRGD Whey Protein',
  cost: 12,
  basePrice: 34.99,
  weightGrams: 1000,
  variants: [{ id: 'v-whey', title: '1kg', flavour: 'Chocolate', size: '1kg', price: 34.99, compareAtPrice: null, available: true, sku: 'W1', cost: 12 }],
}
const ZINC = {
  id: 'zinc',
  title: 'Vitamin C + Zinc',
  cost: 6,
  basePrice: 11.99,
  variants: [{ id: 'v-zinc', title: '60 tabs', flavour: null, size: '60 tabs', price: 11.99, compareAtPrice: null, available: true, sku: 'Z1', cost: 6 }],
}
jest.mock('@/lib/catalogue/resolve', () => ({ getResolvedCatalogue: async () => ({ products: [WHEY, ZINC] }) }))

import { POST } from '../route'
import { offerProductFor, quoteOffer } from '@/lib/last-chance/economics'
import { getOrder } from '@/lib/orders/repo'

const quote = quoteOffer(offerProductFor(WHEY as never, WHEY.variants[0]))

function buy(body: Record<string, unknown>) {
  return POST(new Request('http://localhost/api/cart', { method: 'POST', body: JSON.stringify(body) }))
}
const line = (variantId: string, quantity = 1) => ({
  variantId, quantity, attributes: [{ key: 'source', value: 'quiz-last-chance' }],
})

it('bills the server’s own quote and records the offer on the order', async () => {
  expect(quote.viable).toBe(true)
  expect(quote.discountPct).toBeGreaterThan(0)
  const res = await buy({ lines: [line('v-whey')], lastChance: { variantId: 'v-whey', expectedPrice: quote.offerPrice } })
  expect(res.status).toBe(200)
  const { orderId } = await res.json()
  const order = await getOrder(orderId)
  expect(order?.lines[0].unitPrice).toBe(quote.offerPrice)
  expect(order?.channel).toBe('quiz')
  expect(order?.shipping).toBe(quote.deliveryCharge)
  expect(order?.events.some((e) => e.type === 'offer' && /last-chance offer/.test(e.detail ?? ''))).toBe(true)
})

it('stops rather than charge more than the customer was shown', async () => {
  const res = await buy({ lines: [line('v-whey')], lastChance: { variantId: 'v-whey', expectedPrice: 1 } })
  expect(res.status).toBe(409)
  const body = await res.json()
  expect(body.offerChanged).toBe(true)
  expect(body.quote.offerPrice).toBe(quote.offerPrice)
})

it('is an offer for one product on its own — nothing else gets the discount', async () => {
  for (const lines of [[line('v-whey'), line('v-zinc')], [line('v-whey', 2)], [line('v-zinc')]]) {
    const res = await buy({ lines, lastChance: { variantId: 'v-whey', expectedPrice: quote.offerPrice } })
    expect(res.status).toBe(400)
  }
})

it('refuses the offer on a product that cannot be sold alone at a profit', async () => {
  const res = await buy({ lines: [line('v-zinc')], lastChance: { variantId: 'v-zinc', expectedPrice: 11.99 } })
  expect(res.status).toBe(409)
})

it('prices the same line at full price when no offer is asked for', async () => {
  const res = await buy({ lines: [line('v-whey')] })
  const order = await getOrder((await res.json()).orderId)
  expect(order?.lines[0].unitPrice).toBe(34.99)
})

it('takes no code and no referral on an offer order — its floor did not count them', async () => {
  const res = await buy({ lines: [line('v-whey')], partnerCode: 'SPARK25', lastChance: { variantId: 'v-whey', expectedPrice: quote.offerPrice } })
  expect(res.status).toBe(200)
  const order = await getOrder((await res.json()).orderId)
  expect(order?.lines[0].unitPrice).toBe(quote.offerPrice)
  expect(order?.partnerCode).toBeNull()
})

describe('delivery, on any basket', () => {
  it('bands on what the basket is worth, so a discount cannot cost it free delivery', async () => {
    // 3 × £34.99 = £104.97: over the £100 line, then 8% off to £96.57. The
    // receipt said "Delivery · Free"; the charge has to agree.
    const res = await buy({ lines: [{ ...line('v-whey', 3), attributes: [{ key: 'source', value: 'quiz-stack-builder' }] }] })
    const order = await getOrder((await res.json()).orderId)
    expect(order?.subtotal).toBeLessThan(100)
    expect(order?.shipping).toBe(0)
  })
})
