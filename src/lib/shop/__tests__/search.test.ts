import type { CatalogueProduct, CatalogueVariant } from '@/lib/catalogue/types'
import {
  buildIndex,
  normalise,
  tokenize,
  isNearMatch,
  searchProducts,
  suggestTerm,
  queryForAnalytics,
  FIELD_WEIGHTS,
} from '../search'

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

const whey = makeProduct({ id: 'whey', title: 'CHRGD Whey Protein', category: 'Protein' })
const creatine = makeProduct({
  id: 'creatine',
  title: 'CHRGD Creatine Monohydrate',
  category: 'Performance',
  stackSlots: ['performance'],
  goals: ['performance'],
  swapGroup: 'creatine',
  actives: [{ name: 'Creatine Monohydrate', mg: 5000 }],
})
const magnesium = makeProduct({
  id: 'magnesium',
  title: 'CHRGD Magnesium Glycinate',
  category: 'Sleep',
  stackSlots: ['sleep'],
  goals: ['sleep-better'],
  swapGroup: 'magnesium',
  formats: ['capsule'],
  actives: [{ name: 'Magnesium Glycinate', mg: 400 }],
})
const electrolytes = makeProduct({
  id: 'electrolytes',
  title: 'CHRGD Hydration Salts',
  category: 'Hydration',
  stackSlots: ['hydration'],
  goals: ['hydration'],
  swapGroup: 'electrolytes',
  dietaryTags: ['vegan'],
  variants: [variant({ id: 'e1', flavour: 'Citrus', size: '30 servings' })],
})

const CATALOGUE = [whey, creatine, magnesium, electrolytes]
const INDEX = buildIndex(CATALOGUE)

const ids = (query: string) => searchProducts(INDEX, query).hits.map((h) => h.product.id)

describe('normalise / tokenize', () => {
  it('lowercases, strips punctuation and collapses whitespace', () => {
    expect(normalise('  Pre-Workout,   BOOST! ')).toBe('pre workout boost')
  })

  it('strips accents so "acai" finds "açaí"', () => {
    expect(normalise('Açaí')).toBe('acai')
  })

  it('keeps the pound sign, because price phrasing depends on it', () => {
    expect(normalise('under £30')).toBe('under £30')
  })

  it('drops single-character noise', () => {
    expect(tokenize('a big b tub')).toEqual(['big', 'tub'])
  })
})

describe('field weights', () => {
  it('ranks identity above description — the whole basis of the ordering', () => {
    expect(FIELD_WEIGHTS.title).toBeGreaterThan(FIELD_WEIGHTS.category)
    expect(FIELD_WEIGHTS.category).toBeGreaterThan(FIELD_WEIGHTS.goal)
    expect(FIELD_WEIGHTS.goal).toBeGreaterThan(FIELD_WEIGHTS.variant)
    expect(FIELD_WEIGHTS.variant).toBeGreaterThan(FIELD_WEIGHTS.dietary)
    expect(FIELD_WEIGHTS.dietary).toBeGreaterThan(FIELD_WEIGHTS.active)
    expect(FIELD_WEIGHTS.active).toBeGreaterThan(FIELD_WEIGHTS.description)
  })
})

describe('searchProducts', () => {
  it('finds a product by its name', () => {
    expect(ids('whey')).toEqual(['whey'])
  })

  it('matches on a prefix, so results narrow while typing', () => {
    expect(ids('creat')).toContain('creatine')
    expect(ids('magn')).toContain('magnesium')
  })

  it('ignores prefixes shorter than two characters', () => {
    expect(searchProducts(INDEX, 'c').hits).toEqual([])
  })

  it('searches what a product is FOR, not just what it is called', () => {
    // Nothing is titled "sleep" — this only works via the goal/slot fields.
    expect(ids('sleep')).toEqual(['magnesium'])
  })

  it('searches active ingredients', () => {
    expect(ids('glycinate')).toEqual(['magnesium'])
  })

  it('searches variant flavours', () => {
    expect(ids('citrus')).toEqual(['electrolytes'])
  })

  it('ranks a title match above a category match', () => {
    // "Protein" is in one product's TITLE and only in the other's CATEGORY.
    const named = makeProduct({ id: 'named', title: 'CHRGD Protein Shaker', category: 'Hydration', stackSlots: [], goals: [], swapGroup: 'accessory' })
    const shelved = makeProduct({ id: 'shelved', title: 'CHRGD Whey Isolate', category: 'Protein' })
    const index = buildIndex([shelved, named])
    const hits = searchProducts(index, 'protein').hits
    expect(hits.map((h) => h.product.id)).toEqual(['named', 'shelved'])
  })

  it('rewards matching every token in a multi-word query', () => {
    const hits = searchProducts(INDEX, 'creatine monohydrate').hits
    expect(hits[0].product.id).toBe('creatine')
  })

  it('returns nothing for a query that matches nothing', () => {
    expect(searchProducts(INDEX, 'bicycle').hits).toEqual([])
  })

  it('returns nothing for an empty query rather than everything', () => {
    expect(searchProducts(INDEX, '   ').hits).toEqual([])
  })
})

