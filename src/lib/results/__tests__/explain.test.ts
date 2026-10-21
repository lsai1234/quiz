import { buildStackBlueprint, type SlotType } from '@/lib/stack-blueprint/factory'
import type { StackBlueprint, StackSlotEntry } from '@/lib/stack-blueprint/types'
import type { StackCheck } from '@/lib/stack-blueprint/explain-types'
import { MOCK_CATALOGUE } from '@/lib/catalogue'
import type { CatalogueProduct } from '@/lib/catalogue/types'
import { CLAIMS, claimsFor } from '@/lib/consult/claims'
import type { QuizAnswers } from '@/lib/types'
import { goalClaimFor, productClaim } from '../goal-claims'
import { ANSWER_LINES, GOAL_LINES } from '../phrases'
import {
  ANSWER_LINE_NEEDS_CLAIM, MAX_CHECK_LINES, explainProduct, explainSlot, whatWeChecked,
  type ProductExplanation,
} from '../explain'

/** The persona-bundles snapshot defaults, with the value-first (no budget) build. */
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

const MUSCLE = A({ goals: ['muscle', 'energy'], trainingFrequency: '5-6x', trainingType: ['strength'], trainingFocus: 'hypertrophy' })
const HEALTH = A({ track: 'wellbeing', goals: ['health'] })
const SLEEP_STRESS = A({
  track: 'wellbeing', goals: ['sleep-better', 'less-stress'], gender: 'female', ageBracket: '35-44',
  wellbeingAnswers: { sleepQuality: 'switch-off', stressPattern: 'evening-wired' }, trainingFrequency: null,
})
const IMMUNE_FOCUS = A({ track: 'wellbeing', goals: ['immune', 'focus'], diet: 'poor', wellbeingAnswers: { immuneBaseline: 'often' } })
const FOOTBALL = A({
  goals: ['performance', 'hydration'], trainingFrequency: '5-6x', trainingType: ['sport'],
  trainingFocus: 'football', trainingExperience: 'experienced',
})
const ALREADY_TAKING = A({
  goals: ['muscle'], currentSupplements: ['creatine'], currentVitamins: ['vitamin-d'],
  lifestyle: ['vegan'], caffeineLevel: 'none',
})
const PREGNANT = A({
  goals: ['muscle', 'less-stress'], safetyFlags: ['pregnancy'],
  healthDataConsent: { accepted: true, version: 'test', at: '2026-10-21T00:00:00Z' },
})

const PERSONAS: Record<string, QuizAnswers> = {
  MUSCLE, HEALTH, SLEEP_STRESS, IMMUNE_FOCUS, FOOTBALL, ALREADY_TAKING, PREGNANT,
}

const product = (id: string): CatalogueProduct => {
  const p = MOCK_CATALOGUE.find((x) => x.id === id)
  if (!p) throw new Error(`no mock product ${id}`)
  return p
}

/** A slot showing one product, as an add-on would be. */
const slotFor = (id: string): StackSlotEntry => ({
  slotId: `s-${id}`, slotType: 'health', title: 'X', description: '', recommendedProductId: id,
  selectedProductId: id, selectedVariantId: null, required: false, canRemove: true, canSwap: true,
  swapGroup: 'general', reason: '', confidenceScore: 50, displayOrder: 0,
})

function explainAll(answers: QuizAnswers) {
  const bp = buildStackBlueprint(answers, MOCK_CATALOGUE)
  const byProduct: Record<string, ProductExplanation | null> = {}
  for (const slot of bp.slots) byProduct[slot.selectedProductId] = explainSlot({ slot, catalogue: MOCK_CATALOGUE, answers })
  return { bp, byProduct }
}

/** Words that would tie a product to a goal no claim backs. */
const UNBACKED = /sleep|stress|recover|calm|relax|anxi|menopaus|\bgut\b|digest|skin|hair|nails|lean|fat|weight|tired|fatigue/i

describe('explainProduct: rules that hold for every persona and product', () => {
  for (const [name, answers] of Object.entries(PERSONAS)) {
    it(name, () => {
      const { bp, byProduct } = explainAll(answers)
      for (const slot of bp.slots) {
        const p = product(slot.selectedProductId)
        const e = byProduct[p.id]
        if (ANSWER_LINE_NEEDS_CLAIM && claimsFor(p.swapGroup).length === 0) expect(e).toBeNull()
        if (!e) continue

        expect(e.sentence).not.toMatch(UNBACKED)
        if (e.claim) {
          // Verbatim register wording, and a claim this kind carries.
          expect(e.claim.wording).toBe(CLAIMS[e.claim.id].wording)
          expect(claimsFor(p.swapGroup)).toContain(e.claim.id)
        }
        if (e.kind === 'goal') {
          expect(answers.goals).toContain(e.goal)
          expect(e.claim).toBe(goalClaimFor(e.goal, p))
          expect(e.sentence).toBe(GOAL_LINES[e.goal])
        } else {
          expect(answers[e.field]).toBe(e.value)
          expect((ANSWER_LINES[e.field] as Record<string, string>)[e.value]).toBe(e.sentence)
          expect(e.claim).toBe(productClaim(p, answers.goals))
        }
      }
    })
  }
})

