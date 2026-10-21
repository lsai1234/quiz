import { MOCK_CATALOGUE } from '@/lib/catalogue'
import type { CatalogueProduct } from '@/lib/catalogue/types'
import { CLAIMS } from '@/lib/consult/claims'
import { packMonthsFor } from '@/lib/last-chance/pick'
import type { QuizAnswers } from '@/lib/types'
import { cardClaim, cardFacts, goalsPrimaryFirst, selectedVariantOf, usageFor } from '../card-facts'
import type { ProductExplanation } from '../explain'

const byId = (id: string) => MOCK_CATALOGUE.find((p) => p.id === id)!
const VITAMIN_C = byId('chrgd-vitamin-c-zinc')
const ELECTROLYTES = byId('chrgd-electrolytes')
const ASHWAGANDHA = byId('chrgd-ashwagandha')

const answers = (o: Partial<QuizAnswers>) => ({ goals: [], primaryGoal: null, trainingFrequency: '3-4x', ...o }) as unknown as QuizAnswers

describe('cardFacts', () => {
  it('works out servings, cost per serving and pack length for the variant on screen', () => {
    const f = cardFacts({ product: VITAMIN_C })
    expect(f.variant?.id).toBe(VITAMIN_C.variants[0].id)
    expect(f.price).toBe(11.99)
    expect(f.servings).toBe(90)
    expect(f.perServing).toBeCloseTo(11.99 / 90, 10)
    expect(f.packMonths).toBe(3)
  })

  it("uses the slot's variant, and its own serving count", () => {
    const p: CatalogueProduct = {
      ...VITAMIN_C,
      variants: [
        { id: 'small', title: '90 tabs', flavour: null, size: '90 tabs', price: 11.99, compareAtPrice: null, available: true },
        { id: 'large', title: '180 tabs', flavour: null, size: '180 tabs', price: 18, compareAtPrice: null, available: true },
      ],
    }
    const f = cardFacts({ product: p, selectedVariantId: 'large' })
    expect([f.price, f.servings, f.perServing, f.packMonths]).toEqual([18, 180, 0.1, 6])
  })

  it('falls back to the first variant in stock, then the first', () => {
    const p: CatalogueProduct = {
      ...VITAMIN_C,
      variants: [
        { id: 'a', title: 'A', flavour: null, size: null, price: 10, compareAtPrice: null, available: false },
        { id: 'b', title: 'B', flavour: null, size: null, price: 12, compareAtPrice: null, available: true },
      ],
    }
    expect(selectedVariantOf(p, 'gone')?.id).toBe('b')
    expect(selectedVariantOf({ ...p, variants: [p.variants[0]] }, null)?.id).toBe('a')
  })

  it('sizes the pack length to their training and usage, as the last-chance card does', () => {
    const a = answers({ trainingFrequency: '5-6x' })
    const v = ELECTROLYTES.variants[0]
    expect(cardFacts({ product: ELECTROLYTES, answers: a }).packMonths).toBe(packMonthsFor(ELECTROLYTES, v, a))
    expect(cardFacts({ product: ELECTROLYTES, answers: a, usage: 'heavy' }).packMonths).toBe(packMonthsFor(ELECTROLYTES, v, a, 'heavy'))
    expect(cardFacts({ product: ELECTROLYTES, answers: a, usage: 'heavy' }).packMonths).toBeLessThan(cardFacts({ product: ELECTROLYTES, answers: a }).packMonths!)
  })

  it('knows nothing it was not told: no recorded count, no servings, cost or length', () => {
    const p = {
      ...VITAMIN_C, servings: undefined, consumption: undefined,
      variants: [{ id: 'v', title: 'Tub', flavour: null, size: null, price: 20, compareAtPrice: null, available: true }],
    } as unknown as CatalogueProduct
    expect(cardFacts({ product: p })).toMatchObject({ price: 20, servings: null, perServing: null, packMonths: null })
  })
})

describe('usageFor', () => {
  it('reads the product, then the subscription refill it ships as', () => {
    expect(usageFor({ a: 'heavy' }, { id: 'a' })).toBe('heavy')
    expect(usageFor({ refill: 'light' }, { id: 'a' }, { id: 'refill' })).toBe('light')
    expect(usageFor({ a: 'heavy', refill: 'light' }, { id: 'a' }, { id: 'refill' })).toBe('heavy')
    expect(usageFor(undefined, { id: 'a' })).toBeUndefined()
  })
})

describe('goalsPrimaryFirst', () => {
  it('moves the primary goal to the front, once', () => {
    expect(goalsPrimaryFirst({ goals: ['immune', 'energy'], primaryGoal: 'energy' })).toEqual(['energy', 'immune'])
    expect(goalsPrimaryFirst({ goals: ['immune'], primaryGoal: null })).toEqual(['immune'])
    expect(goalsPrimaryFirst(null)).toEqual([])
  })
})

describe('cardClaim', () => {
  it("is the why-line's claim when there is one, so the card and the line agree", () => {
    const explanation: ProductExplanation = { kind: 'goal', goal: 'immune', sentence: 'x', claim: CLAIMS['vitc-immune'] }
    expect(cardClaim(VITAMIN_C, explanation, answers({ goals: ['energy'], primaryGoal: 'energy' }))).toBe(CLAIMS['vitc-immune'])
  })

  it('is otherwise the claim backing their goals, primary first, else the kind\'s first', () => {
    expect(cardClaim(VITAMIN_C, null, answers({ goals: ['immune', 'energy'], primaryGoal: 'energy' }))).toBe(CLAIMS['vitc-tiredness'])
    expect(cardClaim(VITAMIN_C, null, answers({ goals: ['sleep-better'] }))).toBe(CLAIMS['vitc-immune'])
    expect(cardClaim(VITAMIN_C, null, null)).toBe(CLAIMS['vitc-immune'])
  })

  it('is null for a kind with no authorised claim, whatever they said', () => {
    expect(cardClaim(ASHWAGANDHA, null, answers({ goals: ['less-stress', 'health'] }))).toBeNull()
  })
})
