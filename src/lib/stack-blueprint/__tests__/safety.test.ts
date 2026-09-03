/**
 * Phase 3 — safety gate + bodyweight dosing.
 *
 * Safety is pass/fail, so this is an assertion matrix (not a snapshot): a flagged
 * user must NEVER be recommended a contraindicated product, in any tier. Plus the
 * honest "no strong match" signal and weight-scaled protein sizing.
 */
import { buildStackBlueprint } from '../factory'
import { buildSubscriptionPlan } from '../pricing'
import { MOCK_CATALOGUE } from '@/lib/catalogue'
import type { QuizAnswers } from '@/lib/types'

function A(o: Partial<QuizAnswers> = {}): QuizAnswers {
  return {
    name: 'P', track: 'wellbeing', primaryGoal: null,
    asNeeded: {}, ageBracket: '35-44', exactAge: null, gender: 'female',
    safetyFlags: [], weightBand: null, goals: ['less-stress', 'sleep-better'],
    trainingFrequency: null, trainingType: [], lifestyle: [], diet: 'mostly-good',
    currentSupplements: [], currentVitamins: [], tryOurs: [],
    wellbeingAnswers: {}, dynamicAnswers: {}, caffeineLevel: 'medium', budget: null,
    stackPreference: null, trainingExperience: null, trainingFocus: null,
    stimPreference: 'yes', trainingTime: null, ...o,
  }
}

const productIds = (a: QuizAnswers) =>
  buildStackBlueprint(a, MOCK_CATALOGUE).slots.map((s) => s.selectedProductId)

// Products carrying a contraindication in the mock catalogue.
const PREGNANCY_UNSAFE = MOCK_CATALOGUE.filter((p) => (p.contraindications ?? []).includes('pregnancy')).map((p) => p.id)
const MEDICATION_UNSAFE = MOCK_CATALOGUE.filter((p) => (p.contraindications ?? []).includes('medication')).map((p) => p.id)

describe('safety gate', () => {
  it('the mock catalogue actually flags botanicals/stimulants (guards the fixtures)', () => {
    expect(PREGNANCY_UNSAFE).toEqual(expect.arrayContaining(['chrgd-ashwagandha', 'chrgd-sleep-support', 'chrgd-pre-workout']))
    expect(MEDICATION_UNSAFE).toContain('chrgd-menopause-complete')
  })

  it('a pregnant user is never recommended a pregnancy-contraindicated product', () => {
    // Sweep goals so the gate is exercised across the whole matrix.
    const goalSets: QuizAnswers['goals'][] = [
      ['less-stress', 'sleep-better'], ['muscle', 'energy'], ['menopause'], ['immune', 'focus'],
    ]
    for (const goals of goalSets) {
      const flagged = productIds(A({ goals, safetyFlags: ['pregnancy'], track: goals.includes('muscle') ? 'performance' : 'wellbeing', trainingFrequency: '3-4x', trainingType: ['strength'], caffeineLevel: 'high' }))
      for (const unsafe of PREGNANCY_UNSAFE) expect(flagged).not.toContain(unsafe)
    }
  })

  it('a medication user is never recommended a medication-contraindicated product', () => {
    const flagged = productIds(A({ goals: ['menopause', 'gut-health'], safetyFlags: ['medication'], ageBracket: '45+' }))
    for (const unsafe of MEDICATION_UNSAFE) expect(flagged).not.toContain(unsafe)
  })

  it('removing the flag brings the product back (proves the gate, not just absence)', () => {
    const withFlag = productIds(A({ goals: ['less-stress'], safetyFlags: ['pregnancy'] }))
    const without = productIds(A({ goals: ['less-stress'], safetyFlags: [] }))
    expect(withFlag).not.toContain('chrgd-ashwagandha')
    // Without the flag, the stress bundle can include the adaptogen.
    expect(without.some((id) => ['chrgd-ashwagandha', 'chrgd-sleep-support'].includes(id))).toBe(true)
  })
})

describe('no strong match', () => {
  it('surfaces a goal whose only product was removed by a dietary gate', () => {
    // Vegetarian collagen exclusion leaves skin-hair-nails with no catalogue match.
    const bp = buildStackBlueprint(
      A({ goals: ['skin-hair-nails'], wellbeingAnswers: { collagenOk: 'veggie' } }),
      MOCK_CATALOGUE,
    )
    expect(bp.unmetGoals).toContain('skin-hair-nails')
  })

  it('is empty when every chosen goal is covered', () => {
    const bp = buildStackBlueprint(A({ goals: ['sleep-better', 'immune'] }), MOCK_CATALOGUE)
    expect(bp.unmetGoals ?? []).toHaveLength(0)
  })
})

describe('bodyweight dosing', () => {
  const proteinLine = (a: QuizAnswers) => {
    const bp = buildStackBlueprint(a, MOCK_CATALOGUE)
    const plan = buildSubscriptionPlan(bp, MOCK_CATALOGUE, a)
    return plan.find((l) => l.product.stackSlots.includes('protein'))
  }

  it('a heavier band consumes more protein per month than a lighter one', () => {
    const base = { track: 'performance' as const, goals: ['muscle'] as QuizAnswers['goals'], trainingFrequency: '5-6x' as const, trainingType: ['strength'] as QuizAnswers['trainingType'], trainingFocus: 'hypertrophy', caffeineLevel: 'high' as const }
    const light = proteinLine(A({ ...base, weightBand: '60-75' }))
    const heavy = proteinLine(A({ ...base, weightBand: '105-plus' }))
    expect(light).toBeDefined()
    expect(heavy).toBeDefined()
    expect(heavy!.monthlyUnits).toBeGreaterThan(light!.monthlyUnits)
  })

  it('leaves non-protein and unset-weight users unchanged', () => {
    const base = { track: 'performance' as const, goals: ['muscle'] as QuizAnswers['goals'], trainingFrequency: '5-6x' as const, trainingType: ['strength'] as QuizAnswers['trainingType'], trainingFocus: 'hypertrophy', caffeineLevel: 'high' as const }
    const unset = proteinLine(A({ ...base }))
    const mid = proteinLine(A({ ...base, weightBand: '75-90' }))
    expect(unset!.monthlyUnits).toBe(mid!.monthlyUnits)
  })
})
