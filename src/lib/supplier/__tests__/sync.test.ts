import { applyStockLevels } from '@/lib/supplier/sync'
import { supplierProductToCatalogue } from '@/lib/supplier/mapping'
import type { SupplierProduct } from '@/lib/supplier/types'
import type { CatalogueProduct } from '@/lib/catalogue/types'

const BASE: SupplierProduct = {
  sku: 'PB-1',
  productId: '1001',
  name: 'Whey Protein 1kg',
  brand: 'PB',
  category: 'Protein',
  description: 'A whey.',
  imageUrl: null,
  wholesalePrice: 10,
  rrp: 24.99,
  currency: 'GBP',
  stock: 20,
  inStock: true,
  barcode: null,
  flavours: [],
  servings: 30,
  detailed: true,
  weightGrams: 1150,
  vatRate: 0.2,
  updatedAt: '2026-08-01T00:00:00.000Z',
}

const product = (over: Partial<SupplierProduct> = {}): CatalogueProduct =>
  supplierProductToCatalogue({ ...BASE, ...over })

const level = (over: Partial<{ sku: string; productId: string | null; stock: number; inStock: boolean; wholesalePrice: number; rrp: number }> = {}) => ({
  sku: 'PB-1',
  productId: '1001',
  stock: 20,
  inStock: true,
  wholesalePrice: 10,
  rrp: 24.99,
  updatedAt: '2026-08-07T00:00:00.000Z',
  ...over,
})

