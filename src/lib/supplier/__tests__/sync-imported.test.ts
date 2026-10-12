/**
 * @jest-environment node
 */
import { MOCK_CATALOGUE } from '@/lib/catalogue/mock-catalogue'
import type { CatalogueProduct, CatalogueVariant } from '@/lib/catalogue/types'
import type { SupplierProduct, SupplierProvider, SupplierStockLevel } from '../types'
import { clearPersistCache, writeJson } from '@/lib/portal/persist'
import { addImportedProducts, editStoredProduct, getImportedProducts } from '@/lib/portal/store'

/*
  The nightly sync and the stock memory, run against the real product store
  (in-memory SQLite) with a fake PowerBody. The supplier factory and the stored
  SKU → id index are replaced; everything else is real.
*/
const fake: { supplier: SupplierProvider | null } = { supplier: null }
jest.mock('@/lib/supplier', () => ({
  ...jest.requireActual('@/lib/supplier'),
  getSupplier: jest.fn(async () => fake.supplier),
  getSupplierSource: jest.fn(() => 'powerbody'),
}))
jest.mock('@/lib/portal/supplier-index', () => ({
  ...jest.requireActual('@/lib/portal/supplier-index'),
  indexedProductIds: jest.fn(async () => new Map()),
}))

import { indexedProductIds } from '@/lib/portal/supplier-index'
import { applyStockLevels, getLastSyncReport, rememberLiveStock, syncImportedProducts } from '../sync'

const indexed = indexedProductIds as jest.MockedFunction<typeof indexedProductIds>

// ── Fixtures ─────────────────────────────────────────────────────────────────

function variant(over: Partial<CatalogueVariant> & { id: string; sku: string }): CatalogueVariant {
  return { title: '', flavour: null, size: '2kg', price: 44.99, compareAtPrice: null, available: true, inventory: 10, ...over }
}

/** An imported product built from the sample whey, with real SKUs. */
function imported(id: string, variants: CatalogueVariant[], over: Partial<CatalogueProduct> = {}): CatalogueProduct {
  const { rating: _rating, ...sample } = MOCK_CATALOGUE[0] as CatalogueProduct
  void _rating
  return {
    ...sample,
    id,
    handle: id,
    title: `Critical Whey ${id}`,
    variants,
    defaultVariantId: variants[0].id,
    basePrice: 44.99,
    cost: 20,
    supplierRrp: 49.99,
    ...over,
  }
}

function level(sku: string, over: Partial<SupplierStockLevel> = {}): SupplierStockLevel {
  return { sku, productId: null, stock: 10, inStock: true, wholesalePrice: 20, rrp: 49.99, updatedAt: '2026-10-12T02:00:00.000Z', ...over }
}

function detail(sku: string, productId: string, over: Partial<SupplierProduct> = {}): SupplierProduct {
  return {
    sku, productId, name: sku, brand: 'Applied Nutrition', category: 'Protein', description: '', imageUrl: null,
    wholesalePrice: 20, rrp: 49.99, currency: 'GBP', stock: 10, inStock: true, barcode: null, flavours: [],
    servings: 66, weightGrams: 2150, vatRate: 0.2, detailed: true, updatedAt: '2026-10-12T02:00:00.000Z', ...over,
  }
}

/** A PowerBody whose list feed returns `listed`, and whose detail call answers by id from `byId`. */
function fakeSupplier(listed: SupplierStockLevel[], byId: Record<string, SupplierProduct> = {}, onList?: () => Promise<void>) {
  const askedById: string[][] = []
  const askedBySku: string[][] = []
  fake.supplier = {
    name: 'powerbody',
    async getStockLevels(skus?: string[]) {
      askedBySku.push([...(skus ?? [])])
      await onList?.()
      return listed.filter((l) => !skus || skus.includes(l.sku))
    },
    async getProductsById(ids: string[]) {
      askedById.push([...ids])
      return ids.map((id) => byId[id]).filter(Boolean)
    },
  } as unknown as SupplierProvider
  return { askedById, askedBySku }
}

async function stored(id: string): Promise<CatalogueProduct> {
  const found = (await getImportedProducts()).find((p) => p.id === id)
  if (!found) throw new Error(`nothing stored as ${id}`)
  return found
}

