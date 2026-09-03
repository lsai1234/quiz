import type { CatalogueProduct, CatalogueVariant } from '@/lib/catalogue/types'
import { buildDuel, decisiveRowCount, type DuelRow } from '../duel'

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

const row = (rows: DuelRow[], key: string) => rows.find((r) => r.key === key)!

/** £34.99 over 30 servings — £1.17 each. */
const WHEY = makeProduct({
  id: 'whey', title: 'CHRGD Whey Protein', servings: 30,
  variants: [variant({ id: 'w1', size: '1kg', price: 34.99, flavour: 'Chocolate' })],
  rating: { average: 4.6, count: 220 },
  actives: [{ name: 'Whey Isolate', mg: 24000 }],
  dietaryTags: ['gluten-free'],
})

/** £42.99 over 60 servings — 72p each. Dearer up front, better per serving. */
const BULK = makeProduct({
  id: 'bulk', title: 'CHRGD Bulk Whey', servings: 60,
  variants: [variant({ id: 'b1', size: '2kg', price: 42.99 })],
  rating: { average: 4.2, count: 90 },
  formats: ['powder'],
  dietaryTags: ['gluten-free', 'halal'],
})

describe('buildDuel', () => {
  it('compares both products at the variant the shelf card prices', () => {
    const duel = buildDuel(WHEY, BULK)
    expect(duel.variantLabels[0]).toBe('Chocolate · 1kg')
    expect(duel.variantLabels[1]).toBe('2kg')
  })

  it('leads with price per serving — the question the sheet exists to answer', () => {
    expect(buildDuel(WHEY, BULK).rows[0].key).toBe('per-serving')
  })

  /**
   * The headline, and the reason `per-serving.ts` scales by container size: the
   * dearer product is the better value here, and a sheet that could not say so
   * would be worth nothing.
   */
  it('crowns the cheaper serving even when it is the dearer product', () => {
    const rows = buildDuel(WHEY, BULK).rows
    expect(row(rows, 'per-serving')).toMatchObject({ winner: 1 })
    expect(row(rows, 'per-serving').cells[0].text).toBe('£1.17')
    expect(row(rows, 'per-serving').cells[1].text).toBe('72p')
    // …while the plain price row still goes the other way.
    expect(row(rows, 'price')).toMatchObject({ winner: 0 })
  })

  it('says what the loser is better for when that is true', () => {
    // WHEY is cheaper up front; BULK goes further per serving. Each loses one
    // money row and has a genuine consolation on it.
    const rows = buildDuel(WHEY, BULK).rows
    expect(row(rows, 'per-serving').note).toBe('Costs less up front.')
    expect(row(rows, 'price').note).toBe('May go further per serving.')
    expect(row(rows, 'servings').note).toBe('A smaller commitment.')
  })

  /**
   * The regression that came out of looking at the rendered sheet. Vitamin D3
   * (£12.99, 60 servings → 22p) beats a multivitamin (£16.99, 30 → 57p) on BOTH
   * money rows, and the boilerplate consolations claimed the loser "costs less
   * up front" and "may go further per serving" — neither of which was true.
   */
  it('offers NO consolation when one product simply wins on the money', () => {
    const cheapAndEfficient = makeProduct({
      id: 'd3', servings: 60, variants: [variant({ id: 'd', size: '60 caps', price: 12.99 })],
    })
    const dearAndWorse = makeProduct({
      id: 'multi', servings: 30, variants: [variant({ id: 'm', size: '60 caps', price: 16.99 })],
    })
    const rows = buildDuel(cheapAndEfficient, dearAndWorse).rows

    expect(row(rows, 'per-serving').winner).toBe(0)
    expect(row(rows, 'price').winner).toBe(0)
    // Silence is the honest answer; a reassurance that is false is worse.
    expect(row(rows, 'per-serving').note).toBeUndefined()
    expect(row(rows, 'price').note).toBeUndefined()
    // The servings row still has a true one: fewer servings IS a smaller buy.
    expect(row(rows, 'servings').note).toBe('A smaller commitment.')
  })

  it('scores more servings as better, and rates on the average', () => {
    const rows = buildDuel(WHEY, BULK).rows
    expect(row(rows, 'servings')).toMatchObject({ winner: 1 })
    expect(row(rows, 'servings').cells[1].text).toBe('60')
    expect(row(rows, 'rating')).toMatchObject({ winner: 0 })
    expect(row(rows, 'rating').cells[0].text).toBe('4.6 (220)')
  })

  it('prefers what is in stock', () => {
    const soldOut = makeProduct({ id: 's', variants: [variant({ id: 'sv', available: false })] })
    const rows = buildDuel(WHEY, soldOut).rows
    expect(row(rows, 'stock')).toMatchObject({ winner: 0 })
    expect(row(rows, 'stock').cells[1].text).toBe('Sold out')
  })

  /**
   * Rule 1: a row only has a winner where "better" is a fact. Powder versus
   * capsules is a preference, and crowning one would be inventing a verdict the
   * data does not support.
   */
  it('scores no winner on a preference', () => {
    const caps = makeProduct({ id: 'c', formats: ['capsule'], dietaryTags: ['vegan'] })
    const rows = buildDuel(WHEY, caps).rows
    for (const key of ['format', 'dietary', 'onset', 'actives']) {
      expect(row(rows, key).winner).toBeNull()
      expect(row(rows, key).note).toBeUndefined()
    }
  })

  it('scores no winner on a tie', () => {
    const rows = buildDuel(WHEY, { ...WHEY, id: 'clone' }).rows
    expect(rows.every((r) => r.winner === null)).toBe(true)
  })

  it('shows nothing rather than a guess when a figure is unknown', () => {
    const noRating = makeProduct({ id: 'n', rating: undefined })
    const rows = buildDuel(noRating, { ...noRating, id: 'n2' }).rows
    expect(row(rows, 'rating').cells[0].text).toBeNull()
    expect(row(rows, 'rating').winner).toBeNull()
    expect(row(rows, 'actives').cells[0].text).toBeNull()
  })

  it('never crowns a column whose figure is unknown', () => {
    // A free price makes the per-serving figure unknowable rather than infinite.
    const unpriced = makeProduct({ id: 'x', variants: [variant({ id: 'x1', price: 0 })] })
    const rows = buildDuel(WHEY, unpriced).rows
    expect(row(rows, 'per-serving').cells[1].text).toBeNull()
    expect(row(rows, 'per-serving').winner).toBeNull()
  })

  it('renders doses in grams once they pass a gram', () => {
    const rows = buildDuel(WHEY, BULK).rows
    expect(row(rows, 'actives').cells[0].text).toBe('Whey Isolate 24g')
  })

  it('lists dietary tags rather than scoring them', () => {
    const rows = buildDuel(WHEY, BULK).rows
    expect(row(rows, 'dietary').cells[1].text).toBe('Gluten-free · Halal')
  })
})

describe('decisiveRowCount', () => {
  it('counts only the rows that actually separate the two', () => {
    expect(decisiveRowCount(buildDuel(WHEY, BULK))).toBeGreaterThan(0)
    expect(decisiveRowCount(buildDuel(WHEY, { ...WHEY, id: 'clone' }))).toBe(0)
  })
})
