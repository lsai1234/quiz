/**
 * blueprint.checks: what the engine left out for this person, and why.
 *
 * The record is gathered while the engine scores, so these tests hold it to
 * three things: it only names products that were real candidates in this
 * person's build, it never names a product that is in the stack, and it never
 * records a safety exclusion. The persona snapshot suite separately proves the
 * stack itself has not moved.
 */
import { buildStackBlueprint, checksForSlots, scoreProductDetailed, getArchetype } from '../factory'
import type { StackCheck } from '../explain-types'
import type { StackSlotEntry } from '../types'
import { MOCK_CATALOGUE } from '@/lib/catalogue'
import { SLOT_ORDER, DOSE_CAPS } from '@/lib/quiz-core'
import type { QuizAnswers } from '@/lib/types'

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

const checksOf = (a: QuizAnswers) => {
  const bp = buildStackBlueprint(a, MOCK_CATALOGUE)
  return { bp, checks: bp.checks!, inStack: new Set(bp.slots.map((s) => s.selectedProductId)) }
}
const find = (checks: StackCheck[], kind: StackCheck['kind'], value?: unknown) =>
  checks.filter((c) => c.kind === kind && (value === undefined || c.value === value))
const product = (id: string) => MOCK_CATALOGUE.find((p) => p.id === id)!

const SWEEP: QuizAnswers[] = [
  A({ goals: ['muscle'], trainingFrequency: '5-6x', trainingFocus: 'hypertrophy', trainingExperience: 'experienced', caffeineLevel: 'high', trainingTime: 'evening' }),
  A({ goals: ['muscle'], lifestyle: ['vegan'], caffeineLevel: 'none', trainingTime: 'evening' }),
  A({ goals: ['muscle', 'energy'], currentSupplements: ['protein'], currentVitamins: ['vitamin-d'] }),
  A({ goals: ['muscle', 'sleep-better'], trainingFrequency: '5-6x' }),
  A({ goals: ['recovery'], ageBracket: '45+', lifestyle: ['joint-issues'] }),
  A({ goals: ['cutting', 'energy'], diet: 'clean', budget: '30-50', caffeineLevel: 'high' }),
  A({ goals: ['energy', 'performance'], safetyFlags: ['pregnancy', 'medication'] }),
  A({ track: 'wellbeing', goals: ['sleep-better', 'less-stress'], gender: 'female', wellbeingAnswers: { sleepQuality: 'switch-off', stressPattern: 'evening-wired' }, trainingFrequency: null }),
  A({ track: 'wellbeing', goals: ['sleep-better', 'less-stress', 'immune'], trainingFrequency: null }),
  A({ track: 'wellbeing', goals: ['skin-hair-nails'], wellbeingAnswers: { collagenOk: 'veggie' } }),
  A({ track: 'wellbeing', goals: ['menopause', 'gut-health'], gender: 'female', ageBracket: '45+', safetyFlags: ['medication'] }),
  A({ track: 'wellbeing', goals: ['immune', 'focus'], lifestyle: ['vegan'], currentVitamins: ['multivitamin', 'omega-3'] }),
  A({ track: 'wellbeing', goals: ['health'], budget: 'under-30' }),
  A({ goals: ['energy'], drivers: { 'caffeine-crash': 0.8, 'wired-evening': 0.6 }, stimPreference: 'no' }),
]