const EMPTY_PRODUCTS = { overrides: {}, removedIds: [], imported: [], topProductIds: [] }

beforeEach(async () => {
  jest.clearAllMocks()
  indexed.mockImplementation(async () => new Map())
  await writeJson('products', EMPTY_PRODUCTS)
  clearPersistCache()
})

afterAll(async () => {
  await writeJson('products', EMPTY_PRODUCTS)
})

// ── The product's cost follows its master ────────────────────────────────────

describe('applyStockLevels — the product’s cost and RRP are its master SKU’s', () => {
  it('takes the stored master’s level, not the cheapest sibling’s', () => {
    const p = imported('cw', [variant({ id: 'big', sku: 'P-BIG', cost: 30 }), variant({ id: 'small', sku: 'P-SMALL', cost: 18 })], {
      cost: 30,
      supplierRrp: 59.99,
    })
    const { products } = applyStockLevels([p], [
      level('P-BIG', { wholesalePrice: 32, rrp: 64.99 }),
      level('P-SMALL', { wholesalePrice: 18, rrp: 39.99 }),
    ])
    expect(products[0].cost).toBe(32)
    expect(products[0].supplierRrp).toBe(64.99)
  })

  it('reads the master even when it is out of stock', () => {
    const p = imported('cw', [variant({ id: 'big', sku: 'P-BIG' }), variant({ id: 'small', sku: 'P-SMALL' })], { cost: 30 })
    const { products } = applyStockLevels([p], [
      level('P-BIG', { wholesalePrice: 31, inStock: false, stock: 0 }),
      level('P-SMALL', { wholesalePrice: 18 }),
    ])
    expect(products[0].cost).toBe(31)
  })

  it('falls back to the cheapest line and the highest RRP when the feed did not return the master', () => {
    const p = imported('cw', [
      variant({ id: 'big', sku: 'P-BIG' }),
      variant({ id: 'a', sku: 'P-A' }),
      variant({ id: 'b', sku: 'P-B' }),
    ], { cost: 25, supplierRrp: 40 })
    const { products } = applyStockLevels([p], [
      level('P-A', { wholesalePrice: 19, rrp: 41 }),
      level('P-B', { wholesalePrice: 21, rrp: 45 }),
    ])
    expect(products[0].cost).toBe(19)
    expect(products[0].supplierRrp).toBe(45)
  })
})

// ── syncImportedProducts ─────────────────────────────────────────────────────

