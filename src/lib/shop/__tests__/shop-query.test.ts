import type { CatalogueProduct, CatalogueVariant } from '@/lib/catalogue/types'
import {
  EMPTY_QUERY,
  isEmptyQuery,
  needsResultsView,
  activeFilterCount,
  applyShopQuery,
  facetCounts,
  type ShopQuery,
} from '../shop-query'

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

const whey = makeProduct({
  id: 'whey', title: 'CHRGD Whey Protein', category: 'Protein',
  variants: [variant({ id: 'w', price: 34.99 })],
  rating: { average: 4.6, count: 220 },
})
const plant = makeProduct({
  id: 'plant', title: 'CHRGD Plant Protein', category: 'Protein',
  dietaryTags: ['vegan', 'dairy-free'], swapGroup: 'protein-plant',
  variants: [variant({ id: 'pl', price: 29.99, compareAtPrice: 39.99 })],
  rating: { average: 4.2, count: 90 },
})
const preworkout = makeProduct({
  id: 'pre', title: 'CHRGD Pre-Workout', category: 'Pre-Workout',
  stackSlots: ['energy'], goals: ['energy'], hasStimulants: true, swapGroup: 'pre-workout-stim',
  variants: [variant({ id: 'pw', price: 24.99 })],
})
const electrolytes = makeProduct({
  id: 'salts', title: 'CHRGD Hydration Salts', category: 'Hydration',
  stackSlots: ['hydration'], goals: ['hydration'], dietaryTags: ['vegan'],
  swapGroup: 'electrolytes', formats: ['powder', 'effervescent'], subscriptionEligible: false,
  variants: [variant({ id: 'e', price: 18.99, available: false })],
})

const CATALOGUE = [whey, plant, preworkout, electrolytes]

const query = (over: Partial<ShopQuery> = {}): ShopQuery => ({ ...EMPTY_QUERY, ...over })
const ids = (q: Partial<ShopQuery>) => applyShopQuery(CATALOGUE, query(q)).products.map((p) => p.id)

describe('isEmptyQuery', () => {
  it('is true when nothing at all narrows the shop', () => {
    expect(isEmptyQuery(EMPTY_QUERY)).toBe(true)
  })

  it('ignores sort, which has nothing to reorder on its own', () => {
    expect(isEmptyQuery(query({ sort: 'price-asc' }))).toBe(true)
  })

  it('is false as soon as anything narrows the shop', () => {
    expect(isEmptyQuery(query({ q: 'whey' }))).toBe(false)
    expect(isEmptyQuery(query({ dietary: ['vegan'] }))).toBe(false)
    expect(isEmptyQuery(query({ priceMax: 30 }))).toBe(false)
    expect(isEmptyQuery(query({ onDealOnly: true }))).toBe(false)
  })

  it('treats whitespace as no query', () => {
    expect(isEmptyQuery(query({ q: '   ' }))).toBe(true)
  })
})

describe('needsResultsView — the browse/results switch', () => {
  it('keeps you on the shelves for dietary filters, which the shelves already express', () => {
    // Ticking "Vegan" has always narrowed every shelf in place. Bouncing to a
    // results grid for it would be a regression dressed up as a feature.
    expect(needsResultsView(query({ dietary: ['vegan'] }))).toBe(false)
    expect(needsResultsView(EMPTY_QUERY)).toBe(false)
  })

  it('switches to results for anything the decks cannot show', () => {
    expect(needsResultsView(query({ q: 'magnesium' }))).toBe(true)
    expect(needsResultsView(query({ priceMax: 30 }))).toBe(true)
    expect(needsResultsView(query({ sort: 'price-asc' }))).toBe(true)
    expect(needsResultsView(query({ onDealOnly: true }))).toBe(true)
    expect(needsResultsView(query({ categories: ['Protein'] }))).toBe(true)
    expect(needsResultsView(query({ slots: ['hydration'] }))).toBe(true)
  })

  it('treats whitespace as no search', () => {
    expect(needsResultsView(query({ q: '   ' }))).toBe(false)
  })
})

describe('activeFilterCount', () => {
  it('counts each active facet, with a price range counting once', () => {
    expect(activeFilterCount(EMPTY_QUERY)).toBe(0)
    expect(activeFilterCount(query({ dietary: ['vegan', 'halal'], stimFree: true }))).toBe(3)
    expect(activeFilterCount(query({ slots: ['sleep'] }))).toBe(1)
    expect(activeFilterCount(query({ priceMin: 10, priceMax: 40 }))).toBe(1)
  })

  it('does not count the search text — that is not a filter chip', () => {
    expect(activeFilterCount(query({ q: 'whey' }))).toBe(0)
  })
})