describe('explainProduct: the three demo personas', () => {
  it('muscle: protein from the goal, creatine from how they lift, nothing for products no claim backs', () => {
    const { byProduct } = explainAll(MUSCLE)
    expect(byProduct['chrgd-whey-protein']).toEqual({
      kind: 'goal', goal: 'muscle', sentence: 'You said you want to build muscle.', claim: CLAIMS['protein-muscle-growth'],
    })
    // Creatine's largest answer term is the hypertrophy follow-up (20 > 15 for the goal).
    expect(byProduct['chrgd-creatine']).toEqual({
      kind: 'answer', field: 'trainingFocus', value: 'hypertrophy', sentence: 'You lift to build size.',
      claim: CLAIMS['creatine-performance'],
    })
    // Pre-workout scores on muscle and energy, but has no authorised claim.
    expect(byProduct['chrgd-pre-workout']).toBeNull()
    expect(byProduct['chrgd-multivitamin']).toBeNull()
    // Magnesium is here on priority alone: never said.
    expect(byProduct['chrgd-magnesium']).toBeNull()
  })

  it('general health: the goal line with whatever claim the kind carries, beside it', () => {
    const { byProduct } = explainAll(HEALTH)
    const line = 'You said you want to feel healthier.'
    expect(byProduct['chrgd-omega-3']).toEqual({ kind: 'goal', goal: 'health', sentence: line, claim: CLAIMS['epa-dha-heart'] })
    expect(byProduct['chrgd-vitamin-d3-k2']).toEqual({ kind: 'goal', goal: 'health', sentence: line, claim: CLAIMS['vitd-immune'] })
    expect(byProduct['chrgd-plant-protein']).toEqual({ kind: 'goal', goal: 'health', sentence: line, claim: CLAIMS['protein-bones'] })
    expect(byProduct['chrgd-multivitamin']).toBeNull()
    expect(byProduct['chrgd-collagen']).toBeNull()
    expect(byProduct['chrgd-daily-probiotic']).toBeNull()
  })

  it('sleep and less stress: no line at all, because no claim backs either goal', () => {
    const { bp, byProduct } = explainAll(SLEEP_STRESS)
    expect(bp.slots.length).toBeGreaterThan(0)
    for (const e of Object.values(byProduct)) expect(e).toBeNull()
  })
})

