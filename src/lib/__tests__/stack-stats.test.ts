import { selectStatAxes, selectShopAxes, productBars, productStatScore, stackStatScore, goalAxis, MAX_STAT } from '../stack-stats'
import type { CatalogueProduct } from '@/lib/catalogue/types'
import type { StackBlueprint } from '@/lib/stack-blueprint'
import type { Goal } from '@/lib/types'

function makeProduct(overrides: Partial<CatalogueProduct> = {}): CatalogueProduct {
  return {
    id: 'p',
    title: 'Product',
    handle: 'product',
    description: '',
    imageUrl: null,
    category: 'Protein',
    stackSlots: ['protein'],
    goals: ['muscle'],
    dietaryTags: [],
    formats: ['powder'],
    variants: [],
    basePrice: 30,
    compareAtPrice: null,
    subscriptionEligible: true,
    servings: 30,
    swapGroup: 'protein-whey',
    recommendationPriority: 7,
    marginPriority: 5,
    isCoreEligible: true,
    isBoosterEligible: false,
    hasStimulants: false,
    shortReason: '',
    warnings: [],
    ...overrides,
  }
}

function makeBlueprint(primaryGoal: Goal, secondaryGoals: Goal[], productIds: string[]): StackBlueprint {
  return {
    id: 'bp',
    stackName: 'Test Stack',
    summary: '',
    primaryGoal,
    secondaryGoals,
    userProfileSummary: '',
    slots: productIds.map((pid, i) => ({
      slotId: `slot-${i}`,
      slotType: 'protein',
      title: 'Protein',
      description: '',
      recommendedProductId: pid,
      selectedProductId: pid,
      selectedVariantId: null,
      required: true,
      canRemove: false,
      canSwap: true,
      swapGroup: 'protein-whey',
      reason: '',
      confidenceScore: 80,
      displayOrder: i,
    })),
    estimatedOneOffPrice: 0,
    estimatedSubscriptionPrice: 0,
    savingsSummary: '',
    createdAt: new Date().toISOString(),
  }
}

describe('selectStatAxes', () => {
  it('puts the primary goal first', () => {
    const bp = makeBlueprint('recovery', ['energy'], [])
    const axes = selectStatAxes(bp, [])
    expect(axes[0].goal).toBe('recovery')
  })

  it('returns exactly `count` axes', () => {
    const bp = makeBlueprint('muscle', ['energy'], [])
    expect(selectStatAxes(bp, [], 4)).toHaveLength(4)
    expect(selectStatAxes(bp, [], 3)).toHaveLength(3)
  })

  it('includes the secondary goals after the primary', () => {
    const bp = makeBlueprint('muscle', ['recovery', 'sleep-better'], [])
    const goals = selectStatAxes(bp, []).map((a) => a.goal)
    expect(goals.slice(0, 3)).toEqual(['muscle', 'recovery', 'sleep-better'])
  })

  it('pads from the stack’s most-covered goals when the goals list is short', () => {
    const products = [
      makeProduct({ id: 'a', goals: ['muscle', 'focus'] }),
      makeProduct({ id: 'b', goals: ['focus', 'immune'] }),
    ]
    const bp = makeBlueprint('muscle', [], ['a', 'b'])
    const goals = selectStatAxes(bp, products, 4).map((a) => a.goal)
    expect(goals[0]).toBe('muscle')
    // focus appears in both products → most-covered → picked before others
    expect(goals).toContain('focus')
    expect(goals).toHaveLength(4)
  })

  it('is independent of which product is being rendered (axes come from the blueprint)', () => {
    const products = [makeProduct({ id: 'a', goals: ['muscle'] })]
    const bp = makeBlueprint('muscle', ['energy'], ['a'])
    const first = selectStatAxes(bp, products)
    const second = selectStatAxes(bp, products)
    expect(first).toEqual(second)
  })

  it('never returns duplicate axes', () => {
    const bp = makeBlueprint('muscle', ['muscle', 'muscle'], [])
    const goals = selectStatAxes(bp, []).map((a) => a.goal)
    expect(new Set(goals).size).toBe(goals.length)
  })

  it('gives every axis a human label', () => {
    const bp = makeBlueprint('skin-hair-nails', [], [])
    expect(selectStatAxes(bp, [])[0].label).toBe('Skin & Hair')
  })
})

