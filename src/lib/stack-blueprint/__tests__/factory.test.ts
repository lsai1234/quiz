import { buildStackBlueprint } from '../factory'
import { MOCK_CATALOGUE } from '@/lib/catalogue'
import type { QuizAnswers, Goal } from '@/lib/types'

function makeAnswers(overrides: Partial<QuizAnswers> = {}): QuizAnswers {
  return {
    name: 'Test User',
    track: 'performance',
    ageBracket: '25-34',
    exactAge: null,
    gender: 'male',
    goals: ['health'],
    trainingFrequency: '3-4x',
    trainingType: 'strength',
    lifestyle: [],
    diet: 'mostly-good',
    currentSupplements: [],
    currentVitamins: [],
    preferredFormats: [],
    wellbeingAnswers: {},
    caffeineLevel: 'medium',
    budget: '50-80',
    stackPreference: 'balanced',
    trainingExperience: 'intermediate',
    trainingFocus: null,
    stimPreference: 'yes',
    trainingTime: null,
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

describe('buildStackBlueprint — wellbeing goals', () => {
  it('wellbeing-only users get no protein or performance slots', () => {
    const answers = makeAnswers({ goals: ['sleep-better', 'less-stress'] })
    const blueprint = buildStackBlueprint(answers, MOCK_CATALOGUE)
    const slotTypes = blueprint.slots.map(s => s.slotType)
    expect(slotTypes).not.toContain('protein')
    expect(slotTypes).not.toContain('performance')
    expect(slotTypes).not.toContain('energy')
    expect(blueprint.slots.length).toBeGreaterThan(0)
    // No slot is required for wellbeing-only users
    expect(blueprint.slots.every(s => !s.required)).toBe(true)
  })

  it('sleep-better goal selects a sleep slot product', () => {
    const answers = makeAnswers({ goals: ['sleep-better'] })
    const blueprint = buildStackBlueprint(answers, MOCK_CATALOGUE)
    expect(blueprint.slots.some(s => s.slotType === 'sleep')).toBe(true)
  })

  it('sleepQuality follow-up steers between magnesium and the sleep blend', () => {
    const switchOff = buildStackBlueprint(
      makeAnswers({ goals: ['sleep-better'], wellbeingAnswers: { sleepQuality: 'switch-off' } }),
      MOCK_CATALOGUE,
    )
    const wakeNight = buildStackBlueprint(
      makeAnswers({ goals: ['sleep-better'], wellbeingAnswers: { sleepQuality: 'wake-night' } }),
      MOCK_CATALOGUE,
    )
    const sleepSlotA = switchOff.slots.find(s => s.slotType === 'sleep')
    const sleepSlotB = wakeNight.slots.find(s => s.slotType === 'sleep')
    expect(sleepSlotA?.selectedProductId).toBe('chrgd-sleep-support')
    expect(sleepSlotB?.selectedProductId).toBe('chrgd-magnesium')
  })

  it('vegetarian collagen answer excludes collagen from the stack', () => {
    const answers = makeAnswers({
      goals: ['skin-hair-nails'],
      wellbeingAnswers: { collagenOk: 'veggie' },
    })
    const blueprint = buildStackBlueprint(answers, MOCK_CATALOGUE)
    expect(blueprint.slots.every(s => s.selectedProductId !== 'chrgd-collagen')).toBe(true)
  })

  it('wellbeing slots mirror the selected goals one-to-one', () => {
    const answers = makeAnswers({
      track: 'wellbeing',
      goals: ['sleep-better', 'immune', 'skin-hair-nails'],
      budget: '80-plus',
    })
    const blueprint = buildStackBlueprint(answers, MOCK_CATALOGUE)
    const slotIds = blueprint.slots.map(s => s.slotId)
    expect(slotIds).toContain('slot-sleep-better')
    expect(slotIds).toContain('slot-immune')
    expect(slotIds).toContain('slot-skin-hair-nails')
    // Every primary goal slot's product must be tagged with the goal it represents.
    // Budget-driven extra slots (slot-extra-*) are complementary and skipped here.
    for (const slot of blueprint.slots) {
      if (slot.slotId.startsWith('slot-extra-')) continue
      const goal = slot.slotId.replace('slot-', '')
      const product = MOCK_CATALOGUE.find(p => p.id === slot.selectedProductId)!
      expect(product.goals).toContain(goal)
    }
  })

  it('sleep-better + less-stress yields two different sleep-adjacent products', () => {
    // A tight budget caps the stack at its primary goal slots — one product per goal
    const answers = makeAnswers({
      track: 'wellbeing',
      goals: ['sleep-better', 'less-stress'],
      budget: 'under-30',
    })
    const blueprint = buildStackBlueprint(answers, MOCK_CATALOGUE)
    expect(blueprint.slots.length).toBe(2)
    const ids = blueprint.slots.map(s => s.selectedProductId)
    expect(new Set(ids).size).toBe(2)
  })

  it('a bigger budget delivers a bigger wellbeing stack', () => {
    const base = { track: 'wellbeing' as const, goals: ['sleep-better', 'immune'] as Goal[] }
    const small = buildStackBlueprint(makeAnswers({ ...base, budget: 'under-30' }), MOCK_CATALOGUE)
    const large = buildStackBlueprint(makeAnswers({ ...base, budget: '80-plus' }), MOCK_CATALOGUE)
    expect(small.slots.length).toBeLessThanOrEqual(2)
    expect(large.slots.length).toBeGreaterThan(small.slots.length)
    // The two chosen goals still anchor the larger stack
    const largeIds = large.slots.map(s => s.slotId)
    expect(largeIds).toContain('slot-sleep-better')
    expect(largeIds).toContain('slot-immune')
  })

  it('activates menopause and gut-health goals with matching products', () => {
    const meno = buildStackBlueprint(makeAnswers({ track: 'wellbeing', goals: ['menopause'], budget: 'under-30' }), MOCK_CATALOGUE)
    const menoSlot = meno.slots.find(s => s.slotId === 'slot-menopause')
    expect(menoSlot?.selectedProductId).toBe('chrgd-menopause-complete')

    const gut = buildStackBlueprint(makeAnswers({ track: 'wellbeing', goals: ['gut-health'], budget: 'under-30' }), MOCK_CATALOGUE)
    const gutSlot = gut.slots.find(s => s.slotId === 'slot-gut-health')
    expect(gutSlot?.selectedProductId).toBe('chrgd-daily-probiotic')
  })

  it('already taking magnesium steers the sleep pick to the blend', () => {
    const answers = makeAnswers({
      track: 'wellbeing',
      goals: ['sleep-better'],
      currentVitamins: ['magnesium'],
    })
    const blueprint = buildStackBlueprint(answers, MOCK_CATALOGUE)
    const sleepSlot = blueprint.slots.find(s => s.slotId === 'slot-sleep-better')
    expect(sleepSlot?.selectedProductId).toBe('chrgd-sleep-support')
  })

  it('falls back to a daily-health product instead of an empty wellbeing stack', () => {
    // Vegan + skin goal: collagen is excluded, leaving zero direct matches
    const answers = makeAnswers({
      track: 'wellbeing',
      goals: ['skin-hair-nails'],
      lifestyle: ['vegan'],
    })
    const blueprint = buildStackBlueprint(answers, MOCK_CATALOGUE)
    expect(blueprint.slots.length).toBeGreaterThan(0)
    expect(blueprint.slots.every(s => s.selectedProductId !== 'chrgd-collagen')).toBe(true)
  })

  it('mixed performance + wellbeing goals keep protein/creatine required', () => {
    const answers = makeAnswers({ goals: ['muscle', 'sleep-better'], budget: '80-plus' })
    const blueprint = buildStackBlueprint(answers, MOCK_CATALOGUE)
    const slotTypes = blueprint.slots.map(s => s.slotType)
    expect(slotTypes).toContain('protein')
    expect(slotTypes).toContain('performance')
    expect(slotTypes).toContain('sleep')
  })
})

describe('buildStackBlueprint — new scoring signals', () => {
  it('clean diet deprioritises protein slot', () => {
    const with_clean = buildStackBlueprint(
      makeAnswers({ goals: ['muscle'], diet: 'clean' }), MOCK_CATALOGUE)
    const with_poor = buildStackBlueprint(
      makeAnswers({ goals: ['muscle'], diet: 'poor' }), MOCK_CATALOGUE)
    const cleanProtein = with_clean.slots.find(s => s.slotType === 'protein')
    const poorProtein = with_poor.slots.find(s => s.slotType === 'protein')
    // Both should still recommend protein (muscle goal), but poor diet user
    // should have higher confidence score for protein
    expect(poorProtein!.confidenceScore).toBeGreaterThanOrEqual(cleanProtein!.confidenceScore)
  })

  it('hypertrophy focus boosts creatine confidence', () => {
    const hypertrophy = buildStackBlueprint(
      makeAnswers({ goals: ['muscle'], trainingFocus: 'hypertrophy' }), MOCK_CATALOGUE)
    const general = buildStackBlueprint(
      makeAnswers({ goals: ['muscle'], trainingFocus: 'general' }), MOCK_CATALOGUE)
    const htCreatine = hypertrophy.slots.find(s => s.slotType === 'performance')
    const genCreatine = general.slots.find(s => s.slotType === 'performance')
    expect(htCreatine!.confidenceScore).toBeGreaterThan(genCreatine!.confidenceScore)
  })

  it('evening training + sleep goal penalises stim pre-workout', () => {
    const evening = buildStackBlueprint(
      makeAnswers({
        goals: ['muscle', 'sleep-better'],
        trainingTime: 'evening',
        caffeineLevel: 'low',
      }), MOCK_CATALOGUE)
    const energySlot = evening.slots.find(s => s.slotType === 'energy')
    if (energySlot) {
      const product = MOCK_CATALOGUE.find(p => p.id === energySlot.selectedProductId)!
      expect(product.hasStimulants).toBe(false)
    }
  })

  it('45+ age bracket boosts vitamin D priority', () => {
    const older = buildStackBlueprint(
      makeAnswers({ goals: ['health'], ageBracket: '45+' }), MOCK_CATALOGUE)
    const younger = buildStackBlueprint(
      makeAnswers({ goals: ['health'], ageBracket: '16-24' }), MOCK_CATALOGUE)
    const olderVitD = older.slots.find(s => s.selectedProductId === 'chrgd-vitamin-d3-k2')
    const youngerVitD = younger.slots.find(s => s.selectedProductId === 'chrgd-vitamin-d3-k2')
    // older user should have vitamin D in their stack
    expect(olderVitD).toBeDefined()
  })

  it('joint-issues lifestyle flag boosts collagen', () => {
    const withJoints = buildStackBlueprint(
      makeAnswers({ goals: ['recovery'], lifestyle: ['joint-issues'] }), MOCK_CATALOGUE)
    const collagenSlot = withJoints.slots.find(s => s.selectedProductId === 'chrgd-collagen')
    expect(collagenSlot).toBeDefined()
  })
})

describe('buildStackBlueprint — eligibility gates', () => {
  it('fat burners never appear when cutting is not a goal', () => {
    const noGoals: Goal[][] = [
      ['health'], ['muscle'], ['sleep-better'], ['immune'], ['focus'],
      ['energy'], ['gut-health'], ['muscle', 'sleep-better'],
    ]
    for (const goals of noGoals) {
      const blueprint = buildStackBlueprint(
        makeAnswers({ goals, budget: '80-plus', stackPreference: 'complete' }),
        MOCK_CATALOGUE,
      )
      const fatBurner = blueprint.slots.find(s => {
        const p = MOCK_CATALOGUE.find(p => p.id === s.selectedProductId)
        return p?.swapGroup === 'fat-burner'
      })
      expect(fatBurner).toBeUndefined()
    }
  })

  it('fat burners DO appear when cutting is selected', () => {
    // Mock catalogue doesn't have a fat-burner product, but we can verify the gate
    // doesn't wrongly exclude cutting users. Add a synthetic one inline.
    const { MOCK_CATALOGUE: base } = require('@/lib/catalogue')
    const withFatBurner = [
      ...base,
      {
        id: 'test-fat-burner', title: 'Test Thermo', handle: 'test-fat-burner',
        description: 'A thermogenic fat burner', imageUrl: null, category: 'Body Composition',
        stackSlots: ['health'], goals: ['cutting'],
        dietaryTags: [], formats: ['capsule'], variants: [],
        basePrice: 29.99, compareAtPrice: null, subscriptionEligible: false,
        swapGroup: 'fat-burner', recommendationPriority: 7, marginPriority: 5,
        isCoreEligible: false, isBoosterEligible: false, hasStimulants: true,
        shortReason: 'Supports fat loss.', warnings: [], shopifyProductId: null,
      },
    ] as typeof base
    const blueprint = buildStackBlueprint(
      makeAnswers({ goals: ['cutting'], budget: '80-plus', stimPreference: 'yes', caffeineLevel: 'high' }),
      withFatBurner,
    )
    const fatBurnerSlot = blueprint.slots.find(s => s.selectedProductId === 'test-fat-burner')
    expect(fatBurnerSlot).toBeDefined()
  })

  it('mass gainer never appears when bulking is not a goal', () => {
    const blueprint = buildStackBlueprint(
      makeAnswers({ goals: ['muscle'], budget: '80-plus' }),
      MOCK_CATALOGUE,
    )
    const massGainer = blueprint.slots.find(s => s.selectedProductId === 'chrgd-mass-builder')
    expect(massGainer).toBeUndefined()
  })

  it('mass gainer appears when bulking is selected', () => {
    const blueprint = buildStackBlueprint(
      makeAnswers({ goals: ['bulking', 'muscle'], budget: '80-plus' }),
      MOCK_CATALOGUE,
    )
    const massGainer = blueprint.slots.find(s => s.selectedProductId === 'chrgd-mass-builder')
    expect(massGainer).toBeDefined()
  })

  it('menopause product never appears without menopause goal', () => {
    const blueprint = buildStackBlueprint(
      makeAnswers({ track: 'wellbeing', goals: ['sleep-better', 'immune', 'health'], budget: '80-plus' }),
      MOCK_CATALOGUE,
    )
    const menoSlot = blueprint.slots.find(s => s.selectedProductId === 'chrgd-menopause-complete')
    expect(menoSlot).toBeUndefined()
  })

  it('secondary fill does not add probiotics for a sleep-only user', () => {
    const blueprint = buildStackBlueprint(
      makeAnswers({ track: 'wellbeing', goals: ['sleep-better'], budget: '80-plus' }),
      MOCK_CATALOGUE,
    )
    const probiotic = blueprint.slots.find(s => {
      const p = MOCK_CATALOGUE.find(p => p.id === s.selectedProductId)
      return p?.swapGroup === 'probiotic'
    })
    expect(probiotic).toBeUndefined()
  })

  it('secondary fill does not add probiotics for a focus-only user', () => {
    const blueprint = buildStackBlueprint(
      makeAnswers({ track: 'wellbeing', goals: ['focus'], budget: '80-plus' }),
      MOCK_CATALOGUE,
    )
    const probiotic = blueprint.slots.find(s => {
      const p = MOCK_CATALOGUE.find(p => p.id === s.selectedProductId)
      return p?.swapGroup === 'probiotic'
    })
    expect(probiotic).toBeUndefined()
  })
})
