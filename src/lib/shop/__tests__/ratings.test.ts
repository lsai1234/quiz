import {
  hasRating,
  formatRatingCount,
  catalogueRatingSummary,
  demoRating,
} from '../ratings'
import type { CatalogueProduct, ProductRating } from '@/lib/catalogue/types'

function makeProduct(over: Partial<CatalogueProduct> = {}): CatalogueProduct {
  return {
    id: 'p', title: 'P', handle: 'p', description: '', imageUrl: null, category: 'Protein',
    stackSlots: ['protein'], goals: ['muscle'], dietaryTags: [], formats: ['powder'],
    variants: [], basePrice: 30, compareAtPrice: null, subscriptionEligible: true,
    servings: 30, swapGroup: 'protein-whey', recommendationPriority: 5, marginPriority: 5,
    isCoreEligible: true, isBoosterEligible: false, hasStimulants: false, shortReason: '',
    warnings: [], shopifyProductId: null, ...over,
  }
}

describe('hasRating', () => {
  it('is false when absent, zero-count or zero-average', () => {
    expect(hasRating(undefined)).toBe(false)
    expect(hasRating({ average: 4.5, count: 0 })).toBe(false)
    expect(hasRating({ average: 0, count: 10 })).toBe(false)
  })
  it('is true for a real rating', () => {
    expect(hasRating({ average: 4.6, count: 12 })).toBe(true)
  })
})

describe('formatRatingCount', () => {
  it('passes small counts through', () => {
    expect(formatRatingCount(0)).toBe('0')
    expect(formatRatingCount(999)).toBe('999')
  })
  it('compacts thousands', () => {
    expect(formatRatingCount(1000)).toBe('1k')
    expect(formatRatingCount(1240)).toBe('1.2k')
    expect(formatRatingCount(12400)).toBe('12k')
  })
})

describe('catalogueRatingSummary', () => {
  it('returns null when nothing is rated', () => {
    expect(catalogueRatingSummary([makeProduct(), makeProduct({ rating: { average: 0, count: 0 } })])).toBeNull()
  })
  it('weights the average by review count', () => {
    const products = [
      makeProduct({ id: 'a', rating: { average: 5.0, count: 2 } }),
      makeProduct({ id: 'b', rating: { average: 4.0, count: 8 } }),
    ]
    const summary = catalogueRatingSummary(products)!
    // (5*2 + 4*8) / 10 = 4.2 — not the plain mean of 4.5
    expect(summary.average).toBe(4.2)
    expect(summary.count).toBe(10)
    expect(summary.ratedProducts).toBe(2)
  })
})

describe('demoRating', () => {
  it('is deterministic for a given id', () => {
    expect(demoRating('chrgd-whey-protein')).toEqual(demoRating('chrgd-whey-protein'))
  })
  it('stays in the believable demo band', () => {
    for (const id of ['a', 'chrgd-creatine', 'x-y-z', 'protein-1', 'menopause-support']) {
      const r: ProductRating = demoRating(id)
      expect(r.average).toBeGreaterThanOrEqual(4.2)
      expect(r.average).toBeLessThanOrEqual(4.9)
      expect(r.count).toBeGreaterThanOrEqual(40)
      expect(r.count).toBeLessThanOrEqual(600)
    }
  })
  it('produces a real rating that passes hasRating', () => {
    expect(hasRating(demoRating('anything'))).toBe(true)
  })
})
