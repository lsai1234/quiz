import { createPowerBodyProvider, __resetPowerBodyCache } from '@/lib/supplier/powerbody/live'
import type { PowerBodySoapClient } from '@/lib/supplier/powerbody/soap'

/** A fake SOAP client driven by a per-method handler map. */
function fakeClient(handlers: Record<string, (args: unknown) => unknown>) {
  const calls: { path: string; args: unknown }[] = []
  const client: PowerBodySoapClient = {
    async call<T>(path: string, args?: unknown): Promise<T> {
      calls.push({ path, args })
      const handler = handlers[path]
      if (!handler) throw new Error(`unexpected call: ${path}`)
      return handler(args) as T
    },
    async endSession() {},
  }
  return { client, calls }
}

const LIST_PAGE_1 = [
  { product_id: '1', sku: 'PB-1', price: '10.00', price_tax: '12.00', qty: '5', vat_rate: '20' },
  { product_id: '2', sku: 'PB-2', price: '20.00', price_tax: '24.00', qty: '0', vat_rate: '20' },
]

const INFO: Record<string, unknown> = {
  1: { name: 'Whey 1kg', manufacturer: 'PB', category: 'Protein', detail_price: '19.99', status: 'active', weight: '1.15' },
  2: { name: 'Creatine', manufacturer: 'PB', category: 'Performance', detail_price: '29.99', status: 'active' },
}

/** getProductList paged, plus getProductInfo per product id. */
function catalogueHandlers() {
  return {
    'dropshipping.getProductList': (args: unknown) => {
      const page = (args as { page: number }).page
      return page === 1 ? LIST_PAGE_1 : []
    },
    'dropshipping.getProductInfo': (id: unknown) => INFO[String(id)] ?? null,
  }
}

