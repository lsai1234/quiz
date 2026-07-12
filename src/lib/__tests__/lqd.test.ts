/**
 * CHRGD LQD — the pre-made drinks package. Covers the ready-to-drink filter,
 * the RTD-only blueprint, the quiz-flow step skipping/copy, and the pour-guide
 * helpers.
 */
import { isDrinkable, isReadyToDrink, lqdOnly } from '@/lib/catalogue/filters'
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

describe('ready-to-drink filter', () => {
  it('powders are drinkable but NOT ready-to-drink; RTDs are both', () => {
    const whey = MOCK_CATALOGUE.find((p) => p.id === 'chrgd-whey-protein')!
    const rtd = MOCK_CATALOGUE.find((p) => p.id === 'chrgd-lqd-protein-rtd')!
    const omega = MOCK_CATALOGUE.find((p) => p.id === 'chrgd-omega-3')!
    expect(isDrinkable(whey)).toBe(true)
    expect(isReadyToDrink(whey)).toBe(false) // powder needs mixing → not LQD
    expect(isReadyToDrink(rtd)).toBe(true)
    expect(isReadyToDrink(omega)).toBe(false)
  })

  it('lqdOnly keeps pre-made drinks only, and is a no-op outside drinks mode', () => {
    expect(lqdOnly(MOCK_CATALOGUE, false)).toHaveLength(MOCK_CATALOGUE.length)
    const rtds = lqdOnly(MOCK_CATALOGUE, true)
    expect(rtds.length).toBeGreaterThan(0)
    expect(rtds.every(isReadyToDrink)).toBe(true)
    expect(rtds.some((p) => (p.formats ?? []).includes('powder') && !isReadyToDrink(p))).toBe(false)
  })
})

describe('LQD blueprint (pre-made drinks only)', () => {
  it('builds a stack containing only ready-to-drink products — no powders', () => {
    const blueprint = buildStackBlueprint(lqdAnswers(), MOCK_CATALOGUE)
    expect(blueprint.slots.length).toBeGreaterThan(0)
    for (const slot of blueprint.slots) {
      const product = MOCK_CATALOGUE.find((p) => p.id === slot.selectedProductId)!
      expect(isReadyToDrink(product)).toBe(true)
    }
  })

  it('covers vitamins and sleep with the RTD range', () => {
    const blueprint = buildStackBlueprint(
      lqdAnswers({ track: 'wellbeing', goals: ['health', 'immune', 'sleep-better'] }),
      MOCK_CATALOGUE,
    )
    const picked = blueprint.slots.map((s) => s.selectedProductId)
    expect(picked).toContain('chrgd-lqd-vits')  // vitamin drink owns health
    expect(picked).toContain('chrgd-lqd-night') // sleep is a ready-made drink too
  })

  it('a training package gets the RTD shake, can and shot', () => {
    const blueprint = buildStackBlueprint(lqdAnswers(), MOCK_CATALOGUE)
    const picked = blueprint.slots.map((s) => s.selectedProductId)
    expect(picked).toContain('chrgd-lqd-protein-rtd')
    expect(picked).toContain('chrgd-lqd-charge')
    expect(picked).toContain('chrgd-lqd-creatine-shot')
  })

  it('keeps normal-mode picks unchanged (powder/capsule staples still win)', () => {
    const blueprint = buildStackBlueprint(
      lqdAnswers({ drinksMode: false, goals: ['muscle', 'energy', 'health', 'hydration'] }),
      MOCK_CATALOGUE,
    )
    const products = blueprint.slots.map(
      (s) => MOCK_CATALOGUE.find((p) => p.id === s.selectedProductId)!,
    )
    // The established staples still win their slots…
    expect(products.map((p) => p.id)).toContain('chrgd-multivitamin')
    // …and nothing from the RTD range sneaks into a normal stack.
    expect(products.some(isReadyToDrink)).toBe(false)
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
