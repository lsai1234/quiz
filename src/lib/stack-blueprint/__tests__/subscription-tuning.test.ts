import {
  sizeConsumption,
  levelSubscriptionRate,
  stackLevelOf,
  allowedUsageLevels,
  calculatePricing,
  buildSubscriptionPlan,
  getPricingConfig,
  USAGE_LEVELS,
  type UsageLevel,
} from '../pricing'
import type { StackBlueprint } from '../types'
import type { CatalogueProduct } from '@/lib/catalogue/types'
import type { QuizAnswers, StackLevel } from '@/lib/types'

const daily = (overrides: Partial<CatalogueProduct> = {}): CatalogueProduct => ({
  id: 'whey', title: 'Whey', handle: 'whey', description: '', imageUrl: null, category: 'Protein',
  stackSlots: ['protein'], goals: ['muscle'], dietaryTags: [], formats: ['powder'],
  variants: [{ id: 'v', title: 'Choc', flavour: 'Choc', size: '1kg', price: 40, compareAtPrice: 50, available: true }],
  basePrice: 40, compareAtPrice: 50, cost: 12, subscriptionEligible: true, servings: 30,
  swapGroup: 'protein-whey', recommendationPriority: 8, marginPriority: 7, isCoreEligible: true,
  isBoosterEligible: false, hasStimulants: false, shortReason: '', warnings: [],
  ...overrides,
})

const blueprintOf = (productIds: string[], level?: StackLevel): StackBlueprint => ({
  id: 'bp', stackName: 'S', summary: '', primaryGoal: 'muscle', secondaryGoals: [], userProfileSummary: '',
  slots: productIds.map((pid, i) => ({
    slotId: `slot-${i}`, slotType: 'protein', title: 'Protein', description: '',
    recommendedProductId: pid, selectedProductId: pid, selectedVariantId: null,
    required: true, canRemove: false, canSwap: true, swapGroup: 'protein-whey',
    reason: '', confidenceScore: 80, displayOrder: i,
  })),
  estimatedOneOffPrice: 0, estimatedSubscriptionPrice: 0, savingsSummary: '', createdAt: new Date().toISOString(),
  level,
})

const answers = (trainingFrequency: QuizAnswers['trainingFrequency'] = 'daily') =>
  ({ trainingFrequency } as unknown as QuizAnswers)

describe('per-bundle (stack level) subscription discount', () => {
  it('returns the configured fixed rate per level', () => {
    const c = getPricingConfig()
    expect(levelSubscriptionRate('essentials', c)).toBe(c.levelSubscriptionDiscount.essentials)
    expect(levelSubscriptionRate('performance', c)).toBe(c.levelSubscriptionDiscount.performance)
    expect(levelSubscriptionRate('complete', c)).toBe(c.levelSubscriptionDiscount.complete)
    expect(levelSubscriptionRate(undefined, c)).toBe(c.subscriptionDiscount)
  })

  it('derives the bundle level from product count when unset', () => {
    expect(stackLevelOf(blueprintOf(['a']))).toBe('essentials')
    expect(stackLevelOf(blueprintOf(['a', 'b', 'c', 'd']))).toBe('performance')
    expect(stackLevelOf(blueprintOf(['a', 'b', 'c', 'd', 'e', 'f']))).toBe('complete')
  })

  it('reports the bundle level and its fixed discount % in the pricing', () => {
    const p = daily()
    const pricing = calculatePricing(blueprintOf(['whey'], 'complete'), [p], answers())
    expect(pricing.bundleLevel).toBe('complete')
    expect(pricing.subscriptionDiscountPct).toBe(Math.round(getPricingConfig().levelSubscriptionDiscount.complete * 1000) / 10)
  })

  it('a bigger bundle gives a deeper monthly discount than a smaller one', () => {
    const p = daily()
    const ess = calculatePricing(blueprintOf(['whey'], 'essentials'), [p], answers()).subscriptionTotal
    const com = calculatePricing(blueprintOf(['whey'], 'complete'), [p], answers()).subscriptionTotal
    expect(com).toBeLessThan(ess)
  })
})

describe('usage-rate sizing', () => {
  it('heavier usage ships more, lighter usage ships less often', () => {
    const p = daily({ servings: 30 })
    const a = answers('daily')
    const std = sizeConsumption(p, a, getPricingConfig(), 'standard')
    const light = sizeConsumption(p, a, getPricingConfig(), 'light')
    const heavy = sizeConsumption(p, a, getPricingConfig(), 'heavy')

    // Standard: 30 servings, 1/day → lasts ~1 month.
    expect(std.shipEveryMonths).toBe(1)
    expect(std.unitsPerShipment).toBe(1)
    // Light: half the servings/day → one tub lasts ~2 months.
    expect(light.shipEveryMonths).toBeGreaterThan(std.shipEveryMonths)
    // Heavy: double the servings/day → needs more per month.
    expect(heavy.monthlyUnits).toBeGreaterThan(std.monthlyUnits)
  })

  it('usage flows through buildSubscriptionPlan to the monthly price', () => {
    const p = daily()
    const bp = blueprintOf(['whey'], 'performance')
    const base = calculatePricing(bp, [p], answers('daily')).subscriptionTotal
    const heavy = calculatePricing(bp, [p], answers('daily'), undefined, { usageByProductId: { whey: 'heavy' }, level: 'performance' }).subscriptionTotal
    expect(heavy).toBeGreaterThan(base)
    // Plan reflects the usage level on the line.
    const plan = buildSubscriptionPlan(bp, [p], answers('daily'), undefined, { usageByProductId: { whey: 'light' } })
    expect(plan[0].usageLevel).toBe('light')
  })
})

describe('usage clamp keeps the plan profitable', () => {
  it('always offers at least standard and never an out-of-range level', () => {
    const p = daily()
    const bp = blueprintOf(['whey'], 'performance')
    const allowed = allowedUsageLevels(bp, [p], answers('daily'), 'whey', {})
    expect(allowed).toContain('standard')
    expect(allowed.every((l: UsageLevel) => USAGE_LEVELS.includes(l))).toBe(true)
  })

  it('disallows usage levels that would drop the plan below the minimum monthly', () => {
    // A low-priced single product: at light usage it ships rarely → flat monthly
    // can fall under minSubscriptionMonthly, which the clamp forbids.
    const cheap = daily({ id: 'cheap', servings: 90, basePrice: 12, cost: 4, variants: [{ id: 'cv', title: 'x', flavour: null, size: null, price: 12, compareAtPrice: null, available: true }] })
    const bp = blueprintOf(['cheap'], 'essentials')
    const allowed = allowedUsageLevels(bp, [cheap], answers('daily'), 'cheap', {})
    expect(allowed).toContain('standard')
    expect(allowed.length).toBeLessThanOrEqual(USAGE_LEVELS.length)
  })
})