describe('explainProduct: what it walks past', () => {
  it('skips an unbacked goal and carries on to a backed one', () => {
    // Omega-3 for sleep + health: sleep is not backed for anything, general
    // health pairs with omega-3's own claim.
    const answers = A({ track: 'wellbeing', goals: ['sleep-better', 'health'] })
    const e = explainProduct({ product: product('chrgd-omega-3'), slotType: 'health', answers })
    expect(e).toMatchObject({ kind: 'goal', goal: 'health', sentence: 'You said you want to feel healthier.' })
    expect(e?.claim).toBe(CLAIMS['epa-dha-heart'])
  })

  it('says nothing about focus beside omega-3: the map holds focus back', () => {
    const e = explainAll(IMMUNE_FOCUS).byProduct['chrgd-omega-3']
    expect(e?.kind === 'goal' && e.goal === 'focus').toBe(false)
  })

  it('keeps the engine order between equal terms', () => {
    // Whey for muscle + general health: both goals add the same overlap
    // points; muscle comes first in the answers, so muscle's line is used.
    const answers = A({ goals: ['muscle', 'health'], trainingFrequency: '3-4x', trainingType: ['strength'] })
    const e = explainProduct({ product: product('chrgd-whey-protein'), slotType: 'protein', answers })
    expect(e).toMatchObject({ kind: 'goal', goal: 'muscle' })
    expect(e?.claim).toBe(CLAIMS['protein-muscle-growth'])
  })

  it('never reads priority or Top 25 rank as a reason', () => {
    const ranked: CatalogueProduct = { ...product('chrgd-omega-3'), goals: [], recommendationPriority: 10, topRank: 1 }
    expect(explainProduct({ product: ranked, slotType: 'health', answers: MUSCLE })).toBeNull()
  })

  it('never reads wellbeing follow-ups, lifestyle, drivers, age or gender as a reason', () => {
    const answers = A({
      track: 'wellbeing', goals: ['sleep-better'], ageBracket: '45+', gender: 'female',
      lifestyle: ['desk-job', 'joint-issues', 'run-down'],
      wellbeingAnswers: { sleepQuality: 'wake-night' },
      drivers: { 'sleep-maintenance': 1, 'sedentary-slump': 1, 'low-protein': 1 },
      dynamicAnswers: { q1: { optionId: 'a', question: 'q', answer: 'a', signals: ['high-stress'] } },
    })
    for (const p of MOCK_CATALOGUE) {
      for (const slotType of p.stackSlots as SlotType[]) {
        expect(explainProduct({ product: p, slotType, answers })).toBeNull()
      }
    }
  })

  it('is null for a product a gate removed', () => {
    // Whey for a vegan.
    expect(explainProduct({ product: product('chrgd-whey-protein'), slotType: 'protein', answers: ALREADY_TAKING })).toBeNull()
    // Pre-workout behind the safety screen: null, and nothing says why.
    expect(explainProduct({ product: product('chrgd-pre-workout'), slotType: 'energy', answers: PREGNANT })).toBeNull()
  })

  it('gives no line beside a product with no authorised claim, even from a non-health answer', () => {
    // Multivitamin for a poor diet: diet.poorMultivitamin moved it, but saying so
    // beside a product with no claim would say what it is for.
    expect(ANSWER_LINE_NEEDS_CLAIM).toBe(true)
    expect(explainAll(IMMUNE_FOCUS).byProduct['chrgd-multivitamin']).toBeNull()
  })

  it('folds deep-dive signals in, the same as the engine', () => {
    const answers = A({
      track: 'wellbeing', goals: ['health'],
      dynamicAnswers: { q1: { optionId: 'a', question: 'q', answer: 'a', signals: ['desk-job'] } },
    })
    const e = explainProduct({ product: product('chrgd-vitamin-d3-k2'), slotType: 'health', answers })
    expect(e).toMatchObject({ kind: 'goal', goal: 'health' })
  })

  it('explainSlot is null for a product the catalogue no longer has', () => {
    expect(explainSlot({ slot: { selectedProductId: 'gone', slotType: 'health' }, catalogue: MOCK_CATALOGUE, answers: HEALTH })).toBeNull()
  })
})

