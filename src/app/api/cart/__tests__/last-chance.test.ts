/**
 * @jest-environment node
 */
/**
 * The last-chance offer at checkout: one product, on a deal the server works
 * out for itself. Whatever the browser sends, the order is billed at
 * `quoteOffer`'s price and delivery — priced on its own, never with the tier
 * or a code — and only for one product bought on its own.
 */
jest.mock('@/lib/supplier/stock-check', () => ({
  checkLiveStock: async () => ({ ran: true, confirmed: true, shortfalls: [], unconfirmed: [], live: [], error: null }),
}))
jest.mock('@/lib/supplier/sync', () => ({ rememberLiveStock: async () => 0 }))
jest.mock('@/lib/portal/store', () => ({ syncPortalRuntime: async () => {} }))
jest.mock('@/lib/partners/referral', () => ({ resolveCheckoutCode: async (typed: string | null) => typed }))
const mockSource = { value: 'mock' }
jest.mock('@/lib/payments', () => ({
  ...jest.requireActual('@/lib/payments'),
  getPaymentSource: () => mockSource.value,
}))
const mockSession = jest.fn(async (_input: unknown) => ({ url: 'https://checkout.stripe.test/s' }))
jest.mock('@/lib/payments/stripe', () => ({ createCheckoutSession: (input: unknown) => mockSession(input) }))

const BIG = {
  id: 'big',
  title: 'CHRGD Mass Builder',
  cost: 30,
  basePrice: 59.99,
  weightGrams: 3000,
  variants: [{ id: 'v-big', title: '3kg', flavour: null, size: '3kg', price: 59.99, compareAtPrice: null, available: true, sku: 'B1', cost: 30 }],
}
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
jest.mock('@/lib/catalogue/resolve', () => ({ getResolvedCatalogue: async () => ({ products: [WHEY, ZINC, BIG] }) }))

import { POST } from '../route'
import { describeDeal, offerProductFor, quoteOffer } from '@/lib/last-chance/economics'
import { getOrder } from '@/lib/orders/repo'
import { unitEconomics } from '@/lib/pricing/unit-economics'
import { getPricingConfig, getPricingOverrides, setPricingOverrides } from '@/lib/stack-blueprint/pricing'

const quote = quoteOffer(offerProductFor(WHEY as never, WHEY.variants[0]))
const offerFor = (q: typeof quote, variantId: string) => ({ variantId, expectedPrice: q.offerPrice, expectedDelivery: q.deliveryCharge })

afterEach(() => {
  mockSource.value = 'mock'
  mockSession.mockClear()
})

function buy(body: Record<string, unknown>) {
  return POST(new Request('http://localhost/api/cart', { method: 'POST', body: JSON.stringify(body) }))
}
const line = (variantId: string, quantity = 1) => ({
  variantId, quantity, attributes: [{ key: 'source', value: 'quiz-last-chance' }],
})

it('bills the server’s own deal — price and delivery — and records it on the order', async () => {
  expect(quote.viable).toBe(true)
  expect(quote.deliveryDeal).toBe('free')
  const res = await buy({ lines: [line('v-whey')], lastChance: offerFor(quote, 'v-whey') })
  expect(res.status).toBe(200)
  const { orderId } = await res.json()
  const order = await getOrder(orderId)
  expect(order?.lines[0].unitPrice).toBe(quote.offerPrice)
  expect(order?.channel).toBe('quiz')
  expect(order?.shipping).toBe(0)
  expect(order?.total).toBe(quote.total)
  expect(order?.lastChance).toMatchObject({ listPrice: 34.99, offerPrice: quote.offerPrice, deliveryDeal: 'free', standardDelivery: 4.95, deliveryCharge: 0 })
  const surcharge = getPricingConfig().delivery.zone2Surcharge
  expect(order?.deliveryDue).toEqual({ 'uk-1': 0, 'uk-2': surcharge })
  const note = order?.events.find((e) => e.type === 'offer')?.detail ?? ''
  expect(note).toContain(describeDeal(quote))
})

it('hands Stripe the deal’s own delivery: free on the mainland, the surcharge up north', async () => {
  mockSource.value = 'stripe'
  const res = await buy({ lines: [line('v-whey')], lastChance: offerFor(quote, 'v-whey') })
  expect(res.status).toBe(200)
  const sent = mockSession.mock.calls[0][0] as { lines: Array<{ unitPrice: number }>; shippingOptions: Array<{ id: string; price: number; label: string }> }
  expect(sent.lines).toEqual([expect.objectContaining({ unitPrice: quote.offerPrice, quantity: 1 })])
  expect(sent.shippingOptions).toEqual([
    expect.objectContaining({ id: 'uk-mainland', price: 0, label: 'Free UK mainland delivery' }),
    expect.objectContaining({ id: 'uk-highlands', price: getPricingConfig().delivery.zone2Surcharge }),
  ])
})