describe('filtering', () => {
  it('ANDs dietary tags — the shop’s existing behaviour', () => {
    expect(ids({ dietary: ['vegan'] })).toEqual(['plant', 'salts'])
    expect(ids({ dietary: ['vegan', 'dairy-free'] })).toEqual(['plant'])
  })

  it('ORs within a facet', () => {
    expect(ids({ categories: ['Protein', 'Hydration'] })).toEqual(['whey', 'plant', 'salts'])
    expect(ids({ goals: ['energy', 'hydration'] })).toEqual(['pre', 'salts'])
  })

  it('filters on the stack slot a product fills — what the Stack Radar sets', () => {
    expect(ids({ slots: ['hydration'] })).toEqual(['salts'])
    expect(ids({ slots: ['protein', 'energy'] })).toEqual(['whey', 'plant', 'pre'])
  })

  it('matches a format case-insensitively, across all of a product’s formats', () => {
    expect(ids({ formats: ['Effervescent'] })).toEqual(['salts'])
  })

  it('filters on the price actually charged', () => {
    expect(ids({ priceMax: 25 })).toEqual(['pre', 'salts'])
    expect(ids({ priceMin: 30 })).toEqual(['whey'])
  })

  it('filters stimulants, stock, deals, subscription and rating', () => {
    expect(ids({ stimFree: true })).not.toContain('pre')
    expect(ids({ inStockOnly: true })).not.toContain('salts')
    expect(ids({ onDealOnly: true })).toEqual(['plant'])
    expect(ids({ subscribable: true })).not.toContain('salts')
    expect(ids({ minRating: 4.5 })).toEqual(['whey'])
  })

  it('drops unrated products from a rating filter rather than treating them as zero', () => {
    expect(ids({ minRating: 1 })).toEqual(['whey', 'plant'])
  })

  it('returns everything when nothing narrows it', () => {
    expect(ids({})).toEqual(['whey', 'plant', 'pre', 'salts'])
  })
})

describe('sorting', () => {
  it('sorts by price in both directions', () => {
    expect(ids({ sort: 'price-asc' })).toEqual(['salts', 'pre', 'plant', 'whey'])
    expect(ids({ sort: 'price-desc' })).toEqual(['whey', 'plant', 'pre', 'salts'])
  })

  it('sorts by biggest saving', () => {
    expect(ids({ sort: 'saving' })[0]).toBe('plant')
  })

  it('sinks unrated products rather than sorting them as zero stars', () => {
    const sorted = ids({ sort: 'rating' })
    expect(sorted.slice(0, 2)).toEqual(['whey', 'plant'])
  })

  it('leaves catalogue order alone for featured', () => {
    expect(ids({ sort: 'featured' })).toEqual(['whey', 'plant', 'pre', 'salts'])
  })
})

describe('search text', () => {
  it('narrows to the matching products, in relevance order', () => {
    expect(ids({ q: 'protein' })).toEqual(['whey', 'plant'])
  })

  it('combines with filters', () => {
    expect(ids({ q: 'protein', dietary: ['vegan'] })).toEqual(['plant'])
  })

  it('reports the fuzzy fallback so the UI can say it guessed', () => {
    const result = applyShopQuery(CATALOGUE, query({ q: 'protien' }))
    expect(result.fuzzy).toBe(true)
    expect(result.products.map((p) => p.id)).toEqual(expect.arrayContaining(['whey', 'plant']))
  })
})

describe('intent merging', () => {
  it('folds phrasing into the effective query', () => {
    const result = applyShopQuery(CATALOGUE, query({ q: 'vegan protein' }))
    expect(result.effective.dietary).toEqual(['vegan'])
    expect(result.products.map((p) => p.id)).toEqual(['plant'])
  })

  it('reads a sort out of the phrasing when none was chosen', () => {
    const result = applyShopQuery(CATALOGUE, query({ q: 'cheap protein' }))
    expect(result.effective.sort).toBe('price-asc')
    expect(result.products.map((p) => p.id)).toEqual(['plant', 'whey'])
  })

  it('never overrides a sort the shopper picked by hand', () => {
    const result = applyShopQuery(CATALOGUE, query({ q: 'cheap protein', sort: 'price-desc' }))
    expect(result.effective.sort).toBe('price-desc')
  })

  it('never overrides a price bound the shopper set by hand', () => {
    const result = applyShopQuery(CATALOGUE, query({ q: 'protein under £20', priceMax: 40 }))
    expect(result.effective.priceMax).toBe(40)
  })

  it('adds to hand-set dietary filters rather than replacing them', () => {
    const result = applyShopQuery(CATALOGUE, query({ q: 'vegan protein', dietary: ['dairy-free'] }))
    expect(result.effective.dietary.sort()).toEqual(['dairy-free', 'vegan'])
  })

  it('excludes stimulants when the phrasing asked it to', () => {
    const result = applyShopQuery(CATALOGUE, query({ q: 'stim free pre workout' }))
    expect(result.effective.stimFree).toBe(true)
    expect(result.products.map((p) => p.id)).not.toContain('pre')
  })
})

describe('facetCounts', () => {
  it('counts each option against an otherwise-unfiltered catalogue', () => {
    const counts = facetCounts(CATALOGUE, EMPTY_QUERY)
    expect(counts.categories['Protein']).toBe(2)
    expect(counts.dietary['vegan']).toBe(2)
    expect(counts.onDealOnly).toBe(1)
    expect(counts.inStockOnly).toBe(3)
  })

  it('computes each facet with its OWN constraint removed', () => {
    // With Protein selected, "Hydration" must still show the count you would get
    // by switching to it — not 0, which would make the panel a dead end.
    const counts = facetCounts(CATALOGUE, query({ categories: ['Protein'] }))
    expect(counts.categories['Hydration']).toBe(1)
    expect(counts.categories['Protein']).toBe(2)
  })

  it('still respects the OTHER facets when counting', () => {
    // Vegan is on, so category counts are of vegan products only.
    const counts = facetCounts(CATALOGUE, query({ dietary: ['vegan'] }))
    expect(counts.categories['Protein']).toBe(1)
    expect(counts.categories['Hydration']).toBe(1)
  })

  it('relaxes only the tag being counted, not the whole dietary facet', () => {
    const counts = facetCounts(CATALOGUE, query({ dietary: ['vegan', 'dairy-free'] }))
    // Dropping "dairy-free" would leave the two vegan products.
    expect(counts.dietary['vegan']).toBe(1)
    expect(counts.dietary['dairy-free']).toBe(1)
  })
})
