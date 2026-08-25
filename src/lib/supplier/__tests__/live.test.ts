import { createPowerBodyProvider, __resetPowerBodyCache } from '@/lib/supplier/powerbody/live'
import type { PowerBodySoapClient } from '@/lib/supplier/powerbody/soap'
import { createMemoryDetailStore, DETAIL_TTL_MS } from '@/lib/supplier/powerbody/detail-cache'

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

/** The product id out of either argument shape the adapter may send. */
function detailId(args: unknown): string {
  return String(args && typeof args === 'object' ? (args as { product_id?: unknown }).product_id : args)
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
    'dropshipping.getProductInfo': (args: unknown) => INFO[detailId(args)] ?? null,
  }
}

describe('live PowerBody adapter', () => {
  beforeEach(() => __resetPowerBodyCache())
  afterEach(() => __resetPowerBodyCache())


  describe('getProductsById', () => {
    /**
     * The reason the method exists. Resolving a SKU means paging the list feed
     * until its row turns up, and a SKU that is NOT in the feed can never stop
     * that walk — so it reads the whole catalogue and usually dies on the build
     * deadline, reporting a timeout for what is really "no such product". An id
     * needs no search, so nothing here may touch getProductList.
     */
    it('never pages the list feed', async () => {
      const { client, calls } = fakeClient(catalogueHandlers())
      const products = await createPowerBodyProvider({
        client,
        detailStore: createMemoryDetailStore(),
      }).getProductsById(['1'])

      expect(calls.map((c) => c.path)).toEqual(['dropshipping.getProductInfo'])
      expect(products).toHaveLength(1)
      expect(products[0]).toMatchObject({ name: 'Whey 1kg', brand: 'PB' })
    })

    it('puts the id back on the product even when their reply omits it', async () => {
      const { client } = fakeClient(catalogueHandlers())
      const [product] = await createPowerBodyProvider({
        client,
        detailStore: createMemoryDetailStore(),
      }).getProductsById(['1'])

      // INFO carries no product_id — the caller's id is the authority here.
      expect(product.productId).toBe('1')
    })

    /**
     * Unlike the SKU path, there is no feed here to tell "no such product"
     * apart from "getProductInfo is refusing us" — PowerBody answer both with
     * nothing. So a lone id that resolves to nothing says what they sent rather
     * than returning an empty list, which is the shape that once turned a
     * disabled detail call into a page that simply would not fill in.
     */
    it('says what PowerBody sent when an id resolves to nothing', async () => {
      const { client } = fakeClient({ 'dropshipping.getProductInfo': () => null })
      await expect(
        createPowerBodyProvider({ client, detailStore: createMemoryDetailStore() }).getProductsById(['nope']),
      ).rejects.toThrow('no product detail in it')
    })

    /**
     * The SKU path may trust cached detail because it overlays today's list row
     * on top, so price and stock always come from the feed. There is no list row
     * here, so a cached entry would be the ONLY source — and serving a week-old
     * price is the one thing this cache must never do.
     */
    it('re-fetches rather than serving a cached price or stock level', async () => {
      const store = createMemoryDetailStore({
        1: { info: { name: 'Whey 1kg', price: '99.00', qty: '0', status: 'active' }, at: Date.now() },
      })
      const { client, calls } = fakeClient({
        'dropshipping.getProductInfo': () => ({ name: 'Whey 1kg', price: '10.00', qty: '5', status: 'active' }),
      })

      const [product] = await createPowerBodyProvider({ client, detailStore: store }).getProductsById(['1'])

      expect(calls).toHaveLength(1)
      expect(product.wholesalePrice).toBe(10)
      expect(product.stock).toBe(5)
    })

    it('keeps what it fetched, so a later lookup of the same product is free', async () => {
      const store = createMemoryDetailStore()
      const { client } = fakeClient(catalogueHandlers())
      await createPowerBodyProvider({ client, detailStore: store }).getProductsById(['1'])

      expect(await store.load()).toHaveProperty('1.info.name', 'Whey 1kg')
    })

    it('one unreadable id does not lose the others', async () => {
      const { client } = fakeClient({
        'dropshipping.getProductInfo': (args: unknown) => {
          if (detailId(args) === 'bad') throw new Error('Access denied')
          return INFO[detailId(args)] ?? null
        },
      })
      const products = await createPowerBodyProvider({
        client,
        detailStore: createMemoryDetailStore(),
      }).getProductsById(['bad', '1'])

      expect(products.map((p) => p.name)).toEqual(['Whey 1kg'])
    })

    /** "PowerBody refused" and "no such product" must not look the same. */
    it('reports their own words when nothing at all resolved', async () => {
      const { client } = fakeClient({
        'dropshipping.getProductInfo': () => {
          throw new Error('Access denied')
        },
      })
      await expect(
        createPowerBodyProvider({ client, detailStore: createMemoryDetailStore() }).getProductsById(['1']),
      ).rejects.toThrow('Access denied')
    })
  })

  describe('getProductInfo argument shape', () => {
    /**
     * Their guide, page 11: "Parameters: (int) product id", with the example
     * `call($session, 'dropshipping.getProductInfo', $productId)` — a raw id,
     * not JSON. It is the one method here that does not take a JSON string.
     * We used to send `{product_id}` first by analogy with getProductList's
     * `{page}`, which burned a wasted call on a rate-limited API for every
     * single product fetched.
     */
    it('sends the documented bare id first, not a JSON object', async () => {
      const { client, calls } = fakeClient(catalogueHandlers())
      await createPowerBodyProvider({ client, detailStore: createMemoryDetailStore() }).getProductsById(['1'])

      const detail = calls.filter((c) => c.path === 'dropshipping.getProductInfo')
      expect(detail).toHaveLength(1)
      expect(detail[0].args).toBe('1')
    })

    /** Kept as a fallback: free when the first shape works, and it guards the
     *  far worse failure of every product arriving unnamed. */
    it('still falls back to the named shape when the bare id is refused', async () => {
      const { client, calls } = fakeClient({
        'dropshipping.getProductInfo': (args: unknown) =>
          typeof args === 'object' && args !== null ? INFO['1'] : null,
      })
      const [product] = await createPowerBodyProvider({
        client,
        detailStore: createMemoryDetailStore(),
      }).getProductsById(['1'])

      expect(product.name).toBe('Whey 1kg')
      expect(calls.map((c) => c.args)).toEqual(['1', { product_id: '1' }])
    })
  })

  describe('getStockLevels', () => {
    it('uses only the cheap list feed — never the per-product detail call', async () => {
      const { client, calls } = fakeClient(catalogueHandlers())
      const levels = await createPowerBodyProvider({ client }).getStockLevels()

      expect(levels).toEqual([
        { sku: 'PB-1', productId: '1', stock: 5, inStock: true, wholesalePrice: 10, rrp: 12, updatedAt: expect.any(String) },
        { sku: 'PB-2', productId: '2', stock: 0, inStock: false, wholesalePrice: 20, rrp: 24, updatedAt: expect.any(String) },
      ])
      // The whole point: a nightly stock check must not fan out to thousands of
      // getProductInfo calls.
      expect(calls.some((c) => c.path === 'dropshipping.getProductInfo')).toBe(false)
    })

    /**
     * The verdict `getStockLevels` used to drop on the floor. Exporting asks
     * "what does this account NOT carry?", and a short read answers that wrongly
     * while looking exactly like a right answer — every SKU on the unread pages
     * reads as absent, and someone strikes real products off a roster for it.
     */
    it('says the feed was complete when it reached the end', async () => {
      const { client } = fakeClient(catalogueHandlers())
      const feed = await createPowerBodyProvider({ client }).getFeed()

      expect(feed.complete).toBe(true)
      expect(feed.levels.map((l) => l.sku)).toEqual(['PB-1', 'PB-2'])
    })

    /**
     * The bug this exists for. A real export stopped dead on the page budget at
     * 3,000 products, and because the feed is ordered by product id every SKU
     * beyond that point read as "not on the account" — including five the
     * founder had physically ordered the month before.
     */
    it('admits a short read, and says where to resume from', async () => {
      // A feed that never returns an empty page: the pager spends its budget.
      const endless = {
        'dropshipping.getProductList': (args: unknown) => {
          const page = (args as { page: number }).page
          return [{ product_id: String(page), sku: `PB-${page}`, price: '1.00', qty: '1' }]
        },
      }
      const { client } = fakeClient(endless)
      const feed = await createPowerBodyProvider({ client }).getFeed({ pageBudget: 3 })

      expect(feed.complete).toBe(false)
      // The rows it did read are still real and still usable.
      expect(feed.levels.map((l) => l.sku)).toEqual(['PB-1', 'PB-2', 'PB-3'])
      // The difference between a ceiling and a pause.
      expect(feed.nextPage).toBe(4)
    })

    it('resumes from where the last pass stopped, not from the beginning', async () => {
      const { client, calls } = fakeClient({
        'dropshipping.getProductList': (args: unknown) => {
          const page = (args as { page: number }).page
          return page <= 5 ? [{ product_id: String(page), sku: `PB-${page}`, price: '1.00', qty: '1' }] : []
        },
      })
      const feed = await createPowerBodyProvider({ client }).getFeed({ fromPage: 4 })

      expect(feed.levels.map((l) => l.sku)).toEqual(['PB-4', 'PB-5'])
      expect(feed.complete).toBe(true)
      expect(feed.nextPage).toBeNull()
      // It must not re-read pages 1–3 the caller already has.
      expect(calls.map((c) => (c.args as { page: number }).page)).toEqual([4, 5, 6])
    })

    it('reports the end of the feed rather than a resume point', async () => {
      const { client } = fakeClient(catalogueHandlers())
      const feed = await createPowerBodyProvider({ client }).getFeed()

      expect(feed.complete).toBe(true)
      expect(feed.nextPage).toBeNull()
    })

    it('narrows to the requested SKUs', async () => {
      const { client } = fakeClient(catalogueHandlers())
      const levels = await createPowerBodyProvider({ client }).getStockLevels(['PB-2'])
      expect(levels.map((l) => l.sku)).toEqual(['PB-2'])
    })

    it('always goes to the wire, even right after a lookup read the same feed', async () => {
      // The daily stock check is the one thing that must never be served from a
      // cache: it exists to notice what moved.
      const { client, calls } = fakeClient(catalogueHandlers())
      const provider = createPowerBodyProvider({ client, detailStore: createMemoryDetailStore() })
      await provider.getProductsBySku(['PB-1'])
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
