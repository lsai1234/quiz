/**
 * Phase 5 — bundle construction rules.
 *
 * The unit-level rule behaviour, plus an audit-style sweep proving the headline
 * defects are gone: no active-ingredient appears twice, no dose cap is exceeded,
 * and no conf-below-floor filler survives — across representative personas.
 */
import { applyBundleRules, applyBundleRulesReport, BUNDLE_RULES, DOSE_CAPS } from '../bundle-rules'
import { buildStackBlueprint } from '@/lib/stack-blueprint/factory'
import { MOCK_CATALOGUE } from '@/lib/catalogue'
import type { StackSlotEntry } from '@/lib/stack-blueprint/types'
import type { CatalogueProduct } from '@/lib/catalogue/types'
import type { QuizAnswers } from '@/lib/types'

function slot(o: Partial<StackSlotEntry> & { slotId: string; selectedProductId: string }): StackSlotEntry {
  return {
    slotType: 'health', title: 'X', description: '', recommendedProductId: o.selectedProductId,
    selectedVariantId: null, required: false, canRemove: true, canSwap: true, swapGroup: 'general',
    reason: '', confidenceScore: 50, displayOrder: 0, ...o,
  } as StackSlotEntry
}

describe('applyBundleRules (unit)', () => {
  it('drops a non-required slot below the confidence floor', () => {
    const slots = [
      slot({ slotId: 'a', selectedProductId: 'chrgd-omega-3', confidenceScore: 40, displayOrder: 0 }),
      slot({ slotId: 'b', selectedProductId: 'chrgd-collagen', confidenceScore: 3, displayOrder: 1 }),
    ]
    const kept = applyBundleRules(slots, MOCK_CATALOGUE).map((s) => s.slotId)
    expect(kept).toEqual(['a'])
  })

  it('never drops a required slot, even below the floor', () => {
    const slots = [
      slot({ slotId: 'req', selectedProductId: 'chrgd-collagen', confidenceScore: 0, required: true, displayOrder: 0 }),
    ]
    expect(applyBundleRules(slots, MOCK_CATALOGUE).map((s) => s.slotId)).toEqual(['req'])
  })

  it('de-duplicates a shared active ingredient (keeps the first by order)', () => {
    // Magnesium standalone + the sleep blend both carry magnesium.
    const slots = [
      slot({ slotId: 'mag', selectedProductId: 'chrgd-magnesium', displayOrder: 0 }),
      slot({ slotId: 'blend', selectedProductId: 'chrgd-sleep-support', displayOrder: 1 }),
    ]
    expect(applyBundleRules(slots, MOCK_CATALOGUE).map((s) => s.slotId)).toEqual(['mag'])
  })

  it('enforces a total dose cap across the bundle', () => {
    // Two vitamin-C products would total 2000mg > the 1000mg cap → the later
    // drops. Dedup is switched off so this pins the dose-cap rule itself rather
    // than the shared-active rule that would also have dropped it.
    const slots = [
      slot({ slotId: 'vitc', selectedProductId: 'chrgd-vitamin-c-zinc', displayOrder: 0 }),
      slot({ slotId: 'fizz', selectedProductId: 'chrgd-immunity-fizz', displayOrder: 1 }),
    ]
    const noDedup = { ...BUNDLE_RULES, dedupActives: false }
    expect(applyBundleRules(slots, MOCK_CATALOGUE, noDedup).map((s) => s.slotId)).toEqual(['vitc'])
  })

  it('a disabled rule is a rollback (flag off = no-op)', () => {
    const slots = [
      slot({ slotId: 'mag', selectedProductId: 'chrgd-magnesium', displayOrder: 0 }),
      slot({ slotId: 'blend', selectedProductId: 'chrgd-sleep-support', displayOrder: 1 }),
    ]
    const off = { relevanceFloor: false, dedupActives: false, doseCaps: false, confidenceFloor: 10 }
    expect(applyBundleRules(slots, MOCK_CATALOGUE, off).length).toBe(2)
  })
})

