import { createPowerBodyProvider, __resetPowerBodyCache } from '@/lib/supplier/powerbody/live'
import { createMemoryDetailStore } from '@/lib/supplier/powerbody/detail-cache'
import { createMockSupplier } from '@/lib/supplier/powerbody/mock'
import { POWERBODY_FIXTURES } from '@/lib/supplier/powerbody/fixtures'
import { parseSkuInput, readSkuList } from '@/lib/supplier/sku-input'
import type { PowerBodySoapClient } from '@/lib/supplier/powerbody/soap'

/** The product id out of either argument shape the adapter may send. */
function detailId(args: unknown): string {
  return String(args && typeof args === 'object' ? (args as { product_id?: unknown }).product_id : args)
}

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

/** A feed of `n` products, none of them detailed yet. */
function feedOf(n: number) {
  const rows = Array.from({ length: n }, (_, i) => ({
    product_id: String(i + 1),
    sku: `PB-${i + 1}`,
    price: '10.00',
    qty: '5',
  }))
  let infoCalls: string[] = []
  return {
    handlers: {
      'dropshipping.getProductList': (args: unknown) => ((args as { page: number }).page === 1 ? rows : []),
      'dropshipping.getProductInfo': (args: unknown) => {
        const id = detailId(args)
        infoCalls.push(id)
        return { name: `Product ${id}`, manufacturer: 'PB', category: 'Protein', detail_price: '19.99' }
      },
    },
    infoCalls: () => infoCalls,
    reset: () => {
      infoCalls = []
    },
  }
}

describe('parseSkuInput', () => {
  it('splits on commas, spaces and new lines', () => {
    expect(parseSkuInput('A-1, B-2\nC-3  D-4;E-5')).toEqual(['A-1', 'B-2', 'C-3', 'D-4', 'E-5'])
  })

  it('de-dupes and drops empties', () => {
    expect(parseSkuInput(' A-1,,A-1 ,  ')).toEqual(['A-1'])
  })

  it('is empty for an empty paste', () => {
    expect(parseSkuInput('   \n ')).toEqual([])
  })

  it('readSkuList takes either a pasted string or an array', () => {
    expect(readSkuList('A-1, B-2')).toEqual(['A-1', 'B-2'])
    expect(readSkuList([' A-1 ', 'B-2', 'A-1', ''])).toEqual(['A-1', 'B-2'])
    expect(readSkuList(undefined)).toEqual([])
    expect(readSkuList(42)).toEqual([])
  })
})

