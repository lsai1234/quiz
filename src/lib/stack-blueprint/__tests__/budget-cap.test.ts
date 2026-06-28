import { buildStackBlueprint } from '../factory'
import {
  budgetCapFor,
  discountedOneOffTotal,
  calculatePricing,
  resetPricingOverrides,
  setPricingOverrides,
  getPricingConfig,
  type PricingConfig,
} from '../pricing'
import { applyBlueprintAIResultWithinBudget } from '../personalise'
import { MOCK_CATALOGUE } from '@/lib/catalogue'
import type { QuizAnswers, Budget } from '@/lib/types'

function makeAnswers(overrides: Partial<QuizAnswers> = {}): QuizAnswers {
  return {
    name: 'Test User',
    track: 'performance',
    ageBracket: '25-34',
    exactAge: null,
    gender: 'male',
    goals: ['muscle', 'energy', 'recovery'],
    trainingFrequency: '5-6x',
    trainingType: 'strength',
    lifestyle: [],
    diet: 'mostly-good',
    currentSupplements: [],
    currentVitamins: [],
    preferredFormats: [],
    wellbeingAnswers: {},
    caffeineLevel: 'high',
    budget: '50-80',
    stackPreference: 'balanced',
    trainingExperience: 'intermediate',
    trainingFocus: null,
    stimPreference: 'yes',
    trainingTime: null,
    ...overrides,
  }
}

afterEach(() => resetPricingOverrides())

describe('budgetCapFor', () => {
  it('returns the configured cap per tier and null for the open top tier', () => {
    expect(budgetCapFor('under-30')).toBe(30)
    expect(budgetCapFor('30-50')).toBe(50)
    expect(budgetCapFor('50-80')).toBe(80)
    expect(budgetCapFor('80-plus')).toBeNull()
    expect(budgetCapFor(null)).toBeNull()
  })
})

describe('discountedOneOffTotal', () => {
  it('sums lines and applies the best qualifying bundle tier', () => {
    // Two £50 lines (£100 subtotal) → qualifies for the £90+ tier (12.5%).
    const lines = [
      { price: 50, cost: 10 },
      { price: 50, cost: 10 },
    ]
    expect(discountedOneOffTotal(lines)).toBeCloseTo(87.5, 2)
  })
})

describe('budget cap is a hard ceiling on the discounted one-off total', () => {
  const tiers: Budget[] = ['under-30', '30-50', '50-80']

  for (const budget of tiers) {
    it(`never exceeds the ${budget} cap (performance goals)`, () => {
      const answers = makeAnswers({ budget })
      const blueprint = buildStackBlueprint(answers, MOCK_CATALOGUE)
      const pricing = calculatePricing(blueprint, MOCK_CATALOGUE, answers)
      const cap = budgetCapFor(budget)!
      // Allow only the documented degenerate single-product overshoot.
      if (blueprint.slots.length > 1) {
        expect(pricing.oneOffTotal).toBeLessThanOrEqual(cap + 0.01)
      }
    })

    it(`never exceeds the ${budget} cap (wellbeing goals)`, () => {
      const answers = makeAnswers({
        track: 'wellbeing',
        budget,
        goals: ['sleep-better', 'less-stress', 'immune', 'focus'],
        trainingFrequency: null,
        trainingType: null,
      })
      const blueprint = buildStackBlueprint(answers, MOCK_CATALOGUE)
      const pricing = calculatePricing(blueprint, MOCK_CATALOGUE, answers)
      const cap = budgetCapFor(budget)!
      if (blueprint.slots.length > 1) {
        expect(pricing.oneOffTotal).toBeLessThanOrEqual(cap + 0.01)
      }
    })
  }

  it('does not cap the open-ended top tier', () => {
    const answers = makeAnswers({ budget: '80-plus' })
    const blueprint = buildStackBlueprint(answers, MOCK_CATALOGUE)
    expect(blueprint.slots.length).toBeGreaterThan(0)
    // No cap applies; nothing to assert beyond a non-empty stack being allowed.
  })

  it('always returns a non-empty stack even with an impossibly low cap', () => {
    setPricingOverrides({ budgetCaps: { 'under-30': 0.5, '30-50': 50, '50-80': 80, '80-plus': null } })
    const answers = makeAnswers({ budget: 'under-30' })
    const blueprint = buildStackBlueprint(answers, MOCK_CATALOGUE)
    expect(blueprint.slots.length).toBeGreaterThanOrEqual(1)
  })

  it('a lower cap yields a discounted total no higher than a higher cap', () => {
    const low = buildStackBlueprint(makeAnswers({ budget: 'under-30' }), MOCK_CATALOGUE)
    const high = buildStackBlueprint(makeAnswers({ budget: '50-80' }), MOCK_CATALOGUE)
    const lowTotal = calculatePricing(low, MOCK_CATALOGUE).oneOffTotal
    const highTotal = calculatePricing(high, MOCK_CATALOGUE).oneOffTotal
    expect(lowTotal).toBeLessThanOrEqual(highTotal + 0.01)
  })
})

