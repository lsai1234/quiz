import type { CatalogueProduct, CatalogueVariant } from '@/lib/catalogue/types'
import { EMPTY_QUERY, type ShopQuery } from '../shop-query'
import { rouletteEntries, entryWeight, pickEntry, spin, entryLabel, entryDeal } from '../roulette'

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

const WHEY = makeProduct({
  id: 'whey', title: 'CHRGD Whey Protein',
  variants: [
    variant({ id: 'w-choc', flavour: 'Chocolate Fudge', size: '1kg', price: 34.99 }),
    variant({ id: 'w-van', flavour: 'Vanilla', size: '1kg', price: 34.99 }),
    variant({ id: 'w-gone', flavour: 'Discontinued', size: '1kg', price: 34.99, available: false }),
  ],
})

const PLANT = makeProduct({
  id: 'plant', title: 'CHRGD Plant Protein', dietaryTags: ['vegan'],
  variants: [variant({ id: 'pl-choc', flavour: 'Chocolate Brownie', size: '1kg', price: 36.99 })],
})

const SOLD_OUT = makeProduct({
  id: 'gone', title: 'CHRGD Gone',
  variants: [variant({ id: 'g1', available: false })],
})

const CATALOGUE = [WHEY, PLANT, SOLD_OUT]
const query = (over: Partial<ShopQuery> = {}): ShopQuery => ({ ...EMPTY_QUERY, ...over })

/** A deterministic stand-in for Math.random, walking the given values. */
function seeded(...values: number[]): () => number {
  let i = 0
  return () => values[Math.min(i++, values.length - 1)]
}

/**
 * The three guardrails. A wheel that lands on something you cannot buy, or
 * cannot eat, or that is not the price we then charge, is a broken toy — and
 * "it's only a game" is exactly the reasoning that would let one ship.
 */
describe('the guardrails', () => {
  it('never offers a variant that is out of stock', () => {
    const entries = rouletteEntries(CATALOGUE, EMPTY_QUERY)
    expect(entries.every((e) => e.variant.available)).toBe(true)
    expect(entries.map((e) => e.variant.id)).not.toContain('w-gone')
    expect(entries.map((e) => e.product.id)).not.toContain('gone')
  })

  it('never offers something the shopper has filtered out', () => {
    const entries = rouletteEntries(CATALOGUE, query({ dietary: ['vegan'] }))
    expect(entries.map((e) => e.product.id)).toEqual(['plant'])
  })

  it('honours every other filter too, through the same code the grid uses', () => {
    expect(rouletteEntries(CATALOGUE, query({ priceMax: 35 })).every((e) => e.variant.price <= 36.99)).toBe(true)
    expect(rouletteEntries(CATALOGUE, query({ categories: ['Hydration'] }))).toEqual([])
  })

  it('ignores the SEARCH TEXT — a spin inside a question is a different gesture', () => {
    const entries = rouletteEntries(CATALOGUE, query({ q: 'nothing matches this at all' }))
    expect(entries.length).toBeGreaterThan(0)
  })

  it('offers nothing when the filters leave nothing buyable', () => {
    expect(rouletteEntries([SOLD_OUT], EMPTY_QUERY)).toEqual([])
    expect(pickEntry([])).toBeNull()
  })
})

describe('the weighting', () => {
  it('gives every eligible variant a real chance', () => {
    const entries = rouletteEntries(CATALOGUE, EMPTY_QUERY)
    expect(entries.every((e) => e.weight >= 1)).toBe(true)
  })

  it('leans towards a discounted line', () => {
    const plain = entryWeight(WHEY, variant({ price: 30 }))
    const discounted = entryWeight(WHEY, variant({ price: 30, compareAtPrice: 40 }))
    expect(discounted).toBeGreaterThan(plain)
  })

  it('leans towards a variant we hold a lot of', () => {
    const scarce = entryWeight(WHEY, variant({ inventory: 5 }))
    const plenty = entryWeight(WHEY, variant({ inventory: 250 }))
    expect(plenty).toBeGreaterThan(scarce)
  })

  it('ignores inventory nobody is tracking rather than assuming plenty', () => {
    expect(entryWeight(WHEY, variant({ inventory: null }))).toBe(entryWeight(WHEY, variant({ inventory: 5 })))
  })

  /**
   * The one place in this shop where margin may steer what surfaces. A search is
   * a question and is owed the best answer — `search.test.ts` asserts margin
   * cannot touch it. A lever is a game, and which surprise arrives is ours.
   */
  it('leans towards a higher-margin product — deliberately, and only here', () => {
    const low = entryWeight(makeProduct({ marginPriority: 1 }), variant())
    const high = entryWeight(makeProduct({ marginPriority: 10 }), variant())
    expect(high).toBeGreaterThan(low)
  })

  it('does not let margin below the midpoint push a product down', () => {
    expect(entryWeight(makeProduct({ marginPriority: 1 }), variant()))
      .toBe(entryWeight(makeProduct({ marginPriority: 5 }), variant()))
  })
})

describe('pickEntry', () => {
  const entries = [
    { product: WHEY, variant: WHEY.variants[0], weight: 1 },
    { product: WHEY, variant: WHEY.variants[1], weight: 3 },
  ]

  it('lands in the band the weights describe', () => {
    expect(pickEntry(entries, seeded(0))!.variant.id).toBe('w-choc')
    expect(pickEntry(entries, seeded(0.2))!.variant.id).toBe('w-choc')
    expect(pickEntry(entries, seeded(0.3))!.variant.id).toBe('w-van')
    expect(pickEntry(entries, seeded(0.99))!.variant.id).toBe('w-van')
  })

  it('always returns something for a non-empty wheel, whatever the random gives', () => {
    for (const r of [0, 0.5, 0.999999, 1]) {
      expect(pickEntry(entries, seeded(r))).not.toBeNull()
    }
  })

  it('falls back to the first entry when every weight is zero', () => {
    const flat = entries.map((e) => ({ ...e, weight: 0 }))
    expect(pickEntry(flat, seeded(0.5))!.variant.id).toBe('w-choc')
  })
})

describe('spin', () => {
  it('avoids landing on the same thing twice in a row', () => {
    for (const r of [0, 0.25, 0.5, 0.75, 0.99]) {
      expect(spin(CATALOGUE, EMPTY_QUERY, 'w-choc', seeded(r))!.variant.id).not.toBe('w-choc')
    }
  })

  it('will repeat rather than return nothing when it is the only option left', () => {
    const only = spin([PLANT], EMPTY_QUERY, 'pl-choc', seeded(0.5))
    expect(only!.variant.id).toBe('pl-choc')
  })

  it('returns nothing when there is nothing to land on', () => {
    expect(spin([SOLD_OUT], EMPTY_QUERY, null, seeded(0.5))).toBeNull()
  })
})

describe('presentation', () => {
  it('names the flavour and size', () => {
    expect(entryLabel({ product: WHEY, variant: WHEY.variants[0], weight: 1 })).toBe('Chocolate Fudge · 1kg')
  })

  it('falls back to the variant title when there is no flavour or size', () => {
    expect(entryLabel({ product: WHEY, variant: variant({ title: 'Standard' }), weight: 1 })).toBe('Standard')
  })

  it('reports the saving on the landed variant, not the product default', () => {
    const deal = entryDeal({ product: WHEY, variant: variant({ price: 30, compareAtPrice: 40 }), weight: 1 })
    expect(deal).toEqual({ onDeal: true, pct: 25 })
    expect(entryDeal({ product: WHEY, variant: variant({ price: 30 }), weight: 1 }).onDeal).toBe(false)
  })
})
