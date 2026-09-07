import { isAccessory, servingsLabel } from '../accessory'
import { productFacts } from '@/lib/product-facts'
import type { CatalogueProduct } from '../types'

function product(over: Partial<CatalogueProduct> = {}): CatalogueProduct {
  return {
    id: 'p', title: 'P', handle: 'p', description: '', imageUrl: null, category: 'Protein',
    stackSlots: ['protein'], goals: ['muscle'], dietaryTags: [], formats: ['powder'],
    variants: [{ id: 'v', title: 'V', flavour: null, size: null, price: 30, compareAtPrice: null, available: true }],
    basePrice: 30, compareAtPrice: null, subscriptionEligible: true, servings: 30,
    swapGroup: 'protein-whey', recommendationPriority: 5, marginPriority: 5, isCoreEligible: true,
    isBoosterEligible: false, hasStimulants: false, shortReason: '', warnings: [], ...over,
  }
}

describe('isAccessory', () => {
  it('reads the swap group the classifier and the roster both set', () => {
    expect(isAccessory(product({ swapGroup: 'accessory' }))).toBe(true)
    expect(isAccessory(product({ swapGroup: 'protein-whey' }))).toBe(false)
  })

  it('also reads the category, so products imported before the rule are covered', () => {
    // The three shakers on the shelf: imported under `general`, sitting in
    // PowerBody's own Accessories category, advertising servings they do not
    // have. A display rule that needed a backfill to take effect would leave
    // them exactly as they are.
    expect(isAccessory(product({ swapGroup: 'general', category: 'Accessories' }))).toBe(true)
    expect(isAccessory(product({ swapGroup: 'general', category: 'Gym Accessories' }))).toBe(true)
  })

  it('does not mistake a supplement for one', () => {
    expect(isAccessory(product({ swapGroup: 'general', category: 'Amino Acids and BCAAs' }))).toBe(false)
    expect(isAccessory(product({ swapGroup: 'creatine', category: 'Performance' }))).toBe(false)
  })
})

describe('servingsLabel', () => {
  it('is singular at one — "1 servings" was on a real card', () => {
    expect(servingsLabel(1)).toBe('1 serving')
    expect(servingsLabel(30)).toBe('30 servings')
  })

  it('rounds, because a scaled count is a fraction nobody prints', () => {
    expect(servingsLabel(29.8)).toBe('30 servings')
    expect(servingsLabel(0.4)).toBe('1 serving')
  })
})

describe('productFacts', () => {
  it('gives an accessory one fact: what it is', () => {
    // No dose, so no serving count — and no "you'll feel it within a few
    // weeks", which under a plastic bottle is a claim about a plastic bottle.
    const facts = productFacts(product({ swapGroup: 'accessory', category: 'Accessories', formats: ['accessory'] }))
    expect(facts.map((f) => f.key)).toEqual(['format'])
    expect(facts[0].value).toBe('Accessory')
  })

  it('counts the servings of the variant on screen, not the product', () => {
    const capsules = { id: 'caps', title: '100 caps', flavour: null, size: '100 caps', price: 22.99, compareAtPrice: null, available: true, servings: 33 }
    const powder = { id: 'powder', title: '454 grams', flavour: null, size: '454 grams', price: 41.99, compareAtPrice: null, available: true, servings: 454 }
    const glycine = product({ variants: [capsules, powder], servings: 33, formats: ['capsule'] })

    expect(productFacts(glycine, powder).find((f) => f.key === 'servings')?.value).toBe('454 servings')
    expect(productFacts(glycine, capsules).find((f) => f.key === 'servings')?.value).toBe('33 servings')
  })
})