describe('applyStockLevels', () => {
  it('reports no change when nothing moved', () => {
    const result = applyStockLevels([product()], [level()])
    expect(result).toMatchObject({ scanned: 1, updated: 0, missing: [], changes: [] })
    // Untouched products are returned by identity, so a no-op sync writes nothing.
    expect(result.products[0]).toBe(result.products[0])
  })

  it('takes a product out of stock when the supplier does', () => {
    const result = applyStockLevels([product()], [level({ stock: 0, inStock: false })])

    expect(result.updated).toBe(1)
    expect(result.products[0].variants.every((v) => !v.available)).toBe(true)
    expect(result.products[0].variants[0].inventory).toBe(0)
    expect(result.changes[0]).toMatchObject({ productId: 'whey-protein-1kg', wasInStock: true, nowInStock: false })
  })

  it('brings a product back when the supplier restocks it', () => {
    const outOfStock = product({ stock: 0, inStock: false })
    const result = applyStockLevels([outOfStock], [level({ stock: 12, inStock: true })])

    expect(result.products[0].variants[0].available).toBe(true)
    expect(result.products[0].variants[0].inventory).toBe(12)
    expect(result.changes[0]).toMatchObject({ wasInStock: false, nowInStock: true })
  })

  it('updates our cost when their wholesale price moves', () => {
    const result = applyStockLevels([product()], [level({ wholesalePrice: 12.5 })])

    expect(result.products[0].cost).toBe(12.5)
    expect(result.changes[0]).toMatchObject({ costWas: 10, costNow: 12.5 })
  })

  it('leaves the retail price alone when cost moves', () => {
    // Repricing is a decision, made through the change-review flow — not a
    // side effect of a nightly sync.
    const before = product()
    const result = applyStockLevels([before], [level({ wholesalePrice: 18 })])
    expect(result.products[0].basePrice).toBe(before.basePrice)
  })

  it('never touches curated fields', () => {
    const before = product()
    const curated: CatalogueProduct = {
      ...before,
      title: 'CHRGD Whey',
      description: 'Founder-written copy.',
      shortReason: 'Because it works.',
      goals: ['muscle'],
      recommendationPriority: 9,
    }
    const result = applyStockLevels([curated], [level({ stock: 3, wholesalePrice: 11 })])

    expect(result.products[0]).toMatchObject({
      title: 'CHRGD Whey',
      description: 'Founder-written copy.',
      shortReason: 'Because it works.',
      goals: ['muscle'],
      recommendationPriority: 9,
    })
  })

  it('flags an imported product whose SKU has left the feed', () => {
    const result = applyStockLevels([product()], [level({ sku: 'PB-OTHER' })])
    expect(result.missing).toEqual(['whey-protein-1kg'])
    expect(result.updated).toBe(0)
  })

  it('does not call a product missing when it has no supplier SKU at all', () => {
    const noSku = product()
    noSku.variants = noSku.variants.map((v) => ({ ...v, sku: null }))
    // That is a mapping gap, not a delisting — reporting it here would be noise.
    expect(applyStockLevels([noSku], [level()]).missing).toEqual([])
  })

  it('moves the default variant off one that just went out of stock', () => {
    const multi = product({ flavours: ['Chocolate', 'Vanilla'] })
    multi.variants = multi.variants.map((v, i) => ({ ...v, sku: i === 0 ? 'PB-CHOC' : 'PB-VAN' }))
    multi.defaultVariantId = multi.variants[0].id

    const result = applyStockLevels([multi], [
      level({ sku: 'PB-CHOC', stock: 0, inStock: false }),
      level({ sku: 'PB-VAN', stock: 8, inStock: true }),
    ])

    // Otherwise the product page opens preselected on something unbuyable.
    expect(result.products[0].defaultVariantId).toBe(multi.variants[1].id)
  })

  it('keeps the default variant when it is still buyable', () => {
    const multi = product({ flavours: ['Chocolate', 'Vanilla'] })
    multi.variants = multi.variants.map((v, i) => ({ ...v, sku: i === 0 ? 'PB-CHOC' : 'PB-VAN' }))
    multi.defaultVariantId = multi.variants[0].id

    const result = applyStockLevels([multi], [
      level({ sku: 'PB-CHOC', stock: 5, inStock: true }),
      level({ sku: 'PB-VAN', stock: 0, inStock: false }),
    ])

    expect(result.products[0].defaultVariantId).toBe(multi.variants[0].id)
  })

  describe('margin impact of a cost change', () => {
    // basePrice is cost x2 rounded to .99 — a £10 cost lists at £19.99, so the
    // starting margin is ~50%.
    it('reports what a cost rise did to the margin on our retail price', () => {
      const before = product()
      const result = applyStockLevels([before], [level({ wholesalePrice: 14 })], { marginFloorPct: 0.15 })
      const change = result.changes[0]

      expect(change).toMatchObject({ costWas: 10, costNow: 14, title: 'Whey Protein 1kg' })
      expect(change.costDeltaPct).toBeCloseTo(0.4, 4)
      // Retail is untouched, so the whole rise lands on margin.
      expect(change.marginPctWas).toBeCloseTo((before.basePrice - 10) / before.basePrice, 4)
      expect(change.marginPctNow).toBeCloseTo((before.basePrice - 14) / before.basePrice, 4)
      expect(change.belowFloor).toBe(false)
    })

    it('flags a product pushed under the margin floor', () => {
      const before = product()
      // Cost almost at retail: margin collapses to a few percent.
      const result = applyStockLevels([before], [level({ wholesalePrice: before.basePrice - 1 })], {
        marginFloorPct: 0.15,
      })
      expect(result.changes[0].belowFloor).toBe(true)
    })

    it('treats a cost fall as a margin gain, not a warning', () => {
      const result = applyStockLevels([product()], [level({ wholesalePrice: 6 })], { marginFloorPct: 0.15 })
      expect(result.changes[0].costDeltaPct).toBeCloseTo(-0.4, 4)
      expect(result.changes[0].belowFloor).toBe(false)
    })

    it('reports no margin figures when only stock moved', () => {
      const change = applyStockLevels([product()], [level({ stock: 0, inStock: false })]).changes[0]
      expect(change.marginPctNow).toBeUndefined()
      expect(change.belowFloor).toBeUndefined()
      expect(change.nowInStock).toBe(false)
    })
  })

  it('handles an empty catalogue and an empty feed', () => {
    expect(applyStockLevels([], [level()])).toMatchObject({ scanned: 0, updated: 0, changes: [] })
    expect(applyStockLevels([product()], [])).toMatchObject({ updated: 0, missing: ['whey-protein-1kg'] })
  })
})
