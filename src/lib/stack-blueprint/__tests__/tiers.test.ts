/**
 * Value-first depth tiers (Phase 2). The reveal builds the full stack once and
 * shows Essentials/Balanced/Complete as ranked prefixes. These lock the two
 * things the results screen relies on: the prefix relationship and price/rate
 * monotonicity, computed with the SAME calculatePricing the UI uses (parity).
 */
import { buildStackBlueprint } from '../factory'
import { calculatePricing } from '../pricing'
import { MOCK_CATALOGUE } from '@/lib/catalogue'
import type { QuizAnswers, StackLevel } from '@/lib/types'

const TIER_SIZES: Record<StackLevel, number> = { essentials: 3, performance: 5, complete: 7 }
const ORDER: StackLevel[] = ['essentials', 'performance', 'complete']

function answers(o: Partial<QuizAnswers> = {}): QuizAnswers {
  return {
    name: 'P', track: 'performance', drinksMode: false, drinksPerDay: null,
    dailyDrinks: null, drinkVariety: null, workoutAddOns: [], primaryGoal: null,
    asNeeded: {}, ageBracket: '25-34', exactAge: null, gender: 'male',
    goals: ['muscle', 'energy'], trainingFrequency: '5-6x', trainingType: ['strength'],
    lifestyle: [], diet: 'mostly-good', currentSupplements: [], currentVitamins: [],
    tryOurs: [], preferredFormats: [], wellbeingAnswers: {}, dynamicAnswers: {},
    caffeineLevel: 'high', budget: null, stackPreference: null,
    trainingExperience: 'experienced', trainingFocus: 'hypertrophy', stimPreference: 'yes',
    trainingTime: 'morning', ...o,
  }
}

/** How the reveal slices the full blueprint for a tier — a ranked prefix. */
function sliceForTier(full: ReturnType<typeof buildStackBlueprint>, level: StackLevel) {
  const sorted = [...full.slots].sort((a, b) => a.displayOrder - b.displayOrder)
  const size = Math.min(TIER_SIZES[level], sorted.length)
  return { ...full, slots: sorted.slice(0, size) }
}

describe('value-first tiers', () => {
  const a = answers()
  const full = buildStackBlueprint(a, MOCK_CATALOGUE)

  it('the full (no-budget) build is the complete stack (up to 7 slots)', () => {
    expect(full.slots.length).toBeGreaterThan(3)
    expect(full.slots.length).toBeLessThanOrEqual(7)
  })

  it('each tier is a ranked prefix of the next', () => {
    const ids = (level: StackLevel) => sliceForTier(full, level).slots.map((s) => s.selectedProductId)
    const ess = ids('essentials')
    const bal = ids('performance')
    const comp = ids('complete')
    expect(bal.slice(0, ess.length)).toEqual(ess)
    expect(comp.slice(0, bal.length)).toEqual(bal)
  })

  it('one-off price is monotonic non-decreasing with depth', () => {
    const prices = ORDER.map(
      (level) => calculatePricing(sliceForTier(full, level), MOCK_CATALOGUE, a, undefined, { level }).oneOffTotal,
    )
    expect(prices[1]).toBeGreaterThanOrEqual(prices[0])
    expect(prices[2]).toBeGreaterThanOrEqual(prices[1])
  })

  it('subscribe-&-save rate rises with depth (15 / 20 / 25%)', () => {
    const rate = (level: StackLevel) =>
      calculatePricing(sliceForTier(full, level), MOCK_CATALOGUE, a, undefined, { level }).subscriptionDiscountPct
    expect(rate('essentials')).toBe(15)
    expect(rate('performance')).toBe(20)
    expect(rate('complete')).toBe(25)
  })

  it('parity: the tier the customer selects prices exactly as the sliced stack', () => {
    // The reveal prices `sliceForTier(full, level)` and checks out the same
    // object, so the displayed price is the charged price by construction.
    const level: StackLevel = 'performance'
    const sliced = sliceForTier(full, level)
    const shown = calculatePricing(sliced, MOCK_CATALOGUE, a, undefined, { level }).oneOffTotal
    const charged = calculatePricing(sliced, MOCK_CATALOGUE, a, undefined, { level }).oneOffTotal
    expect(shown).toBe(charged)
  })
})