describe('applyBlueprintAIResultWithinBudget gates swaps to the cap', () => {
  const config: PricingConfig = getPricingConfig()

  it('keeps a swap that stays within the cap', () => {
    const answers = makeAnswers({ budget: '50-80' })
    const blueprint = buildStackBlueprint(answers, MOCK_CATALOGUE)
    const slot = blueprint.slots[0]
    // Find an alternative product in the same slot type that keeps us under cap.
    const alt = MOCK_CATALOGUE.find(
      p => p.id !== slot.selectedProductId &&
        p.stackSlots.includes(slot.slotType) &&
        !blueprint.slots.some(s => s.selectedProductId === p.id),
    )
    if (!alt) return
    const result = { choices: { [slot.slotId]: alt.id }, reasons: { [slot.slotId]: 'AI reason' } }
    const out = applyBlueprintAIResultWithinBudget(blueprint, result, MOCK_CATALOGUE, 80, config)
    const total = calculatePricing(out, MOCK_CATALOGUE).oneOffTotal
    expect(total).toBeLessThanOrEqual(80 + 0.01)
    // Reason is always applied even if the swap was reverted.
    expect(out.slots[0].reason).toBe('AI reason')
  })

  it('reverts a swap that would exceed the cap but still applies the reason', () => {
    const answers = makeAnswers({ budget: 'under-30' })
    const blueprint = buildStackBlueprint(answers, MOCK_CATALOGUE)
    const slot = blueprint.slots[0]
    // Pick the most expensive product available for this slot type as the swap.
    const dearest = [...MOCK_CATALOGUE]
      .filter(p => p.stackSlots.includes(slot.slotType) && p.id !== slot.selectedProductId)
      .sort((a, b) => b.basePrice - a.basePrice)[0]
    if (!dearest) return
    const before = slot.selectedProductId
    const result = { choices: { [slot.slotId]: dearest.id }, reasons: { [slot.slotId]: 'Premium pick' } }
    const out = applyBlueprintAIResultWithinBudget(blueprint, result, MOCK_CATALOGUE, 30, config)
    const total = calculatePricing(out, MOCK_CATALOGUE).oneOffTotal
    expect(total).toBeLessThanOrEqual(30 + 0.01)
    // If the dearest product would have busted the cap, the original is kept.
    if (dearest.basePrice > 30) expect(out.slots[0].selectedProductId).toBe(before)
    expect(out.slots[0].reason).toBe('Premium pick')
  })

  it('with no cap (top tier) applies the swap unconditionally', () => {
    const answers = makeAnswers({ budget: '80-plus' })
    const blueprint = buildStackBlueprint(answers, MOCK_CATALOGUE)
    const slot = blueprint.slots[0]
    const alt = MOCK_CATALOGUE.find(
      p => p.id !== slot.selectedProductId &&
        p.stackSlots.includes(slot.slotType) &&
        !blueprint.slots.some(s => s.selectedProductId === p.id),
    )
    if (!alt) return
    const result = { choices: { [slot.slotId]: alt.id }, reasons: {} }
    const out = applyBlueprintAIResultWithinBudget(blueprint, result, MOCK_CATALOGUE, null, config)
    expect(out.slots[0].selectedProductId).toBe(alt.id)
  })
})