// ── Audit-style sweep: the defects are gone across real bundles ──────────────
function A(o: Partial<QuizAnswers> = {}): QuizAnswers {
  return {
    name: 'P', track: 'performance', primaryGoal: null,
    asNeeded: {}, ageBracket: '25-34', exactAge: null, gender: 'male',
    safetyFlags: [], weightBand: null, goals: ['health'], trainingFrequency: '3-4x',
    trainingType: [], lifestyle: [], diet: 'mostly-good', currentSupplements: [],
    currentVitamins: [], tryOurs: [], wellbeingAnswers: {},
    dynamicAnswers: {}, caffeineLevel: 'medium', budget: null, stackPreference: null,
    trainingExperience: 'intermediate', trainingFocus: null, stimPreference: 'yes', trainingTime: null, ...o,
  }
}

const SWEEP: QuizAnswers[] = [
  A({ goals: ['muscle'], trainingFrequency: '5-6x', trainingType: ['strength'], trainingFocus: 'hypertrophy', trainingExperience: 'experienced', caffeineLevel: 'high', trainingTime: 'evening' }),
  A({ goals: ['recovery'], ageBracket: '45+', lifestyle: ['joint-issues'] }),
  A({ track: 'wellbeing', goals: ['sleep-better', 'less-stress'], gender: 'female', ageBracket: '35-44', wellbeingAnswers: { sleepQuality: 'switch-off', stressPattern: 'evening-wired' }, trainingFrequency: null }),
  A({ track: 'wellbeing', goals: ['menopause', 'gut-health'], gender: 'female', ageBracket: '45+' }),
  A({ goals: ['muscle', 'sleep-better'], trainingFrequency: '5-6x', trainingType: ['strength'] }),
]

describe('audit sweep: defects removed', () => {
  it.each(SWEEP.map((a, i) => [i, a] as const))('persona %i has no duplicate active, no overdose, no filler', (_i, a) => {
    const bp = buildStackBlueprint(a, MOCK_CATALOGUE)
    const products = bp.slots.map((s) => MOCK_CATALOGUE.find((p) => p.id === s.selectedProductId)!) as CatalogueProduct[]

    // No active ingredient appears in two products.
    const seen = new Set<string>()
    for (const p of products) for (const act of p.actives ?? []) {
      expect(seen.has(act.name)).toBe(false)
      seen.add(act.name)
    }

    // No dose cap exceeded (with dedup there's one source each, but assert anyway).
    const totals: Record<string, number> = {}
    for (const p of products) for (const act of p.actives ?? []) {
      if (act.mg != null) totals[act.name] = (totals[act.name] ?? 0) + act.mg
    }
    for (const [name, total] of Object.entries(totals)) {
      if (DOSE_CAPS[name] != null) expect(total).toBeLessThanOrEqual(DOSE_CAPS[name])
    }

    // No conf-below-floor filler survived (required slots exempt).
    for (const s of bp.slots) if (!s.required) expect(s.confidenceScore).toBeGreaterThanOrEqual(10)
  })
})