describe('live PowerBody adapter', () => {
  beforeEach(() => __resetPowerBodyCache())
  afterEach(() => __resetPowerBodyCache())

  describe('listProducts', () => {
    it('pages the list feed and enriches each row with its detail', async () => {
      const { client, calls } = fakeClient(catalogueHandlers())
      const products = await createPowerBodyProvider({ client }).listProducts()

      expect(products).toHaveLength(2)
      expect(products[0]).toMatchObject({
        sku: 'PB-1',
        name: 'Whey 1kg',
        brand: 'PB',
        category: 'Protein',
        wholesalePrice: 10,
        rrp: 19.99,
        stock: 5,
        inStock: true,
        weightGrams: 1150,
      })
      // Stopped on the first empty page rather than walking to the cap.
      const listCalls = calls.filter((c) => c.path === 'dropshipping.getProductList')
      expect(listCalls).toHaveLength(2)
    })

    it('keeps the list row when a detail fetch fails', async () => {
      const { client } = fakeClient({
        ...catalogueHandlers(),
        'dropshipping.getProductInfo': () => {
          throw new Error('boom')
        },
      })
      const products = await createPowerBodyProvider({ client }).listProducts()

      // Stock and price survive, which is what keeps the catalogue sellable.
      expect(products).toHaveLength(2)
      expect(products[0]).toMatchObject({ sku: 'PB-1', stock: 5, inStock: true, wholesalePrice: 10 })
    })

    it('serves a second call from the cache', async () => {
      const { client, calls } = fakeClient(catalogueHandlers())
      const provider = createPowerBodyProvider({ client })
      await provider.listProducts()
      const before = calls.length
      await provider.listProducts()
      expect(calls.length).toBe(before)
    })

    it('drops rows with no SKU', async () => {
      const { client } = fakeClient({
        'dropshipping.getProductList': (args: unknown) =>
          (args as { page: number }).page === 1 ? [{ product_id: '9', price: '1.00', qty: '1' }] : [],
        'dropshipping.getProductInfo': () => null,
      })
      expect(await createPowerBodyProvider({ client }).listProducts()).toEqual([])
    })
  })

  describe('getStockLevels', () => {
    it('uses only the cheap list feed — never the per-product detail call', async () => {
      const { client, calls } = fakeClient(catalogueHandlers())
      const levels = await createPowerBodyProvider({ client }).getStockLevels()

      expect(levels).toEqual([
        { sku: 'PB-1', stock: 5, inStock: true, wholesalePrice: 10, rrp: 12, updatedAt: expect.any(String) },
        { sku: 'PB-2', stock: 0, inStock: false, wholesalePrice: 20, rrp: 24, updatedAt: expect.any(String) },
      ])
      // The whole point: a nightly stock check must not fan out to thousands of
      // getProductInfo calls.
      expect(calls.some((c) => c.path === 'dropshipping.getProductInfo')).toBe(false)
    })

    it('narrows to the requested SKUs', async () => {
      const { client } = fakeClient(catalogueHandlers())
      const levels = await createPowerBodyProvider({ client }).getStockLevels(['PB-2'])
      expect(levels.map((l) => l.sku)).toEqual(['PB-2'])
    })

    it('always goes to the wire, even after a catalogue build cached products', async () => {
      const { client, calls } = fakeClient(catalogueHandlers())
      const provider = createPowerBodyProvider({ client })
      await provider.listProducts()
      const before = calls.filter((c) => c.path === 'dropshipping.getProductList').length
      await provider.getStockLevels()
      expect(calls.filter((c) => c.path === 'dropshipping.getProductList').length).toBeGreaterThan(before)
    })
  })

  describe('placeOrder', () => {
    const order = {
      reference: 'ord_1',
      shippingAddress: { name: 'Ada Lovelace', line1: '12 Dean St', city: 'London', postcode: 'W1D 3RR', country: 'GB' },
      lines: [{ sku: 'PB-1', quantity: 2 }],
    }

    it('sends createOrder and returns their order id', async () => {
      const { client, calls } = fakeClient({
        'dropshipping.createOrder': () => ({
          api_response: 'SUCCESS',
          powerbody_order_id: '100012345',
          status: 'holded',
        }),
      })

      const result = await createPowerBodyProvider({ client }).placeOrder(order)

      expect(result).toEqual({ supplierOrderId: '100012345', status: 'received' })
      expect(calls[0].path).toBe('dropshipping.createOrder')
      expect(calls[0].args).toMatchObject({ id: 'ord_1', products: [{ sku: 'PB-1', qty: 2 }] })
    })

    it('treats ALREADY_EXISTS as success so a retry does not double-ship', async () => {
      const { client } = fakeClient({
        'dropshipping.createOrder': () => ({ api_response: 'ALREADY_EXISTS' }),
      })
      const result = await createPowerBodyProvider({ client }).placeOrder(order)
      // No id of theirs came back, so our own reference stays the handle.
      expect(result.supplierOrderId).toBe('ord_1')
    })

    it('throws on a rejection, making clear nothing shipped', async () => {
      const { client } = fakeClient({ 'dropshipping.createOrder': () => ({ api_response: 'FAIL' }) })
      await expect(createPowerBodyProvider({ client }).placeOrder(order)).rejects.toThrow(
        /rejected order ord_1: FAIL[\s\S]*Nothing has shipped/,
      )
    })

    it('passes caller-supplied weight and prices through to their payload', async () => {
      const { client, calls } = fakeClient({
        'dropshipping.createOrder': () => ({ api_response: 'SUCCESS' }),
      })
      await createPowerBodyProvider({
        client,
        orderContext: () => ({ weightKg: 2.3, shippingPrice: 4.99, lineDetail: { 'PB-1': { price: 39.99 } } }),
      }).placeOrder(order)

      expect(calls[0].args).toMatchObject({
        weight: 2.3,
        shipping_price: 4.99,
        products: [expect.objectContaining({ price: 39.99 })],
      })
    })
  })

  describe('getOrder / listOrders', () => {
    const rows = [
      { order_id: 'ord_1', powerbody_order_id: '1001', status: 'processing', tracking_number: 'TRK1' },
      { order_id: 'ord_2', powerbody_order_id: '1002', status: 'complete', tracking_number: 'TRK2' },
    ]

    it('finds an order by our reference', async () => {
      const { client } = fakeClient({ 'dropshipping.getOrders': () => rows })
      const found = await createPowerBodyProvider({ client }).getOrder('ord_2')
      expect(found).toMatchObject({ supplierOrderId: '1002', reference: 'ord_2', status: 'shipped' })
    })

    it('also finds it by their increment id', async () => {
      const { client } = fakeClient({ 'dropshipping.getOrders': () => rows })
      const found = await createPowerBodyProvider({ client }).getOrder('1001')
      expect(found).toMatchObject({ reference: 'ord_1', status: 'processing', trackingNumber: 'TRK1' })
    })

    it('returns null when the order is unknown', async () => {
      const { client } = fakeClient({ 'dropshipping.getOrders': () => [] })
      expect(await createPowerBodyProvider({ client }).getOrder('nope')).toBeNull()
    })

    it('tolerates a null reply rather than throwing', async () => {
      const { client } = fakeClient({ 'dropshipping.getOrders': () => null })
      expect(await createPowerBodyProvider({ client }).listOrders()).toEqual([])
    })
  })
})