describe('productStatScore', () => {
  it('scores a targeted goal well above an untargeted one', () => {
    const p = makeProduct({ goals: ['muscle'] })
    expect(productStatScore(p, 'muscle')).toBeGreaterThan(productStatScore(p, 'sleep-better'))
  })

  it('scores the headline goal at least as high as a later goal', () => {
    const p = makeProduct({ goals: ['muscle', 'recovery'] })
    expect(productStatScore(p, 'muscle')).toBeGreaterThanOrEqual(productStatScore(p, 'recovery'))
  })

  it('rewards a higher recommendation priority', () => {
    const strong = makeProduct({ goals: ['muscle'], recommendationPriority: 10 })
    const weak = makeProduct({ goals: ['muscle'], recommendationPriority: 4 })
    expect(productStatScore(strong, 'muscle')).toBeGreaterThan(productStatScore(weak, 'muscle'))
  })

  it('keeps every score within 0–10', () => {
    const p = makeProduct({ goals: ['muscle'], recommendationPriority: 10 })
    expect(productStatScore(p, 'muscle')).toBeLessThanOrEqual(MAX_STAT)
    expect(productStatScore(p, 'energy')).toBeGreaterThanOrEqual(0)
  })

  it('is deterministic', () => {
    const p = makeProduct({ goals: ['muscle', 'energy'], recommendationPriority: 8 })
    expect(productStatScore(p, 'energy')).toBe(productStatScore(p, 'energy'))
  })
})

describe('selectShopAxes (no quiz context)', () => {
  it('orders axes by how much the product set covers each goal', () => {
    const products = [
      makeProduct({ id: 'a', goals: ['muscle', 'recovery'] }),
      makeProduct({ id: 'b', goals: ['muscle', 'energy'] }),
      makeProduct({ id: 'c', goals: ['muscle'] }),
    ]
    const goals = selectShopAxes(products, 4).map((a) => a.goal)
    expect(goals[0]).toBe('muscle') // covered by all three
    expect(goals).toHaveLength(4)
  })

  it('pads to count with defaults for a thin section', () => {
    const goals = selectShopAxes([makeProduct({ id: 'a', goals: ['sleep-better'] })], 4).map((a) => a.goal)
    expect(goals[0]).toBe('sleep-better')
    expect(goals).toHaveLength(4)
    expect(new Set(goals).size).toBe(4) // no dupes
  })

  it('is deterministic for the same product set', () => {
    const products = [makeProduct({ id: 'a', goals: ['muscle', 'energy'] })]
    expect(selectShopAxes(products)).toEqual(selectShopAxes(products))
  })
})

describe('productBars', () => {
  it('marks the product’s own goals as targeted and others as context', () => {
    const p = makeProduct({ goals: ['muscle', 'recovery'] })
    const axes = [goalAxis('muscle'), goalAxis('sleep-better')]
    const bars = productBars(p, axes)
    expect(bars.find((b) => b.goal === 'muscle')?.targeted).toBe(true)
    expect(bars.find((b) => b.goal === 'sleep-better')?.targeted).toBe(false)
    // Scores line up with productStatScore for the same axis.
    expect(bars[0].score).toBe(productStatScore(p, 'muscle'))
  })
})

describe('stackStatScore', () => {
  it('rises when more products cover the goal, with diminishing returns', () => {
    const one = [makeProduct({ id: 'a', goals: ['muscle'] })]
    const two = [
      makeProduct({ id: 'a', goals: ['muscle'] }),
      makeProduct({ id: 'b', goals: ['muscle'] }),
    ]
    const single = stackStatScore(one, 'muscle')
    const pair = stackStatScore(two, 'muscle')
    expect(pair).toBeGreaterThan(single)
    // diminishing: the second product adds less than the first product's own score
    expect(pair - single).toBeLessThan(single)
  })

  it('caps at 10', () => {
    const many = Array.from({ length: 8 }, (_, i) =>
      makeProduct({ id: `p${i}`, goals: ['muscle'], recommendationPriority: 10 }),
    )
    expect(stackStatScore(many, 'muscle')).toBeLessThanOrEqual(MAX_STAT)
  })
})
