/**
 * What actually reaches the supplier when an order is sent.
 *
 * Two separate concerns, both of which used to be nobody's job:
 *
 *  1. **The invoice fields.** PowerBody print a picking list and an invoice and
 *     put them IN THE PARCEL, naming us as the seller. The product names and the
 *     prices the customer paid come from us — send neither and the customer
 *     opens a box containing a document listing blanks at £0.00. The builder
 *     existed; nothing ever called it with anything.
 *
 *  2. **The address guards.** `submitOrderToSupplier` used to substitute an
 *     empty address for a missing one and send it anyway. The queue flags both a
 *     missing address and an undeliverable one, but the queue is a screen —
 *     these are enforced in the domain, alongside the approval and ordering
 *     gates, so a cron or a future caller cannot get past them.
 */
import {
  approveOrderForSupplier,
  createOrderFromCheckout,
  orderParcel,
  orderWeightKg,
  submitOrderToSupplier,
} from '@/lib/orders/service'
import { setOrderingOverride } from '@/lib/supplier/ordering'
import type { OrderLine } from '@/lib/orders/types'
import type { SupplierOrderInput } from '@/lib/supplier/types'

// Typed with its argument so the assertions below can read what was sent.
const placeOrder = jest.fn(async (input: SupplierOrderInput) => ({
  supplierOrderId: `PB-${input.reference}`,
  status: 'received' as const,
}))

// The simulator is a real provider — an order in simulate mode walks the same
// path and builds the same payload, which is what makes a dry run worth running.
jest.mock('@/lib/supplier/powerbody/mock', () => ({
  createMockSupplier: () => ({
    name: 'mock',
    getProduct: async () => null,
    getProductsBySku: async () => [],
    sampleSkus: async () => [],
    getStockLevels: async () => [],
    placeOrder,
    getOrder: async () => null,
    listOrders: async () => [],
  }),
}))

jest.mock('@/lib/catalogue/resolve', () => ({
  getResolvedCatalogue: async () => ({
    products: [
      { id: 'creatine', weightGrams: 500, vatRate: 0.2 },
      { id: 'bar', weightGrams: null, vatRate: 0 },
    ],
  }),
}))

const ADDRESS = {
  name: 'Sam Taylor',
  line1: '1 High Street',
  city: 'Leeds',
  postcode: 'LS1 4DY',
  country: 'GB',
}

const LINES: OrderLine[] = [
  {
    sku: 'ON-CREA-634',
    productId: 'creatine',
    title: 'Creatine Monohydrate',
    variantTitle: 'Unflavoured',
    quantity: 2,
    unitPrice: 27.99,
    supplierCost: 16,
  },
]

async function sendableOrder(overrides: Partial<Parameters<typeof createOrderFromCheckout>[0]> = {}) {
  const order = await createOrderFromCheckout({
    channel: 'shop',
    email: 'sam@example.com',
    lines: LINES,
    shippingAddress: ADDRESS,
    ...overrides,
  })
  await approveOrderForSupplier(order.id, 'Test founder')
  return order
}

/** What `placeOrder` was handed on the last call. */
function sent(): SupplierOrderInput {
  const call = placeOrder.mock.calls.at(-1)
  if (!call) throw new Error('placeOrder was never called')
  return call[0]
}

beforeEach(() => {
  placeOrder.mockClear()
  setOrderingOverride('simulate')
})

afterAll(() => setOrderingOverride(null))

describe('what we send the supplier', () => {
  it('names each line and prices it at what the customer paid', async () => {
    const order = await sendableOrder()
    await submitOrderToSupplier(order.id)

    expect(sent().lines).toEqual([
      {
        sku: 'ON-CREA-634',
        quantity: 2,
        name: 'Creatine Monohydrate — Unflavoured',
        unitPrice: 27.99,
        taxPercent: 20,
      },
    ])
  })

  it('sends the delivery we charged, not a zero', async () => {
    const order = await sendableOrder({ shipping: 3.9 })
    await submitOrderToSupplier(order.id)
    expect(sent().shippingPrice).toBe(3.9)
  })

  it('gives the courier an email when the address has none', async () => {
    // Their guide wants an email OR a phone for verification codes. A member who
    // subscribed before phone collection was switched on has only the former,
    // and it lives on the order rather than in the address block.
    const order = await sendableOrder()
    await submitOrderToSupplier(order.id)
    expect(sent().shippingAddress.email).toBe('sam@example.com')
  })

  it('sends our customer-facing reference as the comment', async () => {
    const order = await sendableOrder()
    await submitOrderToSupplier(order.id)
    expect(sent().comment).toMatch(/^CHRGD-/)
  })
})

describe('address guards', () => {
  it('refuses an order with no delivery address instead of inventing an empty one', async () => {
    // The mock-payments checkout raises orders with no address at all, so this
    // is reachable without anything going wrong upstream.
    const order = await sendableOrder({ shippingAddress: null })
    await expect(submitOrderToSupplier(order.id)).rejects.toThrow(/no delivery address/)
    expect(placeOrder).not.toHaveBeenCalled()
  })

  it('refuses an address PowerBody will not ship to', async () => {
    // Belfast is a UK address in PowerBody's own Zone 2 and looks entirely
    // ordinary — nothing warns you until the supplier refuses it.
    const order = await sendableOrder({
      shippingAddress: { ...ADDRESS, city: 'Belfast', postcode: 'BT1 5GS' },
    })
    await expect(submitOrderToSupplier(order.id)).rejects.toThrow(/Northern Ireland/)
    expect(placeOrder).not.toHaveBeenCalled()
  })
})

describe('orderWeightKg', () => {
  const catalogue = [
    { id: 'creatine', weightGrams: 500 },
    { id: 'whey', weightGrams: 1000 },
    { id: 'bar', weightGrams: null },
  ]

  it('totals the parcel when every line has a weight', () => {
    expect(
      orderWeightKg([{ productId: 'creatine', quantity: 2 }, { productId: 'whey', quantity: 1 }], catalogue),
    ).toBe(2)
  })

  it('estimates a line with no weight rather than sending none', () => {
    // Every order asks for a service by weight — Royal Mail up to 7 kg — so a
    // product with no weight counts as 1 kg (no label size to read here).
    expect(orderWeightKg([{ productId: 'creatine', quantity: 1 }, { productId: 'bar', quantity: 1 }], catalogue)).toBe(1.5)
    expect(orderWeightKg([{ productId: 'ghost', quantity: 1 }], catalogue)).toBe(1)
    expect(orderWeightKg([], catalogue)).toBeNull()
  })

  it('reads the size on the label, plus packaging, before falling back to 1 kg', () => {
    const products = [{ id: 'tub', weightGrams: null, variants: [{ sku: 'TUB-2KG', size: '2kg' }] }] as never
    expect(orderParcel([{ productId: 'tub', sku: 'TUB-2KG', quantity: 1 }], products)).toEqual({ grams: 2300, known: false })
    // A line's own snapshot beats everything.
    expect(orderParcel([{ productId: 'tub', sku: 'TUB-2KG', quantity: 1, weightGrams: 2100 }], products)).toEqual({ grams: 2100, known: true })
  })
})
