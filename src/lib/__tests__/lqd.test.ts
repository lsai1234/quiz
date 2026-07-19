/**
 * CHRGD LQD — the pre-made drinks package. Covers the ready-to-drink filter,
 * the RTD-only blueprint, the quiz-flow step skipping/copy, and the pour-guide
 * helpers.
 */
import { isDrinkable, isReadyToDrink, lqdOnly } from '@/lib/catalogue/filters'
import { MOCK_CATALOGUE } from '@/lib/catalogue/mock-catalogue'
import { buildStackBlueprint } from '@/lib/stack-blueprint/factory'
import { activeSteps, stepCopy, QUIZ_STEPS } from '@/lib/quiz-flow'
import { monthlyDrinksOf, pourMomentFor, buildLqdPlan, pacingFor, DEFAULT_DRINKS_PER_DAY } from '@/lib/lqd'
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
  it('swaps formats for the drinks/day pace step and drops the bundle step in drinks mode', () => {
    const normal = activeSteps('performance').map((s) => s.id)
    const lqd = activeSteps('performance', true).map((s) => s.id)
    // Formats is dropped (implied) and the pace step is added, both only in LQD.
    expect(normal).toContain('formats')
    expect(normal).not.toContain('drinksPerDay')
    expect(lqd).not.toContain('formats')
    expect(lqd).toContain('drinksPerDay')
    // The bundle chooser is gone too — the pace already sizes the package.
    expect(normal).toContain('budget')
    expect(lqd).not.toContain('budget')
    // Nothing else moves.
    expect(lqd.filter((id) => id !== 'drinksPerDay')).toEqual(
      normal.filter((id) => id !== 'formats' && id !== 'budget'),
    )
    expect(lqd[lqd.indexOf('drinksPerDay') - 1]).toBe('goals')
  })

  it('applies LQD copy overrides on top of the track', () => {
    const review = QUIZ_STEPS.find((s) => s.id === 'review')!
    expect(stepCopy(review, 'performance', true).q).toBe('Quick check before we pour.')
    expect(stepCopy(review, 'performance', false).q).toBe('Quick check before we build.')
  })
})

describe('LQD package sizing (pace, not budget)', () => {
  it('a faster pace yields at least as many drinks in the box', () => {
    const slow = buildStackBlueprint(lqdAnswers({ drinksPerDay: 1, budget: null }), MOCK_CATALOGUE)
    const fast = buildStackBlueprint(lqdAnswers({ drinksPerDay: 4, budget: null }), MOCK_CATALOGUE)
    expect(slow.slots.length).toBeLessThanOrEqual(3) // 1/day caps at 3 drinks
    expect(fast.slots.length).toBeGreaterThanOrEqual(slow.slots.length)
  })

  it('ignores any budget answer in drinks mode — pace alone sizes the package', () => {
    const cheap = buildStackBlueprint(lqdAnswers({ drinksPerDay: 3, budget: 'under-30' }), MOCK_CATALOGUE)
    const dear = buildStackBlueprint(lqdAnswers({ drinksPerDay: 3, budget: '80-plus' }), MOCK_CATALOGUE)
    expect(cheap.slots.map((s) => s.selectedProductId)).toEqual(dear.slots.map((s) => s.selectedProductId))
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

// A minimal SubscriptionLine stand-in — buildLqdPlan only reads the product's
// primary slot + stimulant flag and the line's occasionsPerMonth.
const line = (slot: string, occasionsPerMonth: number, hasStimulants = false): SubscriptionLine =>
  ({
    product: { id: `p-${slot}`, title: `Drink ${slot}`, stackSlots: [slot], hasStimulants },
    occasionsPerMonth,
  } as unknown as SubscriptionLine)

describe('buildLqdPlan — month of drinks at your pace', () => {
  it('only the pre-workout is timed; everything else is a sip-anytime pool', () => {
    expect(pacingFor('energy')).toBe('timed')
    expect(pacingFor('health')).toBe('anytime')
    expect(pacingFor('protein')).toBe('anytime')
    expect(pacingFor(undefined)).toBe('anytime')

    const plan = buildLqdPlan(
      [line('energy', 15, true), line('health', 30), line('protein', 20)],
      { drinksPerDay: 2 },
    )
    expect(plan.timedDrinks).toBe(15)
    expect(plan.anytimeDrinks).toBe(50)
    expect(plan.totalDrinks).toBe(65)
    // Anytime lines carry the "covered over the month" framing, not a moment.
    const vits = plan.lines.find((l) => l.slot === 'health')!
    expect(vits.pacing).toBe('anytime')
    expect(vits.coverageNote).toContain('most days')
  })

  it('reconciles the chosen pace against the fixed pool (days of cover + fit)', () => {
    const drinks = [line('health', 30), line('protein', 30)] // 60-drink pool
    expect(buildLqdPlan(drinks, { drinksPerDay: 1 }).fit).toBe('stretches') // ~60 days
    expect(buildLqdPlan(drinks, { drinksPerDay: 2 }).fit).toBe('balanced')  // ~30 days
    expect(buildLqdPlan(drinks, { drinksPerDay: 3 }).fit).toBe('brisk')     // ~20 days
    expect(buildLqdPlan(drinks, { drinksPerDay: 2 }).daysOfCover).toBe(30)
  })

  it('falls back to a sensible pace when the customer never picked one', () => {
    const plan = buildLqdPlan([line('health', 30)], null)
    expect(plan.drinksPerDay).toBe(DEFAULT_DRINKS_PER_DAY)
  })
})