it('stops rather than charge more than the customer was shown, and shows only the deal', async () => {
  const res = await buy({ lines: [line('v-whey')], lastChance: { ...offerFor(quote, 'v-whey'), expectedPrice: 1 } })
  expect(res.status).toBe(409)
  const body = await res.json()
  expect(body.offerChanged).toBe(true)
  expect(body.quote.offerPrice).toBe(quote.offerPrice)
  expect(body.quote.total).toBe(quote.total)
  // Our own figures stay on the server.
  expect(body.quote).not.toHaveProperty('contribution')
  expect(body.quote).not.toHaveProperty('floor')
  expect(body.quote).not.toHaveProperty('marginPct')
})

it('holds a request that never said what delivery it was shown to the ordinary charge', async () => {
  const res = await buy({ lines: [line('v-whey')], lastChance: { variantId: 'v-whey', expectedPrice: quote.offerPrice } })
  expect(res.status).toBe(200)
})

describe('when free delivery would lose money', () => {
  const before = getPricingOverrides()
  // A floor set between what free delivery and £3.99 delivery would make:
  // free fails, a reduced charge clears.
  beforeAll(() => {
    const at = (d: number) => unitEconomics({ shelfPrice: 34.99, supplierCost: 12, grams: 1000, customerDelivery: d }).contribution
    setPricingOverrides({ ...before, lastChance: { ...getPricingConfig().lastChance, minContribution: (at(0) + at(3.99)) / 2, minMarginPct: 0 } })
  })
  afterAll(() => setPricingOverrides(before))

  it('cuts delivery instead, and stops if the browser was shown less than the server will charge', async () => {
    const cut = quoteOffer(offerProductFor(WHEY as never, WHEY.variants[0]))
    expect(cut.deliveryDeal).toBe('reduced')
    expect(cut.discountPct).toBe(0)
    const stale = await buy({ lines: [line('v-whey')], lastChance: { ...offerFor(cut, 'v-whey'), expectedDelivery: 0 } })
    expect(stale.status).toBe(409)
    const res = await buy({ lines: [line('v-whey')], lastChance: offerFor(cut, 'v-whey') })
    const order = await getOrder((await res.json()).orderId)
    expect(order?.lines[0].unitPrice).toBe(34.99)
    expect(order?.shipping).toBe(cut.deliveryCharge)
    expect(order?.deliveryDue?.['uk-1']).toBe(cut.deliveryCharge)
  })
})

it('is priced on its own: a £50+ product gets the deal, not the bundle tier on top', async () => {
  const big = quoteOffer(offerProductFor(BIG as never, BIG.variants[0]))
  expect(big.viable).toBe(true)
  const res = await buy({ lines: [line('v-big')], lastChance: offerFor(big, 'v-big') })
  const order = await getOrder((await res.json()).orderId)
  expect(order?.lines[0].unitPrice).toBe(big.offerPrice)
  expect(order?.shipping).toBe(big.deliveryCharge)
})

it('is an offer for one product on its own — nothing else gets the discount', async () => {
  for (const lines of [[line('v-whey'), line('v-zinc')], [line('v-whey', 2)], [line('v-zinc')]]) {
    const res = await buy({ lines, lastChance: offerFor(quote, 'v-whey') })
    expect(res.status).toBe(400)
  }
})

it('refuses the offer on a product with no deal it can afford', async () => {
  const res = await buy({ lines: [line('v-zinc')], lastChance: { variantId: 'v-zinc', expectedPrice: 11.99, expectedDelivery: 4.95 } })
  expect(res.status).toBe(409)
})

it('prices the same line at full price when no offer is asked for', async () => {
  const res = await buy({ lines: [line('v-whey')] })
  const order = await getOrder((await res.json()).orderId)
  expect(order?.lines[0].unitPrice).toBe(34.99)
})

it('takes no code and no referral on an offer order — its floor did not count them', async () => {
  const res = await buy({ lines: [line('v-whey')], partnerCode: 'SPARK25', lastChance: offerFor(quote, 'v-whey') })
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
