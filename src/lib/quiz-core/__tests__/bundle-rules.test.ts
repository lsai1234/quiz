/**
 * Phase 5 — bundle construction rules.
 *
 * The unit-level rule behaviour, plus an audit-style sweep proving the headline
 * defects are gone: no active-ingredient appears twice, no dose cap is exceeded,
 * and no conf-below-floor filler survives — across representative personas.
 */
import { applyBundleRules, BUNDLE_RULES, DOSE_CAPS } from '../bundle-rules'
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