describe('whatWeChecked', () => {
  const MEDICAL = /pregnan|breastfeed|medic|prescri|allerg|safe|screen|doctor|\bGP\b|condition|contraindicat/i

  it('says what was left out for this person, things they told us first', () => {
    const bp = buildStackBlueprint(ALREADY_TAKING, MOCK_CATALOGUE)
    expect(whatWeChecked({ blueprint: bp, products: MOCK_CATALOGUE })).toEqual([
      'Left out creatine: you said you already take it.',
      'Left out vitamin D: you said you already take it.',
      'Left out anything that isn’t vegan: you said your diet is plant-based.',
      'Left out anything with stimulants: you said you avoid caffeine.',
    ])
  })

  it('puts every doubled-up ingredient in one line', () => {
    const bp = buildStackBlueprint(SLEEP_STRESS, MOCK_CATALOGUE)
    expect(whatWeChecked({ blueprint: bp, products: MOCK_CATALOGUE })).toEqual([
      'Removed doubled-up ingredients: magnesium and ashwagandha.',
    ])
  })

  it('is empty when only goal gates and the relevance floor fired', () => {
    const bp = buildStackBlueprint(MUSCLE, MOCK_CATALOGUE)
    expect(bp.checks?.length).toBeGreaterThan(0)
    expect(bp.checks?.every((c) => c.kind === 'goal-gate' || c.kind === 'relevance-floor')).toBe(true)
    expect(whatWeChecked({ blueprint: bp, products: MOCK_CATALOGUE })).toEqual([])
  })

  it('is empty for a blueprint with no checks (mock and consult blueprints)', () => {
    const bp = buildStackBlueprint(HEALTH, MOCK_CATALOGUE)
    expect(whatWeChecked({ blueprint: { ...bp, checks: undefined }, products: MOCK_CATALOGUE })).toEqual([])
  })

  it('never says anything about the safety screen', () => {
    const bp = buildStackBlueprint(PREGNANT, MOCK_CATALOGUE)
    const withSafety: StackBlueprint = {
      ...bp,
      checks: [{ kind: 'safety', productIds: ['chrgd-pre-workout'], field: 'safetyFlags', value: null }, ...(bp.checks ?? [])],
    }
    for (const blueprint of [bp, withSafety]) {
      const lines = whatWeChecked({ blueprint, products: MOCK_CATALOGUE })
      for (const line of lines) expect(line).not.toMatch(MEDICAL)
    }
    expect(whatWeChecked({
      blueprint: { slots: [], checks: [{ kind: 'safety', productIds: ['chrgd-pre-workout'], field: 'safetyFlags', value: null }] },
      products: MOCK_CATALOGUE,
    })).toEqual([])
  })

  it('drops a line once it stops being true of the slots shown', () => {
    const bp = buildStackBlueprint(ALREADY_TAKING, MOCK_CATALOGUE)
    const swapped = bp.slots.map((s, i) => (i === 0 ? { ...s, selectedProductId: 'chrgd-creatine' } : s))
    const lines = whatWeChecked({ blueprint: bp, products: MOCK_CATALOGUE, slots: swapped })
    expect(lines).not.toContain('Left out creatine: you said you already take it.')
    expect(lines).toContain('Left out vitamin D: you said you already take it.')
  })

  it('orders by kind, keeps one line per thing, and stops at the cap', () => {
    const checks: StackCheck[] = [
      { kind: 'dose-cap', productIds: ['x1'], active: 'caffeine', capMg: 200 },
      { kind: 'dedup-active', productIds: ['x2'], active: 'magnesium' },
      { kind: 'stimulant', productIds: ['x3'], field: 'stimPreference', value: 'no' },
      { kind: 'already-taking', productIds: ['x4'], field: 'currentVitamins', value: 'omega-3' },
      { kind: 'already-taking', productIds: ['x5'], field: 'currentSupplements', value: 'omega-3' },
      { kind: 'collagen-veggie', productIds: ['x6'], field: 'wellbeingAnswers.collagenOk', value: 'veggie' },
      { kind: 'gluten-free', productIds: ['x7'], field: 'dietary', value: 'gluten-free' },
      { kind: 'goal-gate', productIds: ['x8'], field: 'product.swapGroup', value: 'fat-burner' },
      { kind: 'relevance-floor', productIds: ['x9'] },
      { kind: 'already-taking', productIds: ['x10'], field: 'currentSupplements', value: 'protein' },
    ]
    const lines = whatWeChecked({ blueprint: { slots: [], checks }, products: MOCK_CATALOGUE })
    expect(lines).toHaveLength(MAX_CHECK_LINES)
    expect(lines).toEqual([
      'Left out omega-3: you said you already take it.',
      'Left out protein: you said you already use it.',
      'Left out bovine collagen: you said you’re vegetarian or vegan.',
      'Left out anything that isn’t gluten-free, as you asked.',
      'Left out anything with stimulants: you asked us to keep it stim-free.',
    ])
    // A doubled-up line needs the one product it was kept for still on screen.
    const kept = [slotFor('chrgd-magnesium')]
    const all = whatWeChecked({ blueprint: { slots: kept, checks: checks.slice(0, 2) }, products: MOCK_CATALOGUE })
    expect(all).toEqual(['Removed a doubled-up ingredient: magnesium.', 'Kept caffeine to 200 mg a day or less.'])
    const gone = whatWeChecked({ blueprint: { slots: [], checks: checks.slice(0, 2) }, products: MOCK_CATALOGUE })
    expect(gone).toEqual(['Kept caffeine to 200 mg a day or less.'])
  })

  it('falls back to an unnamed line when an active name is not fit to show', () => {
    const probiotic: CatalogueProduct = { ...product('chrgd-magnesium'), id: 'probiotic-x', actives: [{ name: '25 billion cfu' }] }
    const checks: StackCheck[] = [
      { kind: 'dedup-active', productIds: ['x1'], active: '25 billion cfu' },
      { kind: 'dose-cap', productIds: ['x2'], active: '10 probiotic strains', capMg: 10 },
    ]
    expect(whatWeChecked({
      blueprint: { slots: [slotFor('probiotic-x')], checks },
      products: [...MOCK_CATALOGUE, probiotic],
    })).toEqual(['Removed a doubled-up ingredient.'])
  })

  it('drops a "left out" line when a product on screen fails the same gate for these answers', () => {
    const bp = buildStackBlueprint(ALREADY_TAKING, MOCK_CATALOGUE)
    expect(whatWeChecked({ blueprint: bp, products: MOCK_CATALOGUE, answers: ALREADY_TAKING }))
      .toContain('Left out vitamin D: you said you already take it.')
    // A vitamin D added on its own: the line would now sit above a vitamin D.
    const added = [...bp.slots, slotFor('chrgd-vitamin-d3-k2')]
    const lines = whatWeChecked({ blueprint: bp, products: MOCK_CATALOGUE, slots: added, answers: ALREADY_TAKING })
    expect(lines).not.toContain('Left out vitamin D: you said you already take it.')
  })
})
