import { productFacts } from '../product-facts'
import type { CatalogueProduct } from '../catalogue/types'

/**
 * The onset fact ("You'll feel it — within a few weeks") is optional.
 *
 * The quiz results sheet leaves it out: a felt-effect window is an implied
 * claim. The shop sheet still asks for the default, so its facts are pinned
 * here too — changing them there is a separate decision.
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
  it('includes the onset fact by default, as the shop sheet shows it', () => {
    const facts = productFacts(product())
    expect(facts.map((f) => f.key)).toEqual(['format', 'servings', 'onset'])
    expect(facts.find((f) => f.key === 'onset')).toMatchObject({ label: "You'll feel it", value: 'within a few weeks' })
  })

  it('leaves the onset fact out when asked, as the results sheet does', () => {
    const facts = productFacts(product(), undefined, { onset: false })
    expect(facts.map((f) => f.key)).toEqual(['format', 'servings'])
    expect(facts.some((f) => /feel/i.test(f.label) || /feel/i.test(f.value))).toBe(false)
  })

  it('still gives an accessory its one fact either way', () => {
    const shaker = product({ swapGroup: 'accessory', category: 'Accessories', formats: ['accessory'] })
    expect(productFacts(shaker).map((f) => f.key)).toEqual(['format'])
    expect(productFacts(shaker, undefined, { onset: false }).map((f) => f.key)).toEqual(['format'])
  })
})