describe('relevance is never sold', () => {
  it('does not let marginPriority outrank a better textual match', () => {
    const exact = makeProduct({ id: 'exact', title: 'CHRGD Magnesium', marginPriority: 1, recommendationPriority: 1 })
    const profitable = makeProduct({ id: 'profitable', title: 'CHRGD Whey', description: 'Pairs well with magnesium', marginPriority: 10, recommendationPriority: 10 })
    const index = buildIndex([profitable, exact])
    expect(searchProducts(index, 'magnesium').hits[0].product.id).toBe('exact')
  })

  it('breaks a genuine tie on stock and roster position, not on margin', () => {
    const soldOut = makeProduct({ id: 'sold-out', title: 'CHRGD Creatine', marginPriority: 10, variants: [variant({ available: false })] })
    const stocked = makeProduct({ id: 'stocked', title: 'CHRGD Creatine', marginPriority: 1 })
    const index = buildIndex([soldOut, stocked])
    expect(searchProducts(index, 'creatine').hits[0].product.id).toBe('stocked')

    const rostered = makeProduct({ id: 'rostered', title: 'CHRGD Creatine', topRank: 2, marginPriority: 1 })
    const unrostered = makeProduct({ id: 'unrostered', title: 'CHRGD Creatine', marginPriority: 10 })
    const index2 = buildIndex([unrostered, rostered])
    expect(searchProducts(index2, 'creatine').hits[0].product.id).toBe('rostered')
  })
})

describe('isNearMatch', () => {
  it('accepts one substitution, insertion, deletion or transposition', () => {
    expect(isNearMatch('creatine', 'craatine')).toBe(true)  // substitution
    expect(isNearMatch('creatiine', 'creatine')).toBe(true) // insertion
    expect(isNearMatch('cretine', 'creatine')).toBe(true)   // deletion
    expect(isNearMatch('cretaine', 'creatine')).toBe(true)  // transposition
  })

  it('rejects two edits, and rejects an identical string', () => {
    expect(isNearMatch('craatinn', 'creatine')).toBe(false)
    expect(isNearMatch('creatine', 'creatine')).toBe(false)
    expect(isNearMatch('ab', 'abcd')).toBe(false)
  })
})

describe('the fuzzy fallback', () => {
  it('rescues a typo', () => {
    const result = searchProducts(INDEX, 'creatiine')
    expect(result.fuzzy).toBe(true)
    expect(result.hits.map((h) => h.product.id)).toContain('creatine')
  })

  it('does NOT fire when the exact pass already found something', () => {
    // "whey" is exact. A fuzzy pass would also drag in near-miss tokens; the
    // point of gating it on zero results is that a working query stays tight.
    const result = searchProducts(INDEX, 'whey')
    expect(result.fuzzy).toBe(false)
    expect(result.hits).toHaveLength(1)
  })

  it('leaves short tokens alone — three letters are too easy to collide', () => {
    expect(searchProducts(INDEX, 'zap').hits).toEqual([])
  })

  it('can be turned off entirely', () => {
    expect(searchProducts(INDEX, 'creatiine', { fuzzy: false }).hits).toEqual([])
  })
})

describe('suggestTerm', () => {
  it('suggests the nearest real term for a typo', () => {
    expect(suggestTerm(INDEX, 'creatiine')).toBe('creatine')
  })

  it('suggests nothing for a term that already exists', () => {
    expect(suggestTerm(INDEX, 'creatine')).toBeNull()
  })

  it('suggests nothing when there is no near term', () => {
    expect(suggestTerm(INDEX, 'bicycle')).toBeNull()
  })
})

describe('queryForAnalytics', () => {
  it('normalises and passes an ordinary query through', () => {
    expect(queryForAnalytics('  Vegan Protein  ')).toBe('vegan protein')
  })

  it('caps the length', () => {
    expect(queryForAnalytics('a'.repeat(200))).toHaveLength(64)
  })

  it('drops anything that looks like contact data rather than a product', () => {
    expect(queryForAnalytics('someone@example.com')).toBeNull()
    expect(queryForAnalytics('order 1234567')).toBeNull()
  })

  it('returns null for an empty query so callers omit the property', () => {
    expect(queryForAnalytics('   ')).toBeNull()
  })
})
