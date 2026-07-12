/**
 * CHRGD LQD — drinks mode. Covers the drinkable filter, the drinks-only
 * blueprint, the quiz-flow step skipping/copy, and the pour-guide helpers.
 */
import { isDrinkable, drinkableOnly } from '@/lib/catalogue/filters'
import { MOCK_CATALOGUE } from '@/lib/catalogue/mock-catalogue'
import { buildStackBlueprint } from '@/lib/stack-blueprint/factory'
import { activeSteps, stepCopy, QUIZ_STEPS } from '@/lib/quiz-flow'
import { monthlyDrinksOf, pourMomentFor } from '@/lib/lqd'
import { defaultAnswers } from '@/lib/store'
import type { QuizAnswers } from '@/lib/types'
import type { SubscriptionLine } from '@/lib/stack-blueprint/pricing'

const lqdAnswers = (over: Partial<QuizAnswers> = {}): QuizAnswers => ({
  ...defaultAnswers,
  track: 'performance',
  drinksMode: true,
  goals: ['muscle', 'energy', 'hydration'],
  trainingFrequency: '3-4x',
  budget: '80-plus',
  ...over,
})

describe('drinkable filter', () => {
  it('classifies powders as drinkable and capsules as not', () => {
    const whey = MOCK_CATALOGUE.find((p) => p.id === 'chrgd-whey-protein')!
    const omega = MOCK_CATALOGUE.find((p) => p.id === 'chrgd-omega-3')!
    expect(isDrinkable(whey)).toBe(true)
    expect(isDrinkable(omega)).toBe(false)
  })

  it('drinkableOnly is a no-op outside drinks mode', () => {
    expect(drinkableOnly(MOCK_CATALOGUE, false)).toHaveLength(MOCK_CATALOGUE.length)
    const drinks = drinkableOnly(MOCK_CATALOGUE, true)
    expect(drinks.length).toBeGreaterThan(0)
    expect(drinks.every(isDrinkable)).toBe(true)
  })
})

describe('LQD blueprint', () => {
  it('builds a stack containing only drinkable products', () => {
    const blueprint = buildStackBlueprint(lqdAnswers(), MOCK_CATALOGUE)
    expect(blueprint.slots.length).toBeGreaterThan(0)
    for (const slot of blueprint.slots) {
      const product = MOCK_CATALOGUE.find((p) => p.id === slot.selectedProductId)!
      expect(isDrinkable(product)).toBe(true)
    }
  })

  it('omits capsule-only territory instead of failing (e.g. sleep/health slots)', () => {
    // A wellbeing-ish goal mix whose usual picks are capsules — the blueprint
    // should still build (drinkable picks only), never throw or include capsules.
    const blueprint = buildStackBlueprint(
      lqdAnswers({ track: 'wellbeing', goals: ['health', 'energy', 'recovery'] }),
      MOCK_CATALOGUE,
    )
    for (const slot of blueprint.slots) {
      const product = MOCK_CATALOGUE.find((p) => p.id === slot.selectedProductId)!
      expect(isDrinkable(product)).toBe(true)
    }
  })

  it('same answers without drinks mode may include capsules (sanity contrast)', () => {
    const blueprint = buildStackBlueprint(lqdAnswers({ drinksMode: false, goals: ['health'] }), MOCK_CATALOGUE)
    const anyCapsule = blueprint.slots.some((slot) => {
      const product = MOCK_CATALOGUE.find((p) => p.id === slot.selectedProductId)!
      return !isDrinkable(product)
    })
    expect(anyCapsule).toBe(true)
  })
})

describe('LQD quiz flow', () => {
  it('skips the formats step in drinks mode only', () => {
    const normal = activeSteps('performance').map((s) => s.id)
    const lqd = activeSteps('performance', true).map((s) => s.id)
    expect(normal).toContain('formats')
    expect(lqd).not.toContain('formats')
    // Everything else survives.
    expect(lqd).toEqual(normal.filter((id) => id !== 'formats'))
  })

  it('applies LQD copy overrides on top of the track', () => {
    const budget = QUIZ_STEPS.find((s) => s.id === 'budget')!
    expect(stepCopy(budget, 'performance', true).q).toBe("What's your drinks budget?")
    expect(stepCopy(budget, 'performance', false).q).toBe("What's your stack budget?")
  })
})

describe('pour guide', () => {
  it('totals monthly drinks from line occasions', () => {
    const lines = [
      { occasionsPerMonth: 30 },
      { occasionsPerMonth: 12.4 },
    ] as SubscriptionLine[]
    expect(monthlyDrinksOf(lines)).toBe(42)
    expect(monthlyDrinksOf([])).toBe(0)
  })

  it('maps slots to sensible moments', () => {
    expect(pourMomentFor('energy', true).moment).toBe('Before training')
    expect(pourMomentFor('energy', true).note).toContain('mid-afternoon')
    expect(pourMomentFor('hydration', false).moment).toContain('During training')
    expect(pourMomentFor('gut', false).moment).toBe('With breakfast')
    expect(pourMomentFor(undefined, false).moment).toBe('Whenever suits you')
  })
})