// ── The report: what was dropped, and by which rule ─────────────────────────
describe('applyBundleRulesReport', () => {
  it('names the relevance floor', () => {
    const slots = [
      slot({ slotId: 'a', selectedProductId: 'chrgd-omega-3', confidenceScore: 40, displayOrder: 0 }),
      slot({ slotId: 'b', selectedProductId: 'chrgd-collagen', confidenceScore: 3, displayOrder: 1 }),
    ]
    const r = applyBundleRulesReport(slots, MOCK_CATALOGUE)
    expect(r.kept.map((s) => s.slotId)).toEqual(['a'])
    expect(r.dropped).toEqual([{ slotId: 'b', productId: 'chrgd-collagen', rule: 'relevance-floor' }])
  })

  it('names the shared active for a de-duplication', () => {
    const slots = [
      slot({ slotId: 'mag', selectedProductId: 'chrgd-magnesium', displayOrder: 0 }),
      slot({ slotId: 'blend', selectedProductId: 'chrgd-sleep-support', displayOrder: 1 }),
    ]
    expect(applyBundleRulesReport(slots, MOCK_CATALOGUE).dropped).toEqual([
      { slotId: 'blend', productId: 'chrgd-sleep-support', rule: 'dedup-active', active: 'magnesium' },
    ])
  })

  it('names the active and its cap for a dose cap', () => {
    const slots = [
      slot({ slotId: 'vitc', selectedProductId: 'chrgd-vitamin-c-zinc', displayOrder: 0 }),
      slot({ slotId: 'fizz', selectedProductId: 'chrgd-immunity-fizz', displayOrder: 1 }),
    ]
    const noDedup = { ...BUNDLE_RULES, dedupActives: false }
    expect(applyBundleRulesReport(slots, MOCK_CATALOGUE, noDedup).dropped).toEqual([
      { slotId: 'fizz', productId: 'chrgd-immunity-fizz', rule: 'dose-cap', active: 'vitamin-c', capMg: DOSE_CAPS['vitamin-c'] },
    ])
  })

  it('reports the first rule that fired, and never a required slot', () => {
    const slots = [
      slot({ slotId: 'mag', selectedProductId: 'chrgd-magnesium', displayOrder: 0 }),
      // Below the floor AND a duplicate: the floor is checked first.
      slot({ slotId: 'blend', selectedProductId: 'chrgd-sleep-support', confidenceScore: 2, displayOrder: 1 }),
      // A required duplicate stays.
      slot({ slotId: 'ash', selectedProductId: 'chrgd-ashwagandha', required: true, displayOrder: 2 }),
    ]
    const r = applyBundleRulesReport(slots, MOCK_CATALOGUE)
    expect(r.kept.map((s) => s.slotId)).toEqual(['mag', 'ash'])
    expect(r.dropped).toEqual([{ slotId: 'blend', productId: 'chrgd-sleep-support', rule: 'relevance-floor' }])
  })

  it('the degenerate keep-best case keeps the same slot and does not report it dropped', () => {
    const slots = [
      slot({ slotId: 'a', selectedProductId: 'chrgd-omega-3', confidenceScore: 4, displayOrder: 0 }),
      slot({ slotId: 'b', selectedProductId: 'chrgd-collagen', confidenceScore: 7, displayOrder: 1 }),
    ]
    const r = applyBundleRulesReport(slots, MOCK_CATALOGUE)
    expect(r.kept).toEqual(applyBundleRules(slots, MOCK_CATALOGUE))
    expect(r.kept.map((s) => s.slotId)).toEqual(['b'])
    expect(r.dropped).toEqual([{ slotId: 'a', productId: 'chrgd-omega-3', rule: 'relevance-floor' }])
  })

  it('keeps exactly what applyBundleRules keeps, the same slot objects, across configs', () => {
    const slots = [
      slot({ slotId: 'mag', selectedProductId: 'chrgd-magnesium', displayOrder: 3 }),
      slot({ slotId: 'blend', selectedProductId: 'chrgd-sleep-support', displayOrder: 1 }),
      slot({ slotId: 'ash', selectedProductId: 'chrgd-ashwagandha', displayOrder: 2 }),
      slot({ slotId: 'vitc', selectedProductId: 'chrgd-vitamin-c-zinc', confidenceScore: 9, displayOrder: 0 }),
      slot({ slotId: 'fizz', selectedProductId: 'chrgd-immunity-fizz', displayOrder: 4 }),
      slot({ slotId: 'pre', selectedProductId: 'chrgd-pre-workout', required: true, displayOrder: 5 }),
    ]
    const configs = [
      BUNDLE_RULES,
      { ...BUNDLE_RULES, dedupActives: false },
      { ...BUNDLE_RULES, relevanceFloor: false },
      { ...BUNDLE_RULES, doseCaps: false },
      { relevanceFloor: false, dedupActives: false, doseCaps: false, confidenceFloor: 10 },
    ]
    for (const cfg of configs) {
      const r = applyBundleRulesReport(slots, MOCK_CATALOGUE, cfg)
      const kept = applyBundleRules(slots, MOCK_CATALOGUE, cfg)
      expect(r.kept).toHaveLength(kept.length)
      r.kept.forEach((s, i) => expect(s).toBe(kept[i]))
      // Every slot is either kept or reported, never both.
      expect(r.kept.length + r.dropped.length).toBe(slots.length)
    }
  })
})
