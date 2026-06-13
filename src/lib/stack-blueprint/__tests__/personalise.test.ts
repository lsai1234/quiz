import { buildStackBlueprint } from '../factory'
import { buildSlotOptions, applyBlueprintAIResult } from '../personalise'
import { parseBlueprintResult } from '@/lib/ai-stack'
import { MOCK_CATALOGUE } from '@/lib/catalogue'
import type { StackBlueprint } from '../types'
import type { QuizAnswers } from '@/lib/types'

function makeAnswers(overrides: Partial<QuizAnswers> = {}): QuizAnswers {
  return {
    name: 'Test User',
    track: 'performance',
    ageBracket: '25-34',
    exactAge: null,
    gender: 'male',
    goals: ['muscle', 'performance'],
    trainingFrequency: '3-4x',
    trainingType: 'strength',
    lifestyle: [],
    diet: 'mostly-good',
    currentSupplements: [],
    currentVitamins: [],
    preferredFormats: [],
    wellbeingAnswers: {},
    caffeineLevel: 'medium',
    budget: '80-plus',
    stackPreference: 'complete',
    trainingExperience: 'intermediate',
    trainingFocus: null,
    stimPreference: 'yes',
    trainingTime: null,
    ...overrides,
  }
}

describe('buildSlotOptions', () => {
  it('always includes the current product among each slot options', () => {
    const answers = makeAnswers()
    const blueprint = buildStackBlueprint(answers, MOCK_CATALOGUE)
    const slotOptions = buildSlotOptions(blueprint, answers, MOCK_CATALOGUE)

    expect(slotOptions.length).toBe(blueprint.slots.length)
    for (const so of slotOptions) {
      expect(so.options.map(o => o.id)).toContain(so.currentProductId)
      expect(so.options.length).toBeLessThanOrEqual(6)
    }
  })

  it('never offers a product already selected in another slot', () => {
    const answers = makeAnswers()
    const blueprint = buildStackBlueprint(answers, MOCK_CATALOGUE)
    const slotOptions = buildSlotOptions(blueprint, answers, MOCK_CATALOGUE)

    for (const so of slotOptions) {
      const otherSelected = blueprint.slots
        .filter(s => s.slotId !== so.slotId)
        .map(s => s.selectedProductId)
      for (const id of so.options.map(o => o.id)) {
        expect(otherSelected).not.toContain(id)
      }
    }
  })

  it('only offers vegan products for vegan users', () => {
    const answers = makeAnswers({ lifestyle: ['vegan'] })
    const blueprint = buildStackBlueprint(answers, MOCK_CATALOGUE)
    const slotOptions = buildSlotOptions(blueprint, answers, MOCK_CATALOGUE)
    for (const so of slotOptions) {
      expect(so.options.every(o => o.vegan)).toBe(true)
    }
  })
})

describe('applyBlueprintAIResult', () => {
  const blueprint: StackBlueprint = {
    id: 'x',
    stackName: 'Test',
    summary: '',
    primaryGoal: 'muscle',
    secondaryGoals: [],
    userProfileSummary: '',
    estimatedOneOffPrice: 0,
    estimatedSubscriptionPrice: 0,
    savingsSummary: '',
    createdAt: '',
    slots: [
      { slotId: 'slot-protein', slotType: 'protein', title: 'Protein', description: '', recommendedProductId: 'a', selectedProductId: 'a', selectedVariantId: 'a-v1', required: true, canRemove: false, canSwap: true, swapGroup: 'protein-whey', reason: 'old', confidenceScore: 50, displayOrder: 0 },
      { slotId: 'slot-performance', slotType: 'performance', title: 'Performance', description: '', recommendedProductId: 'c', selectedProductId: 'c', selectedVariantId: null, required: false, canRemove: true, canSwap: true, swapGroup: 'creatine', reason: 'old2', confidenceScore: 50, displayOrder: 1 },
    ],
  }

  it('applies a valid choice + reason and resets the variant', () => {
    const out = applyBlueprintAIResult(blueprint, {
      choices: { 'slot-protein': 'b' },
      reasons: { 'slot-protein': 'Chosen for your goals' },
    })
    const slot = out.slots.find(s => s.slotId === 'slot-protein')!
    expect(slot.selectedProductId).toBe('b')
    expect(slot.selectedVariantId).toBeNull()
    expect(slot.reason).toBe('Chosen for your goals')
    expect(out.personalised).toBe(true)
  })

  it('overrides only the reason when no product choice is given', () => {
    const out = applyBlueprintAIResult(blueprint, {
      choices: {},
      reasons: { 'slot-performance': 'Creatine for strength' },
    })
    const slot = out.slots.find(s => s.slotId === 'slot-performance')!
    expect(slot.selectedProductId).toBe('c')
    expect(slot.reason).toBe('Creatine for strength')
  })

  it('skips a choice that would duplicate another slot product', () => {
    const out = applyBlueprintAIResult(blueprint, {
      choices: { 'slot-protein': 'c' }, // 'c' already used by slot-performance
      reasons: {},
    })
    expect(out.slots.find(s => s.slotId === 'slot-protein')!.selectedProductId).toBe('a')
  })
})

describe('parseBlueprintResult', () => {
  const allowed = { 'slot-protein': new Set(['a', 'b']), 'slot-perf': new Set(['c']) }

  it('keeps only choices within each slot allowed options', () => {
    const result = parseBlueprintResult(
      { choices: { 'slot-protein': 'b', 'slot-perf': 'zzz', 'ghost': 'a' }, reasons: { 'slot-protein': '**hi**' } },
      allowed,
    )
    expect(result).not.toBeNull()
    expect(result!.choices).toEqual({ 'slot-protein': 'b' })
    expect(result!.reasons).toEqual({ 'slot-protein': 'hi' })
  })

  it('returns null when nothing usable came back', () => {
    expect(parseBlueprintResult({ choices: { x: 'y' } }, allowed)).toBeNull()
    expect(parseBlueprintResult(null, allowed)).toBeNull()
  })
})
