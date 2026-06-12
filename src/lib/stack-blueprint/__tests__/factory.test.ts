import { buildStackBlueprint } from '../factory'
import { MOCK_CATALOGUE } from '@/lib/catalogue'
import type { QuizAnswers } from '@/lib/types'

function makeAnswers(overrides: Partial<QuizAnswers> = {}): QuizAnswers {
  return {
    name: 'Test User',
    ageBracket: '25-34',
    gender: 'male',
    goals: ['health'],
    trainingFrequency: '3-4x',
    trainingType: 'strength',
    lifestyle: [],
    diet: 'mostly-good',
    currentSupplements: [],
    caffeineLevel: 'medium',
    budget: '50-100',
    stackPreference: 'balanced',
    trainingExperience: 'intermediate',
    trainingFocus: null,
    stimPreference: 'yes',
    ...overrides,
  }
}

describe('buildStackBlueprint', () => {
  it('returns a muscle archetype stack name for muscle-building goals with high frequency', () => {
    const answers = makeAnswers({ goals: ['muscle'], trainingFrequency: '5-6x' })
    const blueprint = buildStackBlueprint(answers, MOCK_CATALOGUE)
    expect(blueprint.stackName).toMatch(/Performance Core|Strength Engine/)
  })

  it('returns muscle archetype with bulking goal', () => {
    const answers = makeAnswers({ goals: ['bulking'], trainingFrequency: '3-4x' })
    const blueprint = buildStackBlueprint(answers, MOCK_CATALOGUE)
    expect(blueprint.stackName).toMatch(/Performance Core|Strength Engine/)
  })

  it('returns a fat-loss archetype stack name for weight-loss goals', () => {
    const answers = makeAnswers({ goals: ['cutting'] })
    const blueprint = buildStackBlueprint(answers, MOCK_CATALOGUE)
    expect(blueprint.stackName).toMatch(/Lean|Fat Loss/)
  })

  it('returns a health archetype stack name for general-health goals', () => {
    const answers = makeAnswers({ goals: ['health'] })
    const blueprint = buildStackBlueprint(answers, MOCK_CATALOGUE)
    expect(blueprint.stackName).toMatch(/Daily Charge|Foundation/)
  })

  it('excludes energy slots with stimulants when stimPreference is no', () => {
    const answers = makeAnswers({ stimPreference: 'no', goals: ['energy', 'muscle'] })
    const blueprint = buildStackBlueprint(answers, MOCK_CATALOGUE)
    const energySlot = blueprint.slots.find(s => s.slotType === 'energy')
    if (energySlot) {
      const product = MOCK_CATALOGUE.find(p => p.id === energySlot.selectedProductId)
      expect(product?.hasStimulants).toBe(false)
    }
    // If no energy slot, stimulant was correctly excluded
  })

  it('excludes energy slots with stimulants when caffeineLevel is none', () => {
    const answers = makeAnswers({ caffeineLevel: 'none', stimPreference: 'yes', goals: ['energy', 'muscle'] })
    const blueprint = buildStackBlueprint(answers, MOCK_CATALOGUE)
    const energySlot = blueprint.slots.find(s => s.slotType === 'energy')
    if (energySlot) {
      const product = MOCK_CATALOGUE.find(p => p.id === energySlot.selectedProductId)
      expect(product?.hasStimulants).toBe(false)
    }
  })

  it('only selects vegan products when lifestyle includes vegan', () => {
    const answers = makeAnswers({ lifestyle: ['vegan'] })
    const blueprint = buildStackBlueprint(answers, MOCK_CATALOGUE)
    for (const slot of blueprint.slots) {
      const product = MOCK_CATALOGUE.find(p => p.id === slot.selectedProductId)
      expect(product?.dietaryTags).toContain('vegan')
    }
  })

  it('gives lower confidence score to protein slot when user already takes protein', () => {
    const withProtein = makeAnswers({ currentSupplements: ['protein'], goals: ['muscle'] })
    const withoutProtein = makeAnswers({ currentSupplements: [], goals: ['muscle'] })

    const blueprintWith = buildStackBlueprint(withProtein, MOCK_CATALOGUE)
    const blueprintWithout = buildStackBlueprint(withoutProtein, MOCK_CATALOGUE)

    const proteinSlotWith = blueprintWith.slots.find(s => s.slotType === 'protein')
    const proteinSlotWithout = blueprintWithout.slots.find(s => s.slotType === 'protein')

    // Protein slot should still exist
    expect(proteinSlotWith).toBeDefined()
    expect(proteinSlotWithout).toBeDefined()

    // Confidence should be lower when already taking protein
    if (proteinSlotWith && proteinSlotWithout) {
      expect(proteinSlotWith.confidenceScore).toBeLessThan(proteinSlotWithout.confidenceScore)
    }
  })

  it('marks protein and performance slots as required with canRemove false', () => {
    const answers = makeAnswers({ goals: ['muscle'] })
    const blueprint = buildStackBlueprint(answers, MOCK_CATALOGUE)

    const proteinSlot = blueprint.slots.find(s => s.slotType === 'protein')
    const performanceSlot = blueprint.slots.find(s => s.slotType === 'performance')

    if (proteinSlot) {
      expect(proteinSlot.required).toBe(true)
      expect(proteinSlot.canRemove).toBe(false)
    }
    if (performanceSlot) {
      expect(performanceSlot.required).toBe(true)
      expect(performanceSlot.canRemove).toBe(false)
    }
  })

  it('marks non-required slots with canRemove true', () => {
    const answers = makeAnswers({ goals: ['health', 'recovery'] })
    const blueprint = buildStackBlueprint(answers, MOCK_CATALOGUE)
    const optionalSlots = blueprint.slots.filter(s => s.slotType !== 'protein' && s.slotType !== 'performance')
    for (const slot of optionalSlots) {
      expect(slot.canRemove).toBe(true)
      expect(slot.required).toBe(false)
    }
  })

  it('all slots have canSwap true', () => {
    const answers = makeAnswers({ goals: ['muscle'] })
    const blueprint = buildStackBlueprint(answers, MOCK_CATALOGUE)
    for (const slot of blueprint.slots) {
      expect(slot.canSwap).toBe(true)
    }
  })

  it('createdAt is a valid ISO string', () => {
    const answers = makeAnswers()
    const blueprint = buildStackBlueprint(answers, MOCK_CATALOGUE)
    expect(() => new Date(blueprint.createdAt)).not.toThrow()
    expect(new Date(blueprint.createdAt).toISOString()).toBe(blueprint.createdAt)
  })

  it('blueprint has valid structure with id, stackName, summary, slots', () => {
    const answers = makeAnswers({ goals: ['muscle'] })
    const blueprint = buildStackBlueprint(answers, MOCK_CATALOGUE)
    expect(blueprint.id).toBeTruthy()
    expect(blueprint.stackName).toBeTruthy()
    expect(blueprint.summary).toBeTruthy()
    expect(Array.isArray(blueprint.slots)).toBe(true)
    expect(blueprint.slots.length).toBeGreaterThan(0)
  })
})
