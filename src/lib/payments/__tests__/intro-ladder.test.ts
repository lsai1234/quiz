/**
 * The global intro-offer ladder — pure logic + profitability at the everyday rungs.
 */
import {
  advanceLadder, currentLadderDiscount, headlineLadderDiscount, isLadderDiscount,
  INITIAL_LADDER_STATE, type IntroStage, type LadderState,
} from '../intro-ladder'
import { buildStackBlueprint } from '@/lib/stack-blueprint/factory'
import { calculatePricing, getPricingConfig } from '@/lib/stack-blueprint/pricing'
import { MOCK_CATALOGUE } from '@/lib/catalogue'
import type { QuizAnswers } from '@/lib/types'

const STAGES: IntroStage[] = [
  { discount: 0.5, quota: 1 },
  { discount: 0.25, quota: 3 },
  { discount: 0.1, quota: 2 },
]

describe('intro ladder', () => {
  it('starts on the loss-leader (biggest) discount', () => {
    expect(currentLadderDiscount(STAGES, INITIAL_LADDER_STATE)).toBe(0.5)
    expect(headlineLadderDiscount(STAGES)).toBe(0.5)
  })

  it('steps down as its quota is consumed, then cycles back', () => {
    // Walk the whole cycle and record the discount shown before each checkout.
    let state: LadderState = INITIAL_LADDER_STATE
    const shown: number[] = []
    for (let i = 0; i < 7; i++) {
      shown.push(currentLadderDiscount(STAGES, state))
      state = advanceLadder(STAGES, state)
    }
    // 50% once, then 25% three times, then 10% twice, then back to 50%.
    expect(shown).toEqual([0.5, 0.25, 0.25, 0.25, 0.1, 0.1, 0.5])
  })

  it('validates a rate against the configured rungs', () => {
    expect(isLadderDiscount(0.25, STAGES)).toBe(true)
    expect(isLadderDiscount(0.4, STAGES)).toBe(false)
  })

  it('is a no-op with no stages', () => {
    expect(currentLadderDiscount([], INITIAL_LADDER_STATE)).toBe(0)
    expect(advanceLadder([], INITIAL_LADDER_STATE)).toEqual(INITIAL_LADDER_STATE)
  })
})

describe('profitability with no minimum term', () => {
  function A(o: Partial<QuizAnswers> = {}): QuizAnswers {
    return {
      name: 'P', track: 'performance', drinksMode: false, drinksPerDay: null,
      dailyDrinks: null, drinkVariety: null, workoutAddOns: [], primaryGoal: null,
      asNeeded: {}, ageBracket: '25-34', exactAge: null, gender: 'male',
      safetyFlags: [], weightBand: null, goals: ['muscle', 'energy'], trainingFrequency: '5-6x',
      trainingType: ['strength'], lifestyle: [], diet: 'mostly-good', currentSupplements: [],
      currentVitamins: [], tryOurs: [], preferredFormats: [], wellbeingAnswers: {},
      dynamicAnswers: {}, caffeineLevel: 'high', budget: null, stackPreference: null,
      trainingExperience: 'experienced', trainingFocus: 'hypertrophy', stimPreference: 'yes', trainingTime: 'morning', ...o,
    }
  }
  const bp = buildStackBlueprint(A(), MOCK_CATALOGUE)
  const priceAt = (intro: number) =>
    calculatePricing(bp, MOCK_CATALOGUE, A(), undefined, { level: 'performance', introDiscountOverride: intro })

  it('the everyday rungs (25% / 10%) stay profitable even if cancelled after month one', () => {
    // minSubscriptionMonths is now 1 — committed margin is just the first month.
    expect(getPricingConfig().minSubscriptionMonths).toBe(1)
    for (const intro of [0.25, 0.1]) {
      expect(priceAt(intro).subscriptionProfitableOnCancel).toBe(true)
    }
  })
})
