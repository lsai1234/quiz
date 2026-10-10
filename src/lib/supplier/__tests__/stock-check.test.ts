/**
 * The live stock check — what checkout, automatic sending and the swap picker
 * all ask before trusting the catalogue's word.
 */
import { checkLiveStock, describeShortfall } from '../stock-check'
import { setSupplierOverride } from '../index'
import type { SupplierProduct, SupplierProductStub, SupplierProvider } from '../types'

function provider(over: Partial<SupplierProvider> = {}): SupplierProvider {
  return {
    name: 'powerbody',
    getProductsById: async () => [],
    getProductsBySku: async () => [],
    ...over,
  } as unknown as SupplierProvider
}

const stub = (productId: string, sku: string, stock: number, inStock = stock > 0): SupplierProductStub => ({
  productId,
  sku,
  name: sku,
  wholesalePrice: 5,
  stock,
  inStock,
})

describe('checkLiveStock', () => {
  it('confirms what is there and names what is short, by reason', async () => {
    const supplier = provider({
      probeProductIds: async () => [stub('1', 'A', 10), stub('2', 'B', 0), stub('3', 'C', 1), stub('4', 'D', 7, false)],
    })
    const result = await checkLiveStock(
      [
        { sku: 'A', quantity: 2, title: 'Whey', supplierProductId: '1' },
        { sku: 'B', quantity: 1, title: 'Vitamin D3', supplierProductId: '2' },
        { sku: 'C', quantity: 2, title: 'Creatine', supplierProductId: '3' },
        { sku: 'D', quantity: 1, title: 'Old pre', supplierProductId: '4' },
      ],
      { supplier },
    )
    expect(result).toMatchObject({ ran: true, confirmed: true, unconfirmed: [] })
    expect(result.shortfalls).toEqual([
      { sku: 'B', title: 'Vitamin D3', wanted: 1, stock: 0, reason: 'out-of-stock' },
      { sku: 'C', title: 'Creatine', wanted: 2, stock: 1, reason: 'not-enough' },
      { sku: 'D', title: 'Old pre', wanted: 1, stock: 7, reason: 'discontinued' },
    ])
    expect(describeShortfall(result.shortfalls[1])).toBe('Creatine: only 1 left')
  })

  it('adds up two lines of the same SKU', async () => {
    const supplier = provider({ probeProductIds: async () => [stub('1', 'A', 3)] })
    const result = await checkLiveStock(
      [
        { sku: 'A', quantity: 2, title: 'Whey', supplierProductId: '1' },
        { sku: 'A', quantity: 2, title: 'Whey', supplierProductId: '1' },
      ],
      { supplier },
    )
    expect(result.shortfalls).toMatchObject([{ sku: 'A', wanted: 4, stock: 3, reason: 'not-enough' }])
  })

  it('never takes a stale id’s product as the one asked for', async () => {
    const supplier = provider({ probeProductIds: async () => [stub('1', 'SOMETHING-ELSE', 50)] })
    const result = await checkLiveStock([{ sku: 'A', quantity: 1, title: 'Whey', supplierProductId: '1' }], { supplier })
    expect(result).toMatchObject({ confirmed: false, unconfirmed: ['A'], shortfalls: [] })
  })

  it('reports a slow PowerBody as unconfirmed, not as sold out', async () => {
    const supplier = provider({ probeProductIds: () => new Promise(() => {}) })
    const result = await checkLiveStock([{ sku: 'A', quantity: 1, title: 'Whey', supplierProductId: '1' }], {
      supplier,
      deadlineMs: 20,
    })
    expect(result).toMatchObject({ confirmed: false, unconfirmed: ['A'], shortfalls: [], error: 'PowerBody did not answer in time.' })
  })

  it('searches by SKU only when allowed, and only then says "not carried"', async () => {
    const bySku = jest.fn(async () => [{ sku: 'B', stock: 4, inStock: true, wholesalePrice: 3, productId: '9' } as SupplierProduct])
    const supplier = provider({ getProductsBySku: bySku })
    const items = [
      { sku: 'B', quantity: 1, title: 'Bars' },
      { sku: 'Z', quantity: 1, title: 'Gone' },
    ]

    const quick = await checkLiveStock(items, { supplier })
    expect(bySku).not.toHaveBeenCalled()
    expect(quick.unconfirmed).toEqual(['B', 'Z'])

    const thorough = await checkLiveStock(items, { supplier, allowSkuSearch: true })
    expect(thorough.shortfalls).toEqual([{ sku: 'Z', title: 'Gone', wanted: 1, stock: 0, reason: 'not-carried' }])
    expect(thorough.confirmed).toBe(true)
  })

  it('falls back to the detail call when the provider cannot probe', async () => {
    const supplier = provider({
      getProductsById: async () => [{ sku: 'A', stock: 0, inStock: false, wholesalePrice: 5, productId: '1' } as SupplierProduct],
    })
    const result = await checkLiveStock([{ sku: 'A', quantity: 1, title: 'Whey', supplierProductId: '1' }], { supplier })
    expect(result.shortfalls).toMatchObject([{ sku: 'A', reason: 'out-of-stock' }])
  })

  it('does not run on the sample feed', async () => {
    setSupplierOverride('mock')
    try {
      const result = await checkLiveStock([{ sku: 'A', quantity: 1, title: 'Whey' }])
      expect(result).toMatchObject({ ran: false, confirmed: false, unconfirmed: ['A'] })
    } finally {
      setSupplierOverride(null)
    }
  })
})
