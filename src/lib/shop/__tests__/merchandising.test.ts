import { dealInfo, dealsProducts, maxDealPct, productBadge, defaultVariant, variantStock, demoInventory, LOW_STOCK_THRESHOLD } from '../merchandising'
import type { CatalogueProduct, CatalogueVariant } from '@/lib/catalogue/types'

function variant(over: Partial<CatalogueVariant> = {}): CatalogueVariant {
  return { id: 'v', title: 'V', flavour: null, size: null, price: 30, compareAtPrice: null, available: true, ...over }
}

function makeProduct(over: Partial<CatalogueProduct> = {}): CatalogueProduct {
  return {
    id: 'p', title: 'P', handle: 'p', description: '', imageUrl: null, category: 'Protein',
    stackSlots: ['protein'], goals: ['muscle'], dietaryTags: [], formats: ['powder'],
    variants: [variant()], basePrice: 30, compareAtPrice: null, subscriptionEligible: true,
    servings: 30, swapGroup: 'protein-whey', recommendationPriority: 5, marginPriority: 5,
    isCoreEligible: true, isBoosterEligible: false, hasStimulants: false, shortReason: '',
    warnings: [], ...over,
  }
}

describe('defaultVariant', () => {
  it('prefers the first available variant', () => {
    const p = makeProduct({ variants: [variant({ id: 'a', available: false }), variant({ id: 'b', available: true })] })
    expect(defaultVariant(p)?.id).toBe('b')
  })
  it('falls back to the first variant when none are available', () => {
    const p = makeProduct({ variants: [variant({ id: 'a', available: false })] })
    expect(defaultVariant(p)?.id).toBe('a')
  })
})

describe('dealInfo', () => {
  it('flags a deal and computes the percentage', () => {
    const p = makeProduct({ variants: [variant({ price: 30, compareAtPrice: 40 })] })
    const info = dealInfo(p)
    expect(info.onDeal).toBe(true)
    expect(info.pct).toBe(25)
    expect(info.rrp).toBe(40)
  })
  it('is not a deal when RRP is absent or not higher', () => {
    expect(dealInfo(makeProduct({ variants: [variant({ price: 30, compareAtPrice: null })] })).onDeal).toBe(false)
    expect(dealInfo(makeProduct({ variants: [variant({ price: 30, compareAtPrice: 30 })] })).onDeal).toBe(false)
  })
})

describe('dealsProducts + maxDealPct', () => {
  const products = [
    makeProduct({ id: 'a', variants: [variant({ price: 30, compareAtPrice: 40 })] }), // 25%
    makeProduct({ id: 'b', variants: [variant({ price: 30, compareAtPrice: null })] }), // none
    makeProduct({ id: 'c', variants: [variant({ price: 20, compareAtPrice: 40 })] }), // 50%
  ]
  it('keeps only deals, biggest saving first', () => {
    expect(dealsProducts(products).map((p) => p.id)).toEqual(['c', 'a'])
  })
  it('reports the best saving across the set', () => {
    expect(maxDealPct(products)).toBe(50)
    expect(maxDealPct([makeProduct({ variants: [variant({ compareAtPrice: null })] })])).toBe(0)
  })
})

describe('productBadge', () => {
  it('marks high-priority products Popular', () => {
    expect(productBadge(makeProduct({ recommendationPriority: 9 }))).toBe('Popular')
  })
  it('marks high-margin products Best value when not Popular', () => {
    expect(productBadge(makeProduct({ recommendationPriority: 5, marginPriority: 9 }))).toBe('Best value')
  })
  it('returns null for an unremarkable product', () => {
    expect(productBadge(makeProduct({ recommendationPriority: 5, marginPriority: 5 }))).toBeNull()
  })
})

describe('variantStock', () => {
  it('flags low stock only for a real, positive count at/below the threshold', () => {
    expect(variantStock(variant({ available: true, inventory: 3 }))).toEqual({ count: 3, low: true })
    expect(variantStock(variant({ available: true, inventory: LOW_STOCK_THRESHOLD }))).toEqual({ count: LOW_STOCK_THRESHOLD, low: true })
  })
  it('is not low when comfortably stocked', () => {
    expect(variantStock(variant({ available: true, inventory: 50 }))).toEqual({ count: 50, low: false })
  })
  it('never fabricates a count when inventory is untracked', () => {
    expect(variantStock(variant({ available: true }))).toEqual({ count: null, low: false })
    expect(variantStock(variant({ available: true, inventory: null }))).toEqual({ count: null, low: false })
  })
  it('is not low for a sold-out or zero-count variant', () => {
    expect(variantStock(variant({ available: false, inventory: 4 })).low).toBe(false)
    expect(variantStock(variant({ available: true, inventory: 0 })).low).toBe(false)
  })
})

describe('demoInventory', () => {
  it('is deterministic and always positive', () => {
    expect(demoInventory('v-1')).toBe(demoInventory('v-1'))
    for (const id of ['a', 'b', 'chrgd-whey-choc-1kg', 'x-y', 'z']) {
      expect(demoInventory(id)).toBeGreaterThan(0)
    }
  })
  it('produces some low and some healthy variants across a set', () => {
    const counts = Array.from({ length: 40 }, (_, i) => demoInventory(`variant-${i}`))
    expect(counts.some((c) => c <= LOW_STOCK_THRESHOLD)).toBe(true)
    expect(counts.some((c) => c > LOW_STOCK_THRESHOLD)).toBe(true)
  })
})
