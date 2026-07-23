import { buildPourPlan, occasionsFor, resolvePace, defaultVariantId } from '@/lib/pour-plan'
import { defaultAnswers } from '@/lib/store'
import type { CatalogueProduct } from '@/lib/catalogue/types'
import type { QuizAnswers } from '@/lib/types'

function p(over: Partial<CatalogueProduct> & { id: string }): CatalogueProduct {
  return {
    handle: over.id,
    title: over.id,
    description: '',
    imageUrl: null,
    category: 'Drinks',
    stackSlots: [],
    goals: [],
    dietaryTags: [],
    formats: ['liquid'],
    variants: [{ id: `${over.id}-v`, title: 'v', flavour: null, size: null, price: 3, compareAtPrice: null, available: true, shopifyVariantId: null }],
    basePrice: 3,
    compareAtPrice: null,
    subscriptionEligible: true,
    servings: 30,
    swapGroup: 'general',
    recommendationPriority: 5,
    marginPriority: 5,
    isCoreEligible: true,
    isBoosterEligible: false,
    hasStimulants: false,
    shortReason: '',
    warnings: [],
    shopifyProductId: null,
    ...over,
  }
}

const vits = p({ id: 'vits', goals: ['health'], swapGroup: 'multivitamin', consumption: { cadence: 'daily', servingsPerUnit: 30, anchor: 'morning' } })
const greens = p({ id: 'greens', goals: ['gut-health'], swapGroup: 'greens', consumption: { cadence: 'daily', servingsPerUnit: 30, daysPerWeek: 3 } })
const pre = p({ id: 'pre', goals: ['energy'], swapGroup: 'pre-workout-stim', consumption: { cadence: 'per-workout', servingsPerUnit: 30, anchor: 'pre-workout' } })
const hydration = p({ id: 'hydration', goals: ['hydration'], swapGroup: 'electrolytes', consumption: { cadence: 'as-needed', servingsPerUnit: 30, asNeededTrigger: 'sweat', anchor: 'hot-days' } })
const sleep = p({ id: 'sleep', goals: ['sleep-better'], swapGroup: 'magnesium', consumption: { cadence: 'as-needed', servingsPerUnit: 30, asNeededTrigger: 'sleep', anchor: 'wind-down' } })

const answers = (over: Partial<QuizAnswers> = {}): QuizAnswers => ({ ...defaultAnswers, drinksMode: true, trainingFrequency: '3-4x', ...over })

describe('resolvePace', () => {
  it('prefers dailyDrinks, falls back to drinksPerDay, then a default', () => {
    expect(resolvePace({ dailyDrinks: 3, drinksPerDay: 1 })).toBe(3)
    expect(resolvePace({ dailyDrinks: null, drinksPerDay: 1 })).toBe(1)
    expect(resolvePace(null)).toBe(2)
  })
})

describe('occasionsFor — rhythm sizing', () => {
  it('daily every-day anchors are ~30/month', () => {
    expect(occasionsFor(vits, answers())).toBe(30)
  })
  it('daily "most days" scales with daysPerWeek', () => {
    expect(occasionsFor(greens, answers())).toBe(13) // 3 × 4.345
  })
  it('per-workout scales with training frequency', () => {
    expect(occasionsFor(pre, answers({ trainingFrequency: '3-4x' }))).toBe(15)
    expect(occasionsFor(pre, answers({ trainingFrequency: '1-2x' }))).toBe(6)
  })
  it('as-needed uses the trigger frequency, clamped, defaulting to sometimes', () => {
    expect(occasionsFor(hydration, answers())).toBe(9) // default 'sometimes' → 2/wk
    expect(occasionsFor(hydration, answers({ asNeeded: { sweat: 'often' } }))).toBe(17) // 4/wk
    expect(occasionsFor(hydration, answers({ asNeeded: { sweat: 'rarely' } }))).toBe(4) // 1/wk → floored at 4
  })
})

describe('buildPourPlan — buckets + one-off maths', () => {
  it('groups drinks by when, sized to their rhythm, with pack-duration maths', () => {
    const plan = buildPourPlan([vits, pre, hydration], answers({ drinkVariety: 'variety' }))
    const whens = plan.buckets.map((b) => b.when)
    expect(whens).toEqual(['everyday', 'training', 'asNeeded']) // ordered
    const everyday = plan.buckets.find((b) => b.when === 'everyday')!
    expect(everyday.lines[0].productId).toBe('vits')
    expect(everyday.lines[0].protocolNote).toBe('with breakfast')
    // one-off: a 30-serving vits pack at 30/month lasts ~4 weeks
    expect(everyday.lines[0].oneOffLastsWeeks).toBe(4)
    // pre-workout pack (30 servings, 15/mo) stretches ~9 weeks
    const training = plan.buckets.find((b) => b.when === 'training')!
    expect(training.lines[0].oneOffLastsWeeks).toBe(9)
    expect(plan.totalDrinks).toBe(30 + 15 + 9)
  })
})

describe('buildPourPlan — breadth vs depth', () => {
  const all = [vits, greens, pre, hydration, sleep] // 30+13+15+9+4 = 71 at pace 2 (target 60)

  it('variety keeps the fuller spread of kinds', () => {
    const plan = buildPourPlan(all, answers({ drinkVariety: 'variety', asNeeded: { sleep: 'rarely' } }))
    expect(plan.kinds).toBe(5)
    expect(plan.totalDrinks).toBe(71)
    expect(plan.buckets.find((b) => b.when === 'asNeeded')!.lines).toHaveLength(2)
  })

  it('staples trims marginal kinds toward the pace target', () => {
    const plan = buildPourPlan(all, answers({ drinkVariety: 'staples', asNeeded: { sleep: 'rarely' } }))
    // drops the two as-needed extras; keeps the everyday base + training
    expect(plan.kinds).toBe(3)
    expect(plan.totalDrinks).toBe(58)
    expect(plan.buckets.some((b) => b.when === 'asNeeded')).toBe(false)
  })

  it('never trims the #1-goal drink, even when it is the lowest-scoring line', () => {
    const plan = buildPourPlan(all, answers({ drinkVariety: 'staples', primaryGoal: 'sleep-better', asNeeded: { sleep: 'rarely' } }))
    const keptIds = plan.buckets.flatMap((b) => b.lines.map((l) => l.productId))
    expect(keptIds).toContain('sleep') // protected
  })
})

describe('defaultVariantId', () => {
  it('honours the product default, else the first available variant', () => {
    const withDefault = p({ id: 'x', defaultVariantId: 'x-berry', variants: [
      { id: 'x-orig', title: 'o', flavour: null, size: null, price: 3, compareAtPrice: null, available: true, shopifyVariantId: null },
      { id: 'x-berry', title: 'b', flavour: 'Berry', size: null, price: 3, compareAtPrice: null, available: true, shopifyVariantId: null },
    ] })
    expect(defaultVariantId(withDefault)).toBe('x-berry')
    expect(defaultVariantId(vits)).toBe('vits-v')
  })
})
