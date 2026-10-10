/**
 * @jest-environment node
 */
/**
 * Checkout refuses what has sold out — before a code is claimed or Stripe is
 * asked for anything — and says which item, in the customer's words.
 */
const checkLiveStock = jest.fn()
jest.mock('@/lib/supplier/stock-check', () => ({ checkLiveStock: (...a: unknown[]) => checkLiveStock(...a) }))
jest.mock('@/lib/supplier/sync', () => ({ rememberLiveStock: async () => 0 }))
jest.mock('@/lib/portal/store', () => ({ syncPortalRuntime: async () => {} }))
jest.mock('@/lib/catalogue/resolve', () => ({
  getResolvedCatalogue: async () => ({
    products: [
      {
        id: 'd3',
        title: 'Vitamin D3 + K2',
        supplierProductId: '901',
        variants: [{ id: 'v-d3', title: '90 softgels', flavour: null, size: '90 softgels', price: 8.27, compareAtPrice: null, available: true, sku: 'P51016' }],
      },
      {
        id: 'omega',
        title: 'Omega 3',
        variants: [{ id: 'v-omega', title: '120 caps', flavour: null, size: null, price: 19.31, compareAtPrice: null, available: false, inventory: 0, sku: 'P47499' }],
      },
    ],
  }),
}))
const claimFounderCodeForCheckout = jest.fn()
jest.mock('@/lib/founder-codes/redeem', () => ({
  claimFounderCodeForCheckout: (...a: unknown[]) => claimFounderCodeForCheckout(...a),
  markFounderCodeUsed: jest.fn(),
  releaseFounderCode: jest.fn(),
}))

import { POST } from '../route'

const cart = (lines: { variantId: string; quantity: number; source?: string }[]) =>
  POST(
    new Request('http://localhost/api/cart', {
      method: 'POST',
      body: JSON.stringify({
        lines: lines.map((l) => ({ ...l, attributes: [{ key: 'source', value: l.source ?? 'shop' }] })),
      }),
    }),
  )

beforeEach(() => {
  checkLiveStock.mockReset()
  claimFounderCodeForCheckout.mockClear()
})

describe('stock at checkout', () => {
  it('refuses an item the catalogue already knows is sold out', async () => {
    checkLiveStock.mockResolvedValue({ ran: true, confirmed: true, shortfalls: [], unconfirmed: [], live: [], error: null })
    const res = await cart([{ variantId: 'v-omega', quantity: 1 }])
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toBe('Sorry — Omega 3 has just sold out. Take it out of your basket and try again — you have not been charged.')
    expect(body.unavailable).toEqual([{ variantId: 'v-omega', sku: 'P47499', title: 'Omega 3', stock: 0 }])
    expect(claimFounderCodeForCheckout).not.toHaveBeenCalled()
  })

  it('asks PowerBody live, by product id, and refuses what they say is gone', async () => {
    checkLiveStock.mockResolvedValue({
      ran: true,
      confirmed: true,
      shortfalls: [{ sku: 'P51016', title: 'Vitamin D3 + K2 (90 softgels)', wanted: 1, stock: 0, reason: 'out-of-stock' }],
      unconfirmed: [],
      live: [{ sku: 'P51016', productId: '901', stock: 0, inStock: false, wholesalePrice: 4.8 }],
      error: null,
    })
    const res = await cart([{ variantId: 'v-d3', quantity: 1, source: 'quiz-stack-builder' }])
    expect(res.status).toBe(409)
    expect((await res.json()).error).toMatch(/Vitamin D3 \+ K2 \(90 softgels\) has just sold out\. Swap it in your stack/)
    expect(checkLiveStock).toHaveBeenCalledWith(
      [{ sku: 'P51016', quantity: 1, title: 'Vitamin D3 + K2 (90 softgels)', supplierProductId: '901' }],
      expect.objectContaining({ deadlineMs: 5000 }),
    )
  })

  it('says how many are left when there are some, but not enough', async () => {
    checkLiveStock.mockResolvedValue({
      ran: true,
      confirmed: true,
      shortfalls: [{ sku: 'P51016', title: 'Vitamin D3 + K2 (90 softgels)', wanted: 3, stock: 2, reason: 'not-enough' }],
      unconfirmed: [],
      live: [],
      error: null,
    })
    const res = await cart([{ variantId: 'v-d3', quantity: 3 }])
    expect((await res.json()).error).toBe(
      'Sorry — there are only 2 of Vitamin D3 + K2 (90 softgels) left. Lower the quantity and try again.',
    )
  })
})
