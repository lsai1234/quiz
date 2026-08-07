import { createPowerBodyProvider, __resetPowerBodyCache } from '@/lib/supplier/powerbody/live'
import { createMemoryDetailStore } from '@/lib/supplier/powerbody/detail-cache'
import { createMockSupplier } from '@/lib/supplier/powerbody/mock'
import { POWERBODY_FIXTURES } from '@/lib/supplier/powerbody/fixtures'
import { parseSkuInput, readSkuList } from '@/lib/supplier/sku-input'
import type { PowerBodySoapClient } from '@/lib/supplier/powerbody/soap'

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
      'dropshipping.getProductInfo': (id: unknown) => {
        infoCalls.push(String(id))
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

  it('details exactly the requested SKUs, ignoring the catalogue budget', async () => {
    const feed = feedOf(500)
    const { client } = fakeClient(feed.handlers)
    // A budget far smaller than the feed: a named lookup must not be limited by it.
    const provider = createPowerBodyProvider({
      client,
      detailStore: createMemoryDetailStore(),
      detailBudget: 1,
    })

    const products = await provider.getProductsBySku(['PB-400', 'PB-401'])

    expect(feed.infoCalls().sort()).toEqual(['400', '401'])
    expect(products).toHaveLength(2)
    expect(products[0]).toMatchObject({ sku: 'PB-400', name: 'Product 400', brand: 'PB', rrp: 19.99 })
  })

  it('reaches a product that browsing has not detailed yet', async () => {
    // The whole point: the browse list only details a slice, but every SKU in
    // the cheap feed is findable by name.
    const feed = feedOf(100)
    const { client } = fakeClient(feed.handlers)
    const store = createMemoryDetailStore()

    await createPowerBodyProvider({ client, detailStore: store, detailBudget: 5 }).listProducts()
    feed.reset()
    __resetPowerBodyCache()

    const [found] = await createPowerBodyProvider({ client, detailStore: store, detailBudget: 5 })
      .getProductsBySku(['PB-90'])

    expect(found).toMatchObject({ sku: 'PB-90', name: 'Product 90' })
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
