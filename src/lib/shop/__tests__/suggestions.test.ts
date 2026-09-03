import type { CatalogueProduct, CatalogueVariant } from '@/lib/catalogue/types'
import { MOCK_CATALOGUE } from '@/lib/catalogue/mock-catalogue'
import { buildIndex } from '../search'
import { EMPTY_QUERY, applyShopQuery } from '../shop-query'
import {
  buildSuggestions,
  EXAMPLE_QUERIES,
  jumpPatch,
  MAX_PRODUCT_SUGGESTIONS,
  MAX_JUMP_SUGGESTIONS,
  type Suggestion,
} from '../suggestions'

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

const PRODUCTS = [
  makeProduct({ id: 'whey', title: 'CHRGD Whey Protein', category: 'Protein' }),
  makeProduct({ id: 'plant', title: 'CHRGD Plant Protein', category: 'Protein', dietaryTags: ['vegan'], swapGroup: 'protein-plant' }),
  makeProduct({ id: 'casein', title: 'CHRGD Slow Release Casein', category: 'Protein', swapGroup: 'protein-whey' }),
  makeProduct({
    id: 'magnesium', title: 'CHRGD Magnesium Glycinate', category: 'Sleep',
    stackSlots: ['sleep'], goals: ['sleep-better'], swapGroup: 'magnesium', formats: ['capsule'],
  }),
  makeProduct({
    id: 'salts', title: 'CHRGD Hydration Salts', category: 'Hydration',
    stackSlots: ['hydration'], goals: ['hydration'], dietaryTags: ['vegan'], swapGroup: 'electrolytes',
  }),
]

const INDEX = buildIndex(PRODUCTS)

const build = (query: string, recent: string[] = []) =>
  buildSuggestions({ index: INDEX, products: PRODUCTS, query, recent })

const kinds = (s: Suggestion[]) => s.map((x) => x.kind)
const ids = (s: Suggestion[]) => s.map((x) => x.id)

describe('an empty box', () => {
  it('leads with recent searches', () => {
    const out = build('', ['whey', 'magnesium'])
    expect(out.slice(0, 2).map((s) => (s.kind === 'recent' ? s.query : ''))).toEqual(['whey', 'magnesium'])
  })

  /**
   * Nothing else on the page says a whole sentence works here, and a placeholder
   * cannot carry that. A tappable "vegan protein under £30" teaches it in one go.
   */
  it('offers example sentences when there is no history to show', () => {
    const out = build('')
    expect(out.length).toBeGreaterThan(0)
    expect(out.every((s) => s.kind === 'example')).toBe(true)
  })

  it('lets history push the examples out as it fills up', () => {
    const full = build('', ['a1', 'b2', 'c3', 'd4', 'e5'])
    expect(full.every((s) => s.kind === 'recent')).toBe(true)

    const partial = build('', ['whey'])
    expect(kinds(partial)[0]).toBe('recent')
    expect(kinds(partial)).toContain('example')
  })

  it('does not offer an example the shopper has already run', () => {
    const out = build('', [EXAMPLE_QUERIES[0]])
    const examples = out.filter((s) => s.kind === 'example').map((s) => (s.kind === 'example' ? s.query : ''))
    expect(examples).not.toContain(EXAMPLE_QUERIES[0])
  })

  it('still answers the empty-box question for a single character', () => {
    expect(kinds(build('m', ['whey']))[0]).toBe('recent')
  })

  /**
   * Asserted against the REAL catalogue, not the fixture above: an example that
   * returns nothing teaches the wrong lesson twice over, and whether it returns
   * anything depends on what the shop actually stocks. This fails the day an
   * example outlives the products behind it.
   */
  it('only offers examples the real shop can actually answer', () => {
    const index = buildIndex(MOCK_CATALOGUE)
    for (const example of EXAMPLE_QUERIES) {
      // The RESULT SET, not the suggestion list. An earlier version of this
      // checked suggestions, which search the parsed text without applying the
      // filters — so "vegan protein under £30" looked fine here while returning
      // nothing in the shop, because the cheapest vegan protein is £36.99.
      const result = applyShopQuery(MOCK_CATALOGUE, { ...EMPTY_QUERY, q: example }, index)
      expect(result.products.length).toBeGreaterThan(0)
    }
  })
})

