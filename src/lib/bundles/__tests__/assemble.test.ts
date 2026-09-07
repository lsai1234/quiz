import { MOCK_CATALOGUE } from '@/lib/catalogue'
import { BIG_NIGHT_BIG_MORNING } from '..'
import { assembleBundle, bundleToDraft, emptyDraft, EMPTY_WORKOUT } from '../assemble'
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
    draft.workouts[0].title = 'Session one'
    draft.workouts[0].exercises = [{ name: 'Squat', prescription: '3x5' }, { name: '', prescription: '' }]
    draft.howToUse = [{ title: 'Take it', detail: 'Daily' }, { title: '', detail: '' }]

    const bundle = assembleBundle(draft, MOCK_CATALOGUE)
    expect(bundle.workouts[0].exercises).toHaveLength(1)
    expect(bundle.howToUse).toHaveLength(1)
  })

  it('keeps several workouts, in order, and drops the ones nobody filled in', () => {
    const draft = emptyDraft()
    draft.slug = 'week'
    draft.name = 'Strength Week'
    draft.cores = [{ productId: 'chrgd-creatine', title: 'Performance', reason: 'Strength.' }]
    draft.workouts = [
      { ...EMPTY_WORKOUT, title: 'Lower body', exercises: [{ name: 'Squat', prescription: '3x5' }] },
      { ...EMPTY_WORKOUT, title: 'Upper body', exercises: [{ name: 'Bench', prescription: '3x5' }] },
      // Started with "Add workout" and never filled in — not a session.
      { ...EMPTY_WORKOUT, exercises: [{ name: '', prescription: '' }] },
    ]

    const bundle = assembleBundle(draft, MOCK_CATALOGUE)
    expect(bundle.workouts.map((w) => w.title)).toEqual(['Lower body', 'Upper body'])
  })

  it('round-trips a bundle that still carries a single legacy workout', () => {
    const legacy = {
      ...assembleBundle({ ...emptyDraft(), slug: 'old', name: 'Old', cores: [{ productId: 'chrgd-creatine', title: 'Performance', reason: 'Strength.' }] }, MOCK_CATALOGUE),
      workouts: [],
      workout: { ...EMPTY_WORKOUT, title: 'The only session', exercises: [{ name: 'Row', prescription: '3x10' }] },
    }

    const draft = bundleToDraft(legacy)
    expect(draft.workouts.map((w) => w.title)).toEqual(['The only session'])
    expect(assembleBundle(draft, MOCK_CATALOGUE).workouts).toHaveLength(1)
  })

  it('keeps the package photo, and drops a blank one rather than storing an empty string', () => {
    const draft = emptyDraft()
    draft.slug = 'p'
    draft.name = 'P'
    draft.cores = [{ productId: 'chrgd-creatine', title: 'Performance', reason: 'Strength.' }]
    expect(assembleBundle(draft, MOCK_CATALOGUE).imageUrl).toBeNull()

    draft.imageUrl = '  https://cdn.example/strength.jpg  '
    expect(assembleBundle(draft, MOCK_CATALOGUE).imageUrl).toBe('https://cdn.example/strength.jpg')
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
