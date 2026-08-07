import {
  createPowerBodyProvider,
  getPowerBodyCatalogueProgress,
  __resetPowerBodyCache,
} from '@/lib/supplier/powerbody/live'
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

  describe('listProducts', () => {
    it('pages the list feed and maps every row from it', async () => {
      const { client, calls } = fakeClient(catalogueHandlers())
      const products = await createPowerBodyProvider({ client, detailStore: createMemoryDetailStore() }).listProducts()

      expect(products).toHaveLength(2)
      // Everything the cheap feed carries — the commercial half — is right, and
      // the descriptive half is honestly marked as not fetched.
      expect(products[0]).toMatchObject({
        sku: 'PB-1',
        name: 'PB-1',
        wholesalePrice: 10,
        stock: 5,
        inStock: true,
        detailed: false,
      })
      // Stopped on the first empty page rather than walking to the cap.
      const listCalls = calls.filter((c) => c.path === 'dropshipping.getProductList')
      expect(listCalls).toHaveLength(2)
      expect(calls.some((c) => c.path === 'dropshipping.getProductInfo')).toBe(false)
    })

    it('serves a second call from the cache', async () => {
      const { client, calls } = fakeClient(catalogueHandlers())
      const provider = createPowerBodyProvider({ client, detailStore: createMemoryDetailStore() })
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
      expect(await createPowerBodyProvider({ client, detailStore: createMemoryDetailStore() }).listProducts()).toEqual([])
    })
  })

  describe('browsing never pays for detail', () => {
    /** A feed of `n` products that counts any detail call made against it. */
    function bigFeed(n: number) {
      const rows = Array.from({ length: n }, (_, i) => ({
        product_id: String(i + 1),
        sku: `PB-${i + 1}`,
        price: '10.00',
        qty: '5',
      }))
      let infoCalls = 0
      const handlers = {
        'dropshipping.getProductList': (args: unknown) =>
          (args as { page: number }).page === 1 ? rows : [],
        'dropshipping.getProductInfo': (args: unknown) => {
          infoCalls += 1
          return { name: `Product ${detailId(args)}`, manufacturer: 'PB', category: 'Protein' }
        },
      }
      return { handlers, infoCalls: () => infoCalls }
    }

    it('makes no getProductInfo calls at all, however big the feed', async () => {
      // The point of the split: detailing a catalogue is one throttled call per
      // product, and the browse list is not worth that. Detail is fetched for the
      // product being opened or added, never for the whole feed.
      const feed = bigFeed(500)
      const { client } = fakeClient(feed.handlers)

      const products = await createPowerBodyProvider({
        client,
        detailStore: createMemoryDetailStore(),
      }).listProducts()

      expect(feed.infoCalls()).toBe(0)
      expect(products).toHaveLength(500)
    })

    it('returns undetailed products with their list-feed data intact', async () => {
      const feed = bigFeed(5)
      const { client } = fakeClient(feed.handlers)
      const products = await createPowerBodyProvider({
        client,
        detailStore: createMemoryDetailStore(),
      }).listProducts()

      // No name yet, but price and stock are correct — so the row is honest and
      // orderable, and `detailed` says the descriptive half is a placeholder.
      expect(products[4]).toMatchObject({
        sku: 'PB-5',
        name: 'PB-5',
        wholesalePrice: 10,
        stock: 5,
        inStock: true,
        detailed: false,
      })
    })

    it('wears detail the cache already holds, without fetching any', async () => {
      const feed = bigFeed(3)
      const cached = { '2': { info: { name: 'Creatine', manufacturer: 'PB' }, at: Date.now() } }
      const { client } = fakeClient(feed.handlers)

      const products = await createPowerBodyProvider({
        client,
        detailStore: createMemoryDetailStore(cached),
      }).listProducts()

      expect(feed.infoCalls()).toBe(0)
      expect(products[1]).toMatchObject({ sku: 'PB-2', name: 'Creatine', detailed: true })
      expect(products[0]).toMatchObject({ sku: 'PB-1', detailed: false })
    })

    it('ignores cached detail that has gone stale rather than showing it', async () => {
      const feed = bigFeed(2)
      const stale = { '1': { info: { name: 'Old name' }, at: Date.now() - DETAIL_TTL_MS - 1 } }
      const { client } = fakeClient(feed.handlers)

      const products = await createPowerBodyProvider({
        client,
        detailStore: createMemoryDetailStore(stale),
      }).listProducts()

      // Not re-fetched here (that happens when the product is opened or added),
      // and not shown either — a name a week out of date is not worth trusting.
      expect(feed.infoCalls()).toBe(0)
      expect(products[0]).toMatchObject({ sku: 'PB-1', name: 'PB-1', detailed: false })
    })

    it('reports how much of the list carries detail', async () => {
      const feed = bigFeed(20)
      const cached = {
        '1': { info: { name: 'One' }, at: Date.now() },
        '2': { info: { name: 'Two' }, at: Date.now() },
      }
      const { client } = fakeClient(feed.handlers)
      await createPowerBodyProvider({ client, detailStore: createMemoryDetailStore(cached) }).listProducts()

      expect(getPowerBodyCatalogueProgress()).toMatchObject({ total: 20, detailed: 2, listComplete: true })
    })

    it('takes price and stock from today’s feed, never from cached detail', async () => {
      // The one thing a detail cache must never do is serve a stale price.
      const cached = {
        '1': {
          info: { name: 'Whey', manufacturer: 'PB', price: '999.00', qty: '999', detail_price: '19.99' },
          at: Date.now(),
        },
      }
      const { client } = fakeClient({
        'dropshipping.getProductList': (args: unknown) =>
          (args as { page: number }).page === 1
            ? [{ product_id: '1', sku: 'PB-1', price: '11.50', qty: '7' }]
            : [],
        'dropshipping.getProductInfo': () => null,
      })

      const products = await createPowerBodyProvider({
        client,
        detailStore: createMemoryDetailStore(cached),
      }).listProducts()

      expect(products[0]).toMatchObject({
        name: 'Whey', // from the cache
        wholesalePrice: 11.5, // from today's feed
        stock: 7,
        rrp: 19.99, // detail-only field survives
      })
    })
  })

  describe('time budget', () => {
    /** A clock we control, so "slow supplier" is testable without being slow. */
    function fakeClock() {
      let now = 1_000_000
      jest.spyOn(Date, 'now').mockImplementation(() => now)
      return { advance: (ms: number) => (now += ms) }
    }

    afterEach(() => jest.restoreAllMocks())

    /** `pages` pages of `perPage` rows, with a hook to burn time per page. */
    function pagedFeed(pages: number, perPage: number, onCall: () => void = () => {}) {
      return {
        'dropshipping.getProductList': (args: unknown) => {
          const page = (args as { page: number }).page
          onCall()
          if (page > pages) return []
          return Array.from({ length: perPage }, (_, i) => {
            const n = (page - 1) * perPage + i + 1
            return { product_id: String(n), sku: `PB-${n}`, price: '10.00', qty: '5' }
          })
        },
        'dropshipping.getProductInfo': () => null,
      }
    }

    it('stops paging when the budget is spent and returns what it has', async () => {
      const clock = fakeClock()
      const { client } = fakeClient(pagedFeed(5, 10, () => clock.advance(15_000)))

      const products = await createPowerBodyProvider({
        client,
        detailStore: createMemoryDetailStore(),
        buildDeadlineMs: 20_000,
      }).listProducts()

      // Two pages in, the clock is past the budget. A short catalogue that
      // arrives is the whole point — the alternative is a request that never
      // answers and a hub stuck on "Loading…".
      expect(products).toHaveLength(20)
      expect(getPowerBodyCatalogueProgress()).toMatchObject({ listComplete: false, timeBudgetSpent: true })
    })

    it('holds a cut-short catalogue only briefly, so the next load gets further', async () => {
      const clock = fakeClock()
      const { client, calls } = fakeClient(pagedFeed(5, 10, () => clock.advance(15_000)))
      const provider = createPowerBodyProvider({
        client,
        detailStore: createMemoryDetailStore(),
        buildDeadlineMs: 20_000,
      })

      await provider.listProducts()
      const afterFirst = calls.length
      await provider.listProducts()
      expect(calls.length).toBe(afterFirst) // still cached

      clock.advance(60_000)
      await provider.listProducts()
      expect(calls.length).toBeGreaterThan(afterFirst) // and now it tries again
    })

    it('gives up on a call that never answers, rather than hanging the request', async () => {
      // The case that matters most: one wire call can outlast the whole budget
      // by itself (30s per attempt, retried), so checking the clock only between
      // calls would still leave the hub on a spinner for minutes.
      const { client } = fakeClient({
        'dropshipping.getProductList': () => new Promise(() => {}),
        'dropshipping.getProductInfo': () => null,
      })

      await expect(
        createPowerBodyProvider({
          client,
          detailStore: createMemoryDetailStore(),
          buildDeadlineMs: 40,
        }).listProducts(),
      ).rejects.toThrow(/did not answer within/i)
    })

    it('keeps the pages that did land when the supplier stalls mid-feed', async () => {
      let page = 0
      const { client } = fakeClient({
        'dropshipping.getProductList': () => {
          page += 1
          // First page answers; the second never does.
          if (page > 1) return new Promise(() => {})
          return [{ product_id: '1', sku: 'PB-1', price: '10.00', qty: '5' }]
        },
        'dropshipping.getProductInfo': () => null,
      })

      const products = await createPowerBodyProvider({
        client,
        detailStore: createMemoryDetailStore(),
        buildDeadlineMs: 60,
      }).listProducts()

      expect(products.map((p) => p.sku)).toEqual(['PB-1'])
      expect(getPowerBodyCatalogueProgress()).toMatchObject({ listComplete: false })
    })

    it('a SKU lookup against a silent supplier fails loudly, not as "not found"', async () => {
      const { client } = fakeClient({
        'dropshipping.getProductList': () => new Promise(() => {}),
        'dropshipping.getProductInfo': () => null,
      })

      await expect(
        createPowerBodyProvider({
          client,
          detailStore: createMemoryDetailStore(),
          buildDeadlineMs: 40,
        }).getProductsBySku(['PB-1']),
      ).rejects.toThrow(/did not answer within/i)
    })

    it('carries on from where the clock stopped it, instead of re-reading page one', async () => {
      // "The feed was only partly paged, more will appear on a refresh" was a
      // promise the code could not keep: every build restarted at page one and
      // hit the same wall in the same place, so the far end of a big feed was
      // unreachable however many times you refreshed.
      const clock = fakeClock()
      const seen: number[] = []
      const { client } = fakeClient({
        'dropshipping.getProductList': (args: unknown) => {
          const page = (args as { page: number }).page
          seen.push(page)
          clock.advance(15_000)
          if (page > 4) return []
          return [{ product_id: String(page), sku: `PB-${page}`, price: '10.00', qty: '5' }]
        },
        'dropshipping.getProductInfo': () => null,
      })
      const provider = () =>
        createPowerBodyProvider({
          client,
          detailStore: createMemoryDetailStore(),
          buildDeadlineMs: 20_000,
        })

      const first = await provider().listProducts()
      expect(first.map((p) => p.sku)).toEqual(['PB-1', 'PB-2'])
      expect(getPowerBodyCatalogueProgress()).toMatchObject({ listComplete: false })

      // A later load (the cached partial has expired) resumes at page 3 and
      // keeps what page 1 and 2 gave — the list grows rather than repeating.
      clock.advance(60_000)
      const second = await provider().listProducts()

      expect(seen).toEqual([1, 2, 3, 4])
      expect(second.map((p) => p.sku)).toEqual(['PB-1', 'PB-2', 'PB-3', 'PB-4'])
    })

    it('shares one build between callers that arrive together', async () => {
      const { client, calls } = fakeClient(catalogueHandlers())
      const provider = createPowerBodyProvider({ client, detailStore: createMemoryDetailStore() })

      // Two founders hitting Refresh at once must not double the load on a
      // supplier that is already rate-limiting us.
      const [a, b] = await Promise.all([provider.listProducts(), provider.listProducts()])

      expect(a).toEqual(b)
      expect(calls.filter((c) => c.path === 'dropshipping.getProductList')).toHaveLength(2)
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