describe('a typed query', () => {
  it('leads with products', () => {
    const out = build('whey')
    expect(out[0]).toMatchObject({ kind: 'product', id: 'product:whey' })
  })

  it('drops recents once there is something real to offer', () => {
    const out = build('whey', ['magnesium', 'creatine'])
    expect(kinds(out)).not.toContain('recent')
  })

  it('caps the product rows — past a handful, the grid is the right answer', () => {
    const many = Array.from({ length: 12 }, (_, i) =>
      makeProduct({ id: `p${i}`, title: `CHRGD Protein ${i}` }),
    )
    const out = buildSuggestions({
      index: buildIndex(many), products: many, query: 'protein', recent: [],
    })
    expect(out.filter((s) => s.kind === 'product')).toHaveLength(MAX_PRODUCT_SUGGESTIONS)
  })

  it('offers a shelf to jump to when the words name one', () => {
    const out = build('hydration')
    const jump = out.find((s) => s.kind === 'jump')
    expect(jump).toMatchObject({ kind: 'jump', facet: 'category', value: 'Hydration', count: 1 })
  })

  it('offers a goal, which is not a product and not a category', () => {
    const out = build('sleep')
    expect(out.some((s) => s.kind === 'jump' && s.facet === 'goal' && s.value === 'sleep-better')).toBe(true)
  })

  it('offers a dietary tag', () => {
    const out = build('vegan')
    const jump = out.find((s) => s.kind === 'jump' && s.facet === 'dietary')
    expect(jump).toMatchObject({ value: 'vegan', label: 'Vegan', count: 2 })
  })

  it('matches a facet on a word PREFIX, not a substring', () => {
    // "gut" may offer Gut Health; "health" must not drag Gut Health in beside it
    // just because the word appears in the middle of the name.
    const out = build('health')
    const values = out.filter((s) => s.kind === 'jump').map((s) => (s.kind === 'jump' ? s.value : ''))
    expect(values).not.toContain('Gut Health')
  })

  it('caps the jump rows so products always dominate', () => {
    const out = build('protein')
    expect(out.filter((s) => s.kind === 'jump').length).toBeLessThanOrEqual(MAX_JUMP_SUGGESTIONS)
  })

  it('puts the biggest shelf first — a jump should land somewhere worth being', () => {
    const jumps = build('protein').filter((s) => s.kind === 'jump')
    const counts = jumps.map((s) => (s.kind === 'jump' ? s.count : 0))
    expect([...counts]).toEqual([...counts].sort((a, b) => b - a))
  })

  it('searches the parsed text, so a phrasing word does not sink the match', () => {
    // "vegan" becomes a filter rather than a search term; the products offered
    // should be the proteins, not every vegan product in the shop.
    const out = build('vegan protein')
    const productIds = out.filter((s) => s.kind === 'product').map((s) => s.id)
    expect(productIds).toContain('product:plant')
    expect(productIds).not.toContain('product:salts')
  })

  it('offers nothing rather than guessing when nothing matches', () => {
    expect(build('bicycle')).toEqual([])
  })

  it('gives every row a stable, unique id for the keyboard to track', () => {
    const out = build('protein')
    expect(new Set(ids(out)).size).toBe(out.length)
  })
})

describe('jumpPatch', () => {
  it('turns each kind of jump into the right filter', () => {
    expect(jumpPatch({ kind: 'jump', id: 'j', facet: 'category', value: 'Sleep', label: 'Sleep', count: 1 }))
      .toEqual({ categories: ['Sleep'] })
    expect(jumpPatch({ kind: 'jump', id: 'j', facet: 'goal', value: 'sleep-better', label: 'Sleep better', count: 1 }))
      .toEqual({ goals: ['sleep-better'] })
    expect(jumpPatch({ kind: 'jump', id: 'j', facet: 'dietary', value: 'vegan', label: 'Vegan', count: 2 }))
      .toEqual({ dietary: ['vegan'] })
  })
})