describe('blueprint.checks: invariants across a sweep', () => {
  it.each(SWEEP.map((a, i) => [i, a] as const))('persona %i', (_i, a) => {
    const { checks, inStack } = checksOf(a)
    expect(Array.isArray(checks)).toBe(true)

    for (const c of checks) {
      // Never a safety exclusion, never a product that is in the stack, never empty.
      expect(c.kind).not.toBe('safety')
      expect(c.productIds.length).toBeGreaterThan(0)
      for (const id of c.productIds) expect(inStack.has(id)).toBe(false)
      expect(new Set(c.productIds).size).toBe(c.productIds.length)
    }

    // A product contraindicated for this person is not mentioned anywhere.
    const flags = a.safetyFlags ?? []
    const contraindicated = MOCK_CATALOGUE.filter((p) => (p.contraindications ?? []).some((f) => flags.includes(f))).map((p) => p.id)
    for (const c of checks) for (const id of c.productIds) expect(contraindicated).not.toContain(id)

    // Exclusions: one check per reason and answer, and each product really is
    // excluded for that reason and answer in at least one slot.
    const exclusionChecks = checks.filter((c) => !['relevance-floor', 'dedup-active', 'dose-cap'].includes(c.kind))
    const keys = exclusionChecks.map((c) => `${c.kind}|${c.field}|${c.value}`)
    expect(new Set(keys).size).toBe(keys.length)
    for (const c of exclusionChecks) {
      for (const id of c.productIds) {
        const reasons = SLOT_ORDER.map((slot) => scoreProductDetailed(product(id), slot, a, getArchetype(a.goals)).excludedBy)
        expect(reasons).toContainEqual({ reason: c.kind, field: c.field, value: c.value })
      }
    }

    // Bundle-rule drops say something true of the final stack.
    const finalActives = [...inStack].flatMap((id) => product(id).actives ?? [])
    for (const c of find(checks, 'dedup-active')) {
      expect(product(c.productIds[0]).actives?.some((x) => x.name === c.active)).toBe(true)
      expect(finalActives.some((x) => x.name === c.active)).toBe(true)
    }
    for (const c of find(checks, 'dose-cap')) {
      expect(c.capMg).toBe(DOSE_CAPS[c.active!])
    }
  })
})

describe('blueprint.checks: what gets recorded', () => {
  it('vegan: every non-vegan candidate, under one check', () => {
    const { checks } = checksOf(SWEEP[1])
    const vegan = find(checks, 'vegan')
    expect(vegan).toHaveLength(1)
    expect(vegan[0]).toMatchObject({ field: 'lifestyle', value: 'vegan' })
    expect(vegan[0].productIds).toContain('chrgd-whey-protein')
    for (const id of vegan[0].productIds) expect(product(id).dietaryTags).not.toContain('vegan')
  })

  it('stimulants, credited to the answer that ruled them out', () => {
    expect(find(checksOf(SWEEP[1]).checks, 'stimulant')).toEqual([
      { kind: 'stimulant', productIds: ['chrgd-pre-workout'], field: 'caffeineLevel', value: 'none' },
    ])
    expect(find(checksOf(SWEEP[13]).checks, 'stimulant')).toEqual([
      { kind: 'stimulant', productIds: ['chrgd-pre-workout'], field: 'stimPreference', value: 'no' },
    ])
  })

  it('already taking: one check per item, naming the list it was ticked in', () => {
    const { checks } = checksOf(SWEEP[2])
    const protein = find(checks, 'already-taking', 'protein')
    const vitD = find(checks, 'already-taking', 'vitamin-d')
    expect(protein).toHaveLength(1)
    expect(protein[0].field).toBe('currentSupplements')
    expect(protein[0].productIds).toContain('chrgd-whey-protein')
    expect(vitD).toHaveLength(1)
    expect(vitD[0].field).toBe('currentVitamins')
    expect(vitD[0].productIds).toContain('chrgd-vitamin-d3-k2')
  })

  it('"try ours" means nothing was left out for that item', () => {
    const { checks } = checksOf({ ...SWEEP[2], tryOurs: ['vitamin-d'] })
    expect(find(checks, 'already-taking', 'vitamin-d')).toEqual([])
    expect(find(checks, 'already-taking', 'protein')).toHaveLength(1)
  })

  it('a product that was never a candidate is not reported', () => {
    // The wellbeing path never considers creatine or a mass gainer for a sleep
    // goal, so ticking creatine left nothing out.
    const { checks } = checksOf(A({ track: 'wellbeing', goals: ['sleep-better'], currentSupplements: ['creatine'], trainingFrequency: null }))
    const named = checks.flatMap((c) => c.productIds)
    expect(named).not.toContain('chrgd-creatine')
    expect(named).not.toContain('chrgd-mass-builder')
    expect(find(checks, 'already-taking')).toEqual([])
  })

  it('collagen for someone who said vegetarian', () => {
    expect(find(checksOf(SWEEP[9]).checks, 'collagen-veggie')).toEqual([
      { kind: 'collagen-veggie', productIds: ['chrgd-collagen'], field: 'wellbeingAnswers.collagenOk', value: 'veggie' },
    ])
  })

  it('a doubled-up active, naming it', () => {
    const { checks, inStack } = checksOf(SWEEP[7])
    expect(find(checks, 'dedup-active').map((c) => c.active).sort()).toEqual(['ashwagandha', 'magnesium'])
    expect(inStack.has('chrgd-sleep-support')).toBe(true)
  })

  it('safety exclusions are never recorded, not even as another reason', () => {
    // The pregnancy flag removes the stim pre-workout and both ashwagandha
    // products; with no flag, the same person's record names the adaptogen
    // under its goal gate, so the absence below is the safety gate's doing.
    const flagged = checksOf(SWEEP[6]).checks
    const unflagged = checksOf({ ...SWEEP[6], safetyFlags: [] }).checks
    expect(unflagged.flatMap((c) => c.productIds)).toContain('chrgd-ashwagandha')
    expect(flagged.flatMap((c) => c.productIds)).not.toContain('chrgd-ashwagandha')
    expect(flagged.some((c) => c.kind === 'safety')).toBe(false)
  })

  it('nothing to report is an empty list, not a missing one', () => {
    const { bp } = checksOf(A({ track: 'wellbeing', goals: ['immune'], trainingFrequency: null }))
    expect(bp.checks).toEqual([])
  })
})