describe('getProductsBySku — live', () => {
  beforeEach(() => __resetPowerBodyCache())
  afterEach(() => __resetPowerBodyCache())

  it('details exactly the requested SKUs and nothing else', async () => {
    const feed = feedOf(500)
    const { client } = fakeClient(feed.handlers)
    // 500 products in the feed, two asked for: two detail calls, no more.
    const provider = createPowerBodyProvider({
      client,
      detailStore: createMemoryDetailStore(),
    })

    const products = await provider.getProductsBySku(['PB-400', 'PB-401'])

    expect(feed.infoCalls().sort()).toEqual(['400', '401'])
    expect(products).toHaveLength(2)
    expect(products[0]).toMatchObject({ sku: 'PB-400', name: 'Product 400', brand: 'PB', rrp: 19.99 })
  })

  it('stops paging once every requested SKU has turned up', async () => {
    // A lookup is the fast path into the feed, so it must not walk pages it has
    // no reason to read — that is what made "add this one SKU" feel as slow as
    // building the whole catalogue.
    const pages: Record<number, { product_id: string; sku: string; price: string; qty: string }[]> = {
      1: [{ product_id: '1', sku: 'PB-1', price: '10.00', qty: '5' }],
      2: [{ product_id: '2', sku: 'PB-2', price: '10.00', qty: '5' }],
      3: [{ product_id: '3', sku: 'PB-3', price: '10.00', qty: '5' }],
    }
    const { client, calls } = fakeClient({
      'dropshipping.getProductList': (args: unknown) => pages[(args as { page: number }).page] ?? [],
      'dropshipping.getProductInfo': (args: unknown) => ({ name: `Product ${detailId(args)}` }),
    })

    const found = await createPowerBodyProvider({ client, detailStore: createMemoryDetailStore() })
      .getProductsBySku(['PB-2'])

    expect(found.map((p) => p.sku)).toEqual(['PB-2'])
    // Pages 1 and 2 — page 3 was never asked for.
    expect(calls.filter((c) => c.path === 'dropshipping.getProductList')).toHaveLength(2)
  })

  it('reaches a product that browsing has not detailed yet', async () => {
    // The whole point: browsing details nothing, but every SKU in the cheap feed
    // is still reachable by name.
    const feed = feedOf(100)
    const { client } = fakeClient(feed.handlers)
    const store = createMemoryDetailStore()

    await createPowerBodyProvider({ client, detailStore: store }).listProducts()
    feed.reset()
    __resetPowerBodyCache()

    const [found] = await createPowerBodyProvider({ client, detailStore: store })
      .getProductsBySku(['PB-90'])

    expect(found).toMatchObject({ sku: 'PB-90', name: 'Product 90' })
  })

  it('asks by named argument, and falls back to a bare id', async () => {
    // Their guide reads both ways and `getProductList` takes a named argument,
    // so {product_id} goes first — but an account that only answers to the bare
    // id must still work, because the alternative is every product unnamed.
    const seen: unknown[] = []
    const { client } = fakeClient({
      'dropshipping.getProductList': (args: unknown) =>
        (args as { page: number }).page === 1 ? [{ product_id: '7', sku: 'PB-7', price: '10.00', qty: '5' }] : [],
      'dropshipping.getProductInfo': (args: unknown) => {
        seen.push(args)
        // Only understands the bare id.
        return typeof args === 'string' ? { name: 'Whey 1kg', manufacturer: 'PB' } : null
      },
    })

    const [found] = await createPowerBodyProvider({ client, detailStore: createMemoryDetailStore() })
      .getProductsBySku(['PB-7'])

    expect(seen).toEqual([{ product_id: '7' }, '7'])
    expect(found).toMatchObject({ sku: 'PB-7', name: 'Whey 1kg', detailed: true })
  })

  it('reports the supplier’s own error instead of a nameless row', async () => {
    // Swallowing this is what turned a broken detail call into a page that just
    // would not fill in: the row came back, silently missing the one thing that
    // was asked for.
    const { client } = fakeClient({
      'dropshipping.getProductList': (args: unknown) =>
        (args as { page: number }).page === 1 ? [{ product_id: '7', sku: 'PB-7', price: '10.00', qty: '5' }] : [],
      'dropshipping.getProductInfo': () => {
        throw new Error('Resource path is not callable.')
      },
    })

    await expect(
      createPowerBodyProvider({ client, detailStore: createMemoryDetailStore() }).getProductsBySku(['PB-7']),
    ).rejects.toThrow(/Resource path is not callable/)
  })

  it('keeps the products it could detail when one of a batch fails', async () => {
    const { client } = fakeClient({
      'dropshipping.getProductList': (args: unknown) =>
        (args as { page: number }).page === 1
          ? [
              { product_id: '1', sku: 'PB-1', price: '10.00', qty: '5' },
              { product_id: '2', sku: 'PB-2', price: '10.00', qty: '5' },
            ]
          : [],
      'dropshipping.getProductInfo': (args: unknown) => {
        if (detailId(args) === '2') throw new Error('Invalid product data.')
        return { name: 'Whey 1kg', manufacturer: 'PB' }
      },
    })

    const found = await createPowerBodyProvider({ client, detailStore: createMemoryDetailStore() })
      .getProductsBySku(['PB-1', 'PB-2'])

    // One bad product in a batch must not lose the good ones.
    expect(found.map((p) => p.name)).toEqual(['Whey 1kg', 'PB-2'])
  })

  it('does not re-read the feed for a product browsing just listed', async () => {
    // Pressing Details on a row should cost the one call it needs, not a walk
    // back through every page to rediscover the id we are already holding.
    const feed = feedOf(100)
    const { client, calls } = fakeClient(feed.handlers)
    const provider = createPowerBodyProvider({ client, detailStore: createMemoryDetailStore() })

    await provider.listProducts()
    const listCallsAfterBrowse = calls.filter((c) => c.path === 'dropshipping.getProductList').length

    await provider.getProductsBySku(['PB-90'])

    expect(calls.filter((c) => c.path === 'dropshipping.getProductList')).toHaveLength(listCallsAfterBrowse)
    expect(feed.infoCalls()).toEqual(['90'])
  })

  it('reuses cached detail rather than re-fetching', async () => {
    const feed = feedOf(10)
    const { client } = fakeClient(feed.handlers)
    const store = createMemoryDetailStore()
    const make = () => createPowerBodyProvider({ client, detailStore: store })

    await make().getProductsBySku(['PB-3'])
    feed.reset()
    await make().getProductsBySku(['PB-3'])

    expect(feed.infoCalls()).toEqual([])
  })

  it('omits unknown SKUs instead of erroring', async () => {
    const feed = feedOf(3)
    const { client } = fakeClient(feed.handlers)
    const products = await createPowerBodyProvider({ client, detailStore: createMemoryDetailStore() })
      .getProductsBySku(['PB-1', 'NOPE'])

    expect(products.map((p) => p.sku)).toEqual(['PB-1'])
  })

  it('returns nothing, and calls nothing, for an empty request', async () => {
    const feed = feedOf(3)
    const { client, calls } = fakeClient(feed.handlers)
    const products = await createPowerBodyProvider({ client, detailStore: createMemoryDetailStore() })
      .getProductsBySku([])

    expect(products).toEqual([])
    expect(calls).toEqual([])
  })

  it('takes price and stock from today’s feed, not from cached detail', async () => {
    const cached = {
      '1': { info: { name: 'Whey', price: '999.00', qty: '999' }, at: Date.now() },
    }
    const { client } = fakeClient({
      'dropshipping.getProductList': (args: unknown) =>
        (args as { page: number }).page === 1 ? [{ product_id: '1', sku: 'PB-1', price: '11.50', qty: '7' }] : [],
      'dropshipping.getProductInfo': () => null,
    })

    const [product] = await createPowerBodyProvider({ client, detailStore: createMemoryDetailStore(cached) })
      .getProductsBySku(['PB-1'])

    expect(product).toMatchObject({ name: 'Whey', wholesalePrice: 11.5, stock: 7 })
  })
})

describe('getProductsBySku — mock', () => {
  it('resolves fixtures by SKU', async () => {
    const sku = POWERBODY_FIXTURES[0].sku
    const products = await createMockSupplier().getProductsBySku([sku])
    expect(products).toHaveLength(1)
    expect(products[0].sku).toBe(sku)
  })

  it('omits unknown SKUs', async () => {
    expect(await createMockSupplier().getProductsBySku(['NOPE'])).toEqual([])
  })
})