describe('syncImportedProducts', () => {
  it('asks by id for SKUs the list did not return, and keeps only replies for the SKU asked about', async () => {
    await addImportedProducts([
      imported('whey', [
        variant({ id: 'w-choc', sku: 'P100' }),
        variant({ id: 'w-van', sku: 'P200', supplierProductId: '1200' }),
        variant({ id: 'w-straw', sku: 'P300' }),
      ]),
      // A single-SKU product carries its id on the product.
      imported('creatine', [variant({ id: 'c', sku: 'P400' })], { supplierProductId: '1400' }),
      // Nothing holds an id for this one.
      imported('glycine', [variant({ id: 'g', sku: 'P500' })]),
    ])
    indexed.mockImplementation(async (skus) => new Map(skus.includes('P300') ? [['P300', { productId: '1300', qty: 1, price: 20 }]] : []))
    const { askedById } = fakeSupplier([level('P100')], {
      '1200': detail('P200', '1200', { stock: 0, inStock: false }),
      // Id 1300 has moved: it now answers for another brand's tub.
      '1300': detail('P999', '1300', { stock: 0, inStock: false }),
      '1400': detail('P400', '1400', { stock: 0, inStock: false }),
    })

    const report = await syncImportedProducts()

    expect(askedById.flat().sort()).toEqual(['1200', '1300', '1400'])
    expect(indexed).toHaveBeenCalledWith(['P300', 'P500'])
    const whey = await stored('whey')
    expect(whey.variants.map((v) => [v.sku, v.available, v.inventory])).toEqual([
      ['P100', true, 10],
      ['P200', false, 0],
      // The moved id's reply was not taken as P300's.
      ['P300', true, 10],
    ])
    expect((await stored('creatine')).variants[0]).toMatchObject({ available: false, inventory: 0 })
    // Only the product nothing could reach is reported missing.
    expect(report.missing).toEqual(['glycine'])
    expect(report.scanned).toBe(3)
    expect(report.updated).toBe(2)
    expect(report.source).toBe('powerbody')
  })

  it('applies the update to the products as they are when it writes, so an edit made meanwhile is kept', async () => {
    await addImportedProducts([imported('whey', [variant({ id: 'w-choc', sku: 'P100', cost: 20 })])])
    fakeSupplier([level('P100', { stock: 0, inStock: false, wholesalePrice: 22 })], {}, async () => {
      // A founder renames the product while PowerBody are being asked.
      await editStoredProduct('whey', (p) => ({ ...p, title: 'Critical Whey (renamed)' }))
    })

    await syncImportedProducts()

    const whey = await stored('whey')
    expect(whey.title).toBe('Critical Whey (renamed)')
    expect(whey.variants[0]).toMatchObject({ available: false, inventory: 0, cost: 22 })
    expect(whey.cost).toBe(22)
  })

  it('stores a report the hub can read back', async () => {
    await addImportedProducts([imported('whey', [variant({ id: 'w-choc', sku: 'P100' })], { cost: 20, basePrice: 44.99 })])
    fakeSupplier([level('P100', { wholesalePrice: 25 })])

    const report = await syncImportedProducts()

    expect(report.changes).toEqual([
      expect.objectContaining({ productId: 'whey', sku: 'P100', costWas: 20, costNow: 25, costDeltaPct: 0.25 }),
    ])
    expect(await getLastSyncReport()).toEqual(report)
    expect((report as unknown as Record<string, unknown>).products).toBeUndefined()
  })

  it('writes nothing when nothing moved', async () => {
    const whey = imported('whey', [variant({ id: 'w-choc', sku: 'P100' })], { cost: 20, supplierRrp: 49.99 })
    await addImportedProducts([whey])
    const before = JSON.stringify(await stored('whey'))
    fakeSupplier([level('P100')])

    const report = await syncImportedProducts()

    expect(report.updated).toBe(0)
    expect(JSON.stringify(await stored('whey'))).toBe(before)
  })

  it('asks PowerBody nothing when nothing is imported', async () => {
    const { askedBySku } = fakeSupplier([])
    const report = await syncImportedProducts()
    expect(report).toMatchObject({ scanned: 0, updated: 0, missing: [], changes: [] })
    expect(askedBySku).toEqual([])
  })
})

// ── rememberLiveStock ────────────────────────────────────────────────────────

describe('rememberLiveStock', () => {
  it('writes what a live check saw — availability and count only — and says how many products moved', async () => {
    await addImportedProducts([
      imported('whey', [variant({ id: 'w-choc', sku: 'P100', cost: 20 }), variant({ id: 'w-van', sku: 'P200' })]),
      imported('creatine', [variant({ id: 'c', sku: 'P400' })]),
    ])

    const moved = await rememberLiveStock([
      { sku: 'P100', stock: 0, inStock: false },
      { sku: 'P400', stock: 10, inStock: true },
    ])

    expect(moved).toBe(1)
    const whey = await stored('whey')
    expect(whey.variants[0]).toMatchObject({ available: false, inventory: 0, cost: 20 })
    expect(whey.variants[1]).toMatchObject({ available: true, inventory: 10 })
    expect(whey.cost).toBe(20)
  })

  it('returns 0 and writes nothing when nothing moved', async () => {
    await addImportedProducts([imported('whey', [variant({ id: 'w-choc', sku: 'P100' })])])
    expect(await rememberLiveStock([{ sku: 'P100', stock: 10, inStock: true }])).toBe(0)
    expect(await rememberLiveStock([])).toBe(0)
    expect(await rememberLiveStock([{ sku: 'UNKNOWN', stock: 0, inStock: false }])).toBe(0)
  })

  it('keeps an edit made to another field of the same product', async () => {
    await addImportedProducts([imported('whey', [variant({ id: 'w-choc', sku: 'P100' })])])
    await editStoredProduct('whey', (p) => ({ ...p, description: 'Founder copy.' }))
    await rememberLiveStock([{ sku: 'P100', stock: 0, inStock: false }])
    const whey = await stored('whey')
    expect(whey.description).toBe('Founder copy.')
    expect(whey.variants[0].available).toBe(false)
  })
})
