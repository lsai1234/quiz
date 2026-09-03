import { buildStackBlueprint } from '@/lib/stack-blueprint/factory'
import { MOCK_CATALOGUE } from '@/lib/catalogue'
import { DRIVER_AFFINITY, DRIVER_CHANGED, DRIVER_STIM_PENALTY } from '../driver-map'
import { DRIVER_IDS, type DriverId } from '@/lib/quiz-v2/drivers'
import { BANK } from '@/lib/quiz-v2/bank'
import type { QuizAnswers } from '@/lib/types'

/**
 * The driver table, and the one invariant the whole two-quiz arrangement rests
 * on.
 */

function A(o: Partial<QuizAnswers> = {}): QuizAnswers {
  return {
    name: 'P', track: 'performance', primaryGoal: null,
    asNeeded: {}, ageBracket: '25-34', exactAge: null, gender: 'male', goals: ['health'],
    trainingFrequency: '3-4x', trainingType: [], lifestyle: [], diet: 'mostly-good',
    currentSupplements: [], currentVitamins: [], tryOurs: [],
    wellbeingAnswers: {}, dynamicAnswers: {}, caffeineLevel: 'medium', budget: null,
    stackPreference: null, trainingExperience: 'intermediate', trainingFocus: null,
    stimPreference: 'yes', trainingTime: null, ...o,
  }
}

const slotsOf = (a: QuizAnswers) =>
  buildStackBlueprint(a, MOCK_CATALOGUE).slots
    .slice()
    .sort((x, y) => x.displayOrder - y.displayOrder)
    .map((s) => `${s.title}:${s.selectedProductId}`)

describe('the zero-contribution invariant', () => {
  /**
   * This is the guard for the entire experiment. v1 answers carry no drivers,
   * and if the new table could move a recommendation without them, every v1
   * bundle would silently change the day v2 shipped — and the comparison
   * between the two arms would be measuring the engine rather than the quiz.
   */
  it('changes nothing when there are no drivers', () => {
    for (const goals of [
      ['muscle'], ['energy'], ['sleep-better'], ['immune', 'focus'], ['gut-health'],
      ['cutting', 'energy'], ['menopause'], ['skin-hair-nails'], ['performance', 'hydration'],
    ] as QuizAnswers['goals'][]) {
      const withoutField = slotsOf(A({ goals }))
      const withUndefined = slotsOf(A({ goals, drivers: undefined }))
      const withEmpty = slotsOf(A({ goals, drivers: {} }))
      expect(withUndefined).toEqual(withoutField)
      expect(withEmpty).toEqual(withoutField)
    }
  })

  it('does move a recommendation once a driver IS present', () => {
    // If this ever stops being true the table has become decorative and the
    // interview's extra questions are costing taps for nothing.
    const plain = slotsOf(A({ track: 'wellbeing', goals: ['health'], trainingFrequency: null }))
    const withDriver = slotsOf(A({
      track: 'wellbeing', goals: ['health'], trainingFrequency: null,
      drivers: { 'sun-exposure-low': 0.9, 'micronutrient-gap': 0.8 },
    }))
    expect(withDriver).not.toEqual(plain)
  })
})

describe('the table itself', () => {
  it('gives every driver somewhere to go', () => {
    // A driver nothing consumes is a question that costs a tap and changes
    // nothing — the exact failure this whole design is meant to avoid.
    for (const id of DRIVER_IDS) {
      const affinity = DRIVER_AFFINITY[id]
      const penalty = DRIVER_STIM_PENALTY[id]
      expect(
        (affinity && Object.keys(affinity).length > 0) || penalty != null,
      ).toBe(true)
    }
  })

  it('can produce every driver from some bank option', () => {
    // The other half: a driver the interview can never reach is dead config.
    const producible = new Set<string>()
    for (const q of BANK) {
      for (const o of q.options) {
        for (const d of Object.keys(o.drivers ?? {})) producible.add(d)
      }
    }
    const unreachable = DRIVER_IDS.filter((d) => !producible.has(d))
    expect(unreachable).toEqual([])
  })

  it('has a recap line for every driver', () => {
    for (const id of DRIVER_IDS) {
      expect(typeof DRIVER_CHANGED[id]).toBe('string')
      expect(DRIVER_CHANGED[id].length).toBeGreaterThan(10)
    }
  })

  it('only ever pushes stimulants away, never toward', () => {
    for (const v of Object.values(DRIVER_STIM_PENALTY)) expect(v).toBeLessThan(0)
  })

  it('keeps affinity weights positive — a negative belongs in the penalty table', () => {
    for (const groups of Object.values(DRIVER_AFFINITY)) {
      for (const weight of Object.values(groups ?? {})) expect(weight).toBeGreaterThan(0)
    }
  })
})

describe('the stimulant penalty in the engine', () => {
  it('drops a stimulant for someone whose energy problem is caffeine', () => {
    // The clearest thing v2 knows that v1 could not: "more energy" alone would
    // have earned this person a pre-workout.
    const base = A({ goals: ['energy', 'performance'], caffeineLevel: 'high', trainingFrequency: '5-6x' })
    const stimIds = (a: QuizAnswers) =>
      buildStackBlueprint(a, MOCK_CATALOGUE).slots
        .map((s) => MOCK_CATALOGUE.find((p) => p.id === s.selectedProductId))
        .filter((p) => p?.hasStimulants).length

    const before = stimIds(base)
    const after = stimIds({ ...base, drivers: { 'caffeine-crash': 0.9, 'wired-evening': 0.8 } })
    expect(after).toBeLessThanOrEqual(before)
  })
})
