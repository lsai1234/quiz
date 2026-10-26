import {
  lastsLabel, packLengthLabel, packLengthShort, perServingLabel, productFacts, stackProductFacts,
} from '../product-facts'
import type { CatalogueProduct } from '../catalogue/types'

/**
 * No onset fact ("You'll feel it — within a few weeks") anywhere: a felt-effect
 * window says the product does something, an implied health claim.
 */

function product(over: Partial<CatalogueProduct> = {}): CatalogueProduct {
  return {
    id: 'p', title: 'P', handle: 'p', description: '', imageUrl: null, category: 'Sleep',
    stackSlots: ['sleep'], goals: ['sleep-better'], dietaryTags: [], formats: ['capsule'],
    variants: [{ id: 'v', title: 'V', flavour: null, size: null, price: 15, compareAtPrice: null, available: true }],
    basePrice: 15, compareAtPrice: null, subscriptionEligible: true, servings: 60,
    swapGroup: 'magnesium', recommendationPriority: 5, marginPriority: 5, isCoreEligible: true,
    isBoosterEligible: false, hasStimulants: false, shortReason: '', warnings: [],
    effectOnset: 'short', ...over,
  }
}

describe('productFacts', () => {
  it('gives the format and the servings, and never when you will feel it', () => {
    const facts = productFacts(product())
    expect(facts.map((f) => f.key)).toEqual(['format', 'servings'])
    expect(facts.some((f) => /feel/i.test(f.label) || /feel/i.test(f.value))).toBe(false)
  })

  it('gives an accessory its one fact', () => {
    const shaker = product({ swapGroup: 'accessory', category: 'Accessories', formats: ['accessory'] })
    expect(productFacts(shaker).map((f) => f.key)).toEqual(['format'])
  })
})

/**
 * The pack length as the last-chance card words it (LastChanceView `packLabel`),
 * so the results cards and that card never disagree about the same pack.
 */
describe('packLengthLabel', () => {
  it.each([
    [0.2, 'about 1 week'],
    [0.5, 'about 2 weeks'],
    [0.7, 'about 3 weeks'],
    [0.8, 'about a month'],
    [1.2, 'about a month'],
    [1.25, 'about six weeks'],
    [1.7, 'about six weeks'],
    [1.75, 'about two months'],
    [3.3, 'about three months'],
    [6, 'about six months'],
    [9.4, 'about 9 months'],
  ])('%s months is "%s"', (months, label) => {
    expect(packLengthLabel(months)).toBe(label)
  })

  it('has a short form in figures for a narrow cell, rounded the same way', () => {
    expect([0.5, 1, 1.5, 2, 3.3, 15].map(packLengthShort)).toEqual(
      ['2 weeks', '1 month', '6 weeks', '2 months', '3 months', '15 months'],
    )
  })

  it('reads as a sentence on its own', () => {
    expect(lastsLabel(2)).toBe('Lasts about two months')
  })
})

describe('perServingLabel', () => {
  it("uses the shop's per-serving format: pence below a pound, pounds above", () => {
    expect(perServingLabel(0.25)).toBe('25p a serving')
    expect(perServingLabel(11.99 / 90)).toBe('13p a serving')
    expect(perServingLabel(0.995)).toBe('£1.00 a serving')
    expect(perServingLabel(1.1663)).toBe('£1.17 a serving')
  })
})

describe('stackProductFacts', () => {
  it('lists format, servings, cost per serving and pack length, in that order', () => {
    const facts = stackProductFacts(product(), { servings: 60, perServing: 0.25, packMonths: 2 }, { atYourUsage: true })
    expect(facts.map((f) => [f.label, f.value])).toEqual([
      ['Format', 'Capsules'],
      ['Per unit', '60 servings'],
      ['Cost per serving', '25p'],
      ['Lasts', 'About two months at your usage'],
    ])
  })

  it('leaves out what is not known, and never makes an onset promise', () => {
    const facts = stackProductFacts(product(), { servings: null, perServing: null, packMonths: null })
    expect(facts.map((f) => f.key)).toEqual(['format'])
    const all = stackProductFacts(product(), { servings: 60, perServing: 0.25, packMonths: 2 })
    expect(all.some((f) => /feel/i.test(f.label) || /feel/i.test(f.value))).toBe(false)
    expect(all.find((f) => f.key === 'lasts')?.value).toBe('About two months')
  })

  it('gives an accessory its one fact', () => {
    const shaker = product({ swapGroup: 'accessory', category: 'Accessories', formats: ['accessory'] })
    expect(stackProductFacts(shaker, { servings: 30, perServing: 0.1, packMonths: 1 }).map((f) => f.key)).toEqual(['format'])
  })
})
