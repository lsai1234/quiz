import { MOCK_CATALOGUE } from '@/lib/catalogue'
import { BIG_NIGHT_BIG_MORNING } from '..'
import { assembleBundle, bundleToDraft, emptyDraft } from '../assemble'
import { isBundleSellable } from '../pricing'
import { bundleReadiness } from '../readiness'

describe('bundle editor assembly', () => {
  it('round-trips an existing bundle through draft and back', () => {
    const draft = bundleToDraft(BIG_NIGHT_BIG_MORNING)
    expect(draft.cores).toHaveLength(3)
    expect(draft.cores[0].productId).toBe('chrgd-electrolytes')
    expect(draft.published).toBe(true)

    const rebuilt = assembleBundle(draft, MOCK_CATALOGUE)
    expect(rebuilt.slug).toBe('big-night-big-morning')
    expect(rebuilt.blueprint.slots.map((s) => s.selectedProductId)).toEqual([
      'chrgd-electrolytes', 'chrgd-creatine', 'chrgd-whey-protein',
    ])
    expect(isBundleSellable(rebuilt, MOCK_CATALOGUE)).toBe(true)
    expect(bundleReadiness(rebuilt, MOCK_CATALOGUE).sellable).toBe(true)
  })

  it('builds a fixed, curated blueprint from chosen products', () => {
    const draft = emptyDraft()
    draft.slug = 'test-bundle'
    draft.name = 'Test Bundle'
    draft.tagline = 'Do the thing.'
    draft.description = 'A test.'
    draft.disclaimer = 'Be sensible.'
    draft.cores = [
      { productId: 'chrgd-whey-protein', title: 'Protein', reason: 'Muscle.' },
      { productId: 'chrgd-creatine', title: 'Performance', reason: 'Strength.' },
    ]

    const bundle = assembleBundle(draft, MOCK_CATALOGUE)
    expect(bundle.blueprint.slots).toHaveLength(2)
    for (const slot of bundle.blueprint.slots) {
      expect(slot.required).toBe(true)
      expect(slot.canSwap).toBe(false)
      expect(slot.canRemove).toBe(false)
    }
    expect(bundle.blueprint.slots[0].swapGroup).toBe('protein-whey')
    // Estimate fields get a live snapshot, and it prices.
    expect(bundle.blueprint.estimatedOneOffPrice).toBeGreaterThan(0)
    expect(isBundleSellable(bundle, MOCK_CATALOGUE)).toBe(true)
  })

  it('drops empty workout exercises and how-to steps on assembly', () => {
    const draft = emptyDraft()
    draft.slug = 'x'
    draft.name = 'X'
    draft.cores = [{ productId: 'chrgd-creatine', title: 'Performance', reason: 'Strength.' }]
    draft.workout.exercises = [{ name: 'Squat', prescription: '3x5' }, { name: '', prescription: '' }]
    draft.howToUse = [{ title: 'Take it', detail: 'Daily' }, { title: '', detail: '' }]

    const bundle = assembleBundle(draft, MOCK_CATALOGUE)
    expect(bundle.workout.exercises).toHaveLength(1)
    expect(bundle.howToUse).toHaveLength(1)
  })

  it('auto-fills meta from name/description when blank', () => {
    const draft = emptyDraft()
    draft.slug = 'y'
    draft.name = 'Y Bundle'
    draft.description = 'A description that becomes the meta.'
    draft.cores = [{ productId: 'chrgd-creatine', title: 'Performance', reason: 'Strength.' }]
    const bundle = assembleBundle(draft, MOCK_CATALOGUE)
    expect(bundle.metaTitle).toBe('Y Bundle | CHRGD')
    expect(bundle.metaDescription).toContain('A description')
  })
})
