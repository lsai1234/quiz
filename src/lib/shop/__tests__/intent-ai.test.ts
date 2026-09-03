import type { CatalogueProduct, CatalogueVariant } from '@/lib/catalogue/types'
import { isClaimSafe } from '../claim-safety'
import {
  parseIntentResult,
  buildIntentPrompt,
  shouldAskModel,
  isEmptyPatch,
  EMPTY_PATCH,
  SHOP_INTENT_SYSTEM_PROMPT,
} from '../intent-ai'

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
  makeProduct({ id: 'whey', category: 'Protein' }),
  makeProduct({ id: 'salts', category: 'Hydration', stackSlots: ['hydration'] }),
]

const parse = (raw: unknown) => parseIntentResult(raw, PRODUCTS)

describe('the prompt', () => {
  it('offers the model only vocabulary the catalogue actually has', () => {
    const prompt = buildIntentPrompt('something for cramp', PRODUCTS)
    expect(prompt).toContain('Protein')
    expect(prompt).toContain('Hydration')
    expect(prompt).toContain('hydration (Hydration)')
    expect(prompt).toContain('vegan (Vegan)')
  })

  it('caps a pasted essay', () => {
    expect(buildIntentPrompt('x'.repeat(500), PRODUCTS)).toContain('x'.repeat(200))
    expect(buildIntentPrompt('x'.repeat(500), PRODUCTS)).not.toContain('x'.repeat(201))
  })

  it('tells the model it is sorting a shelf, not giving health advice', () => {
    expect(SHOP_INTENT_SYSTEM_PROMPT).toMatch(/never diagnose/i)
    expect(SHOP_INTENT_SYSTEM_PROMPT).toMatch(/sorting a shelf/i)
    expect(isClaimSafe(SHOP_INTENT_SYSTEM_PROMPT)).toBe(true)
  })
})

/**
 * The model is a suggestion engine, never a source of truth. Every one of these
 * is a completion a language model will eventually produce, and none of them may
 * reach a query.
 */
describe('parseIntentResult keeps only what the catalogue can honour', () => {
  it('reads a well-formed patch', () => {
    const patch = parse({
      dietary: ['vegan'], goals: ['hydration'], slots: ['hydration'],
      categories: ['Hydration'], priceMax: 30, priceMin: null, stimFree: true, text: 'electrolytes',
    })
    expect(patch).toEqual({
      dietary: ['vegan'], goals: ['hydration'], slots: ['hydration'],
      categories: ['Hydration'], priceMax: 30, priceMin: null, stimFree: true, text: 'electrolytes',
    })
  })

  it('accepts a JSON string as well as an object', () => {
    expect(parse('{"dietary":["vegan"]}').dietary).toEqual(['vegan'])
  })

  it('drops a dietary tag we do not have', () => {
    expect(parse({ dietary: ['vegan', 'paleo', 'carnivore'] }).dietary).toEqual(['vegan'])
  })

  it('drops a goal and a slot that are not ours', () => {
    expect(parse({ goals: ['muscle', 'levitation'] }).goals).toEqual(['muscle'])
    expect(parse({ slots: ['protein', 'telepathy'] }).slots).toEqual(['protein'])
  })

  it('drops a category nobody stocks', () => {
    expect(parse({ categories: ['Protein', 'Nootropics'] }).categories).toEqual(['Protein'])
  })

  it('refuses a price that is not a sensible amount of money', () => {
    expect(parse({ priceMax: -5 }).priceMax).toBeNull()
    expect(parse({ priceMax: 0 }).priceMax).toBeNull()
    expect(parse({ priceMax: 999999 }).priceMax).toBeNull()
    expect(parse({ priceMax: 'thirty' }).priceMax).toBeNull()
    expect(parse({ priceMax: 29.994 }).priceMax).toBe(29.99)
  })

  it('treats anything but true as false for stimFree', () => {
    expect(parse({ stimFree: 'yes' }).stimFree).toBe(false)
    expect(parse({ stimFree: 1 }).stimFree).toBe(false)
    expect(parse({ stimFree: true }).stimFree).toBe(true)
  })

  it('caps and trims the leftover text', () => {
    expect(parse({ text: '  whey  ' }).text).toBe('whey')
    expect(parse({ text: 'x'.repeat(200) }).text).toHaveLength(80)
    expect(parse({ text: 42 }).text).toBe('')
  })

  it('caps how many values it will take from one field', () => {
    expect(parse({ goals: [...Array(30)].map(() => 'muscle') }).goals).toEqual(['muscle'])
    const many = parse({ goals: ['muscle', 'energy', 'recovery', 'health', 'focus', 'immune'] })
    expect(many.goals.length).toBeLessThanOrEqual(5)
  })

  it('matches values case-insensitively, because models are inconsistent', () => {
    expect(parse({ dietary: ['VEGAN'] }).dietary).toEqual(['vegan'])
    expect(parse({ categories: ['protein'] }).categories).toEqual(['Protein'])
  })

  it('reduces anything malformed to nothing rather than throwing', () => {
    expect(parse('not json')).toEqual(EMPTY_PATCH)
    expect(parse(null)).toEqual(EMPTY_PATCH)
    expect(parse(undefined)).toEqual(EMPTY_PATCH)
    expect(parse(42)).toEqual(EMPTY_PATCH)
    expect(parse({ dietary: 'vegan' })).toEqual(EMPTY_PATCH)
    expect(parse({})).toEqual(EMPTY_PATCH)
  })

  it('ignores keys it was not expecting', () => {
    expect(parse({ diagnosis: 'iron deficiency', advice: 'see a doctor' })).toEqual(EMPTY_PATCH)
  })
})

describe('isEmptyPatch', () => {
  it('is true for a patch that would change nothing', () => {
    expect(isEmptyPatch(EMPTY_PATCH)).toBe(true)
    expect(isEmptyPatch({ ...EMPTY_PATCH, text: '   ' })).toBe(true)
  })

  it('is false as soon as there is something to apply', () => {
    expect(isEmptyPatch({ ...EMPTY_PATCH, dietary: ['vegan'] })).toBe(false)
    expect(isEmptyPatch({ ...EMPTY_PATCH, stimFree: true })).toBe(false)
    expect(isEmptyPatch({ ...EMPTY_PATCH, text: 'whey' })).toBe(false)
  })
})

/**
 * The gate. A query that already works must never be made slower or less
 * predictable by a network round trip.
 */
describe('shouldAskModel', () => {
  it('does not ask when the local search already found something', () => {
    expect(shouldAskModel('something for cramp on runs', 3, 0)).toBe(false)
  })

  it('does not ask when the table already read the sentence', () => {
    expect(shouldAskModel('vegan protein no caffeine', 0, 2)).toBe(false)
  })

  it('does not ask about one or two words — that is a typo, not a sentence', () => {
    expect(shouldAskModel('creatiine', 0, 0)).toBe(false)
    expect(shouldAskModel('whey protien', 0, 0)).toBe(false)
  })

  it('asks about a sentence nothing else could read', () => {
    expect(shouldAskModel('something for cramp on long runs', 0, 0)).toBe(true)
  })
})
