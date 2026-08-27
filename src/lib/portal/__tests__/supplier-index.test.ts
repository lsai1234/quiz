import { readSupplierIndex, mergeIntoIndex, indexedProductIds, clearSupplierIndex, mergeSweep, highestIndexedId } from '@/lib/portal/supplier-index'
import type { SupplierStockLevel } from '@/lib/supplier/types'

jest.mock('@/lib/portal/persist', () => {
  const store: Record<string, unknown> = {}
  return {
    readJson: jest.fn(async (name: string, fallback: unknown) => store[name] ?? fallback),
    writeJson: jest.fn(async (name: string, data: unknown) => { store[name] = data }),
  }
})

const level = (sku: string, productId: string | null, stock = 5): SupplierStockLevel =>
  ({ sku, productId, stock, inStock: stock > 0, wholesalePrice: 10, rrp: 20, updatedAt: '' }) as SupplierStockLevel

describe('the stored feed index', () => {
  beforeEach(async () => { await clearSupplierIndex() })

  it('merges passes instead of replacing them', async () => {
    // A crawl arrives in passes because one request cannot read an arbitrarily
    // long feed. A pass that replaced the document would leave the index
    // holding only the last few pages read — which looks like a working index
    // and answers for almost nothing.
    await mergeIntoIndex([level('P1', '100'), level('P2', '200')], { pagesRead: 40, complete: false })
    await mergeIntoIndex([level('P3', '300')], { pagesRead: 12, complete: true })

    const index = await readSupplierIndex()
    expect(Object.keys(index.bySku).sort()).toEqual(['P1', 'P2', 'P3'])
    expect(index.pagesRead).toBe(52)
    expect(index.complete).toBe(true)
  })

  it('skips rows with no product id', async () => {
    // That field is the entire point. An entry without one would occupy a SKU's
    // slot while answering nothing, and the caller would read it as "known".
    await mergeIntoIndex([level('P1', null), level('P2', '200')], { pagesRead: 1, complete: true })

    const found = await indexedProductIds(['P1', 'P2'])
    expect(found.has('P1')).toBe(false)
    expect(found.get('P2')?.productId).toBe('200')
  })

  it('keeps per-SKU stock, because every flavour is its own product', async () => {
    // Without this each flavour inherits the parent's availability, and a
    // customer picks Chocolate, we take the order, and PowerBody have none.
    await mergeIntoIndex([level('P1', '100', 12), level('P2', '200', 0)], { pagesRead: 1, complete: true })

    const found = await indexedProductIds(['P1', 'P2'])
    expect(found.get('P1')?.qty).toBe(12)
    expect(found.get('P2')?.qty).toBe(0)
  })

  it('starts empty and says so, rather than looking complete', async () => {
    // `complete` gates whether absence means anything. A fresh index that
    // claimed completeness would make every SKU look genuinely missing.
    const index = await readSupplierIndex()
    expect(index.complete).toBe(false)
    expect(index.updatedAt).toBeNull()
  })

  it('resets only when asked', async () => {
    await mergeIntoIndex([level('P1', '100')], { pagesRead: 1, complete: true })
    await mergeIntoIndex([level('P9', '900')], { pagesRead: 1, complete: true, reset: true })

    const index = await readSupplierIndex()
    expect(Object.keys(index.bySku)).toEqual(['P9'])
    expect(index.pagesRead).toBe(1)
  })
})

describe('the id sweep', () => {
  beforeEach(async () => { await clearSupplierIndex() })

  const stub = (productId: string, sku: string, name = 'A product') =>
    ({ productId, sku, name, wholesalePrice: 9.5, stock: 3 })

  it('starts where the list feed stopped', async () => {
    // The feed is ordered by ascending product id, so its ceiling is an id
    // ceiling as much as a count — everything it cannot reach sits above the
    // highest id it handed over.
    await mergeIntoIndex([level('P1', '100'), level('P2', '4200'), level('P3', '900')], { pagesRead: 1, complete: false })

    await expect(highestIndexedId()).resolves.toBe(4200)
  })

  it('marks what it finds as swept, so the two halves stay tellable apart', async () => {
    await mergeIntoIndex([level('P1', '100')], { pagesRead: 1, complete: false })
    await mergeSweep([stub('5000', 'P9', 'Past the ceiling')], {
      sweptTo: 5030, idsVisited: 30, sweepComplete: false, emptyRun: 0,
    })

    const index = await readSupplierIndex()
    expect(index.bySku.P1.swept).toBeUndefined()
    expect(index.bySku.P9.swept).toBe(true)
    // The list feed carries no name; the detail call does.
    expect(index.bySku.P9.name).toBe('Past the ceiling')
  })

  it('carries the empty run across passes', async () => {
    // A run that reset at every pass boundary could never reach the stop
    // threshold, and the sweep would walk to infinity one request at a time.
    await mergeSweep([], { sweptTo: 6000, idsVisited: 300, sweepComplete: false, emptyRun: 300 })
    await mergeSweep([], { sweptTo: 6300, idsVisited: 300, sweepComplete: false, emptyRun: 600 })

    const index = await readSupplierIndex()
    expect(index.sweptEmptyRun).toBe(600)
    expect(index.sweptIds).toBe(600)
  })

  it('counts only genuinely new products as found', async () => {
    // A sweep re-reaching something the feed already had is not a discovery,
    // and counting it as one overstates what the hour bought.
    await mergeIntoIndex([level('P1', '100')], { pagesRead: 1, complete: false })
    await mergeSweep([stub('100', 'P1'), stub('5000', 'P9')], {
      sweptTo: 5030, idsVisited: 30, sweepComplete: false, emptyRun: 0,
    })

    const index = await readSupplierIndex()
    expect(index.sweptFound).toBe(1)
  })

  it('does not claim completeness until the ids actually run out', async () => {
    await mergeSweep([stub('5000', 'P9')], { sweptTo: 5030, idsVisited: 30, sweepComplete: false, emptyRun: 0 })
    expect((await readSupplierIndex()).sweepComplete).toBe(false)

    await mergeSweep([], { sweptTo: 9000, idsVisited: 1500, sweepComplete: true, emptyRun: 1500 })
    expect((await readSupplierIndex()).sweepComplete).toBe(true)
  })
})