// ── checksForSlots ──────────────────────────────────────────────────────────
function slot(id: string, order: number): StackSlotEntry {
  return {
    slotId: `s-${id}`, slotType: 'health', title: 'X', description: '', recommendedProductId: id,
    selectedProductId: id, selectedVariantId: null, required: false, canRemove: true, canSwap: true,
    swapGroup: product(id).swapGroup, reason: '', confidenceScore: 50, displayOrder: order,
  }
}

describe('checksForSlots', () => {
  const checks: StackCheck[] = [
    { kind: 'vegan', productIds: ['chrgd-whey-protein', 'chrgd-omega-3'], field: 'lifestyle', value: 'vegan' },
    { kind: 'dedup-active', productIds: ['chrgd-sleep-support'], active: 'magnesium' },
    { kind: 'dose-cap', productIds: ['chrgd-immunity-fizz'], active: 'vitamin-c', capMg: 1000 },
  ]

  it('returns every check while it is still true', () => {
    const slots = [slot('chrgd-magnesium', 0), slot('chrgd-vitamin-c-zinc', 1)]
    expect(checksForSlots(checks, slots, MOCK_CATALOGUE)).toEqual(checks)
  })

  it('drops a gate check as soon as any product it left out is back on screen', () => {
    // "Left out anything that isn't vegan" is untrue the moment one of them is shown.
    const slots = [slot('chrgd-magnesium', 0), slot('chrgd-omega-3', 1)]
    expect(find(checksForSlots(checks, slots, MOCK_CATALOGUE), 'vegan')).toEqual([])
  })

  it('drops a dedup check once no product on screen carries that active', () => {
    const slots = [slot('chrgd-vitamin-c-zinc', 0)]
    expect(find(checksForSlots(checks, slots, MOCK_CATALOGUE), 'dedup-active')).toEqual([])
  })

  it('drops a dedup check once two products in the stack share that active', () => {
    const slots = [slot('chrgd-magnesium', 0), slot('chrgd-menopause-complete', 1)]
    expect(find(checksForSlots(checks, slots, MOCK_CATALOGUE), 'dedup-active')).toEqual([])
  })

  it('drops a dose-cap check once the stack is over that cap', () => {
    const slots = [slot('chrgd-vitamin-c-zinc', 0), { ...slot('chrgd-vitamin-c-zinc', 1), slotId: 'again' }]
    expect(find(checksForSlots(checks, slots, MOCK_CATALOGUE), 'dose-cap')).toEqual([])
  })

  it('no checks recorded is no checks', () => {
    expect(checksForSlots(undefined, [], MOCK_CATALOGUE)).toEqual([])
  })
})
