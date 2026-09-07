import { MOCK_CATALOGUE } from '@/lib/catalogue'
import { BIG_NIGHT_BIG_MORNING } from '..'
import {
  assembleBundle,
  assembleProductBundle,
  bundleToDraft,
  emptyDraft,
  emptyProductBundleDraft,
  productBundleToDraft,
  EMPTY_WORKOUT,
} from '../assemble'
import { composeBundles, EMPTY_PERSISTED_BUNDLES } from '../resolve'
import { isBundleSellable } from '../pricing'
import { bundleReadiness } from '../readiness'
import type { ProductBundle } from '../types'

/** The Strength stack, built the way the Hub builds one. */
function strengthStack(): ProductBundle {
  const draft = emptyProductBundleDraft()
  draft.slug = 'strength'
  draft.name = 'Strength'
  draft.description = 'Protein, creatine and electrolytes.'
  draft.primaryGoal = 'muscle'
  draft.cores = [
    { productId: 'chrgd-whey-protein', title: 'Protein', reason: 'Muscle.' },
    { productId: 'chrgd-creatine', title: 'Performance', reason: 'Strength.' },
  ]
  return assembleProductBundle(draft, MOCK_CATALOGUE)
}

/** Resolve a workout bundle the way every read path does. */
function resolve(bundle: ReturnType<typeof assembleBundle>, stacks: ProductBundle[]) {
  return composeBundles([], { ...EMPTY_PERSISTED_BUNDLES, created: [bundle] }, stacks)[0]
}

describe('assembling a pre-built bundle', () => {
  it('builds a fixed, curated stack from the chosen products', () => {
    const stack = strengthStack()

    expect(stack.blueprint.slots).toHaveLength(2)
    for (const slot of stack.blueprint.slots) {
      expect(slot.required).toBe(true)
      expect(slot.canSwap).toBe(false)
      expect(slot.canRemove).toBe(false)
    }
    expect(stack.blueprint.slots[0].swapGroup).toBe('protein-whey')
    // Estimate fields get a live snapshot, and it prices.
    expect(stack.blueprint.estimatedOneOffPrice).toBeGreaterThan(0)
  })

  it('round-trips through a draft without losing the reasons', () => {
    const draft = productBundleToDraft(strengthStack())
    expect(draft.cores.map((c) => c.productId)).toEqual(['chrgd-whey-protein', 'chrgd-creatine'])
    expect(draft.cores[0].reason).toBe('Muscle.')
    expect(assembleProductBundle(draft, MOCK_CATALOGUE).blueprint.slots).toHaveLength(2)
  })
})

describe('assembling a workout bundle', () => {
  it('stores a pointer to the stack, never a copy of it', () => {
    const draft = emptyDraft()
    draft.slug = 'leg-day'
    draft.name = 'Leg Day'
    draft.productBundleSlug = 'strength'

    const bundle = assembleBundle(draft)
    // The record itself has no products in it at all — that is what stops a
    // package carrying a stale copy of a stack somebody has since edited.
    expect(bundle).not.toHaveProperty('blueprint')
    expect(bundle.productBundleSlug).toBe('strength')

    const resolved = resolve(bundle, [strengthStack()])
    expect(resolved.blueprint.slots.map((s) => s.selectedProductId)).toEqual([
      'chrgd-whey-protein', 'chrgd-creatine',
    ])
    // The stack wears the package's name, because that is what a receipt says.
    expect(resolved.blueprint.stackName).toBe('Leg Day')
    expect(isBundleSellable(resolved, MOCK_CATALOGUE)).toBe(true)
  })

  it('is not sellable until it points at a stack', () => {
    const bundle = assembleBundle({ ...emptyDraft(), slug: 'x', name: 'X' })
    const resolved = resolve(bundle, [])

    expect(resolved.blueprint.slots).toEqual([])
    expect(isBundleSellable(resolved, MOCK_CATALOGUE)).toBe(false)
    const readiness = bundleReadiness(resolved, MOCK_CATALOGUE)
    expect(readiness.sellable).toBe(false)
    expect(readiness.checks.find((c) => c.id === 'stack')?.status).toBe('fail')
  })

  it('says a stack that has since been deleted is missing, rather than pretending it is there', () => {
    const bundle = assembleBundle({ ...emptyDraft(), slug: 'x', name: 'X', productBundleSlug: 'gone' })
    const resolved = resolve(bundle, [strengthStack()])

    expect(resolved.productBundle).toBeNull()
    expect(bundleReadiness(resolved, MOCK_CATALOGUE).checks.find((c) => c.id === 'stack')?.detail)
      .toContain('gone')
  })

  it('lets one stack serve several packages', () => {
    const stack = strengthStack()
    const monday = assembleBundle({ ...emptyDraft(), slug: 'monday', name: 'Monday', productBundleSlug: 'strength' })
    const friday = assembleBundle({ ...emptyDraft(), slug: 'friday', name: 'Friday', productBundleSlug: 'strength' })

    const resolved = composeBundles([], { ...EMPTY_PERSISTED_BUNDLES, created: [monday, friday] }, [stack])
    expect(resolved).toHaveLength(2)
    for (const bundle of resolved) {
      expect(bundle.blueprint.slots).toHaveLength(2)
      expect(isBundleSellable(bundle, MOCK_CATALOGUE)).toBe(true)
    }
  })

  it('round-trips an existing bundle through draft and back', () => {
    const draft = bundleToDraft(BIG_NIGHT_BIG_MORNING)
    expect(draft.published).toBe(true)
    // The seeds arrive unlinked: their products were removed when stacks became
    // their own record, and a founder points each one at a stack in the Hub.
    expect(draft.productBundleSlug).toBe('')

    const rebuilt = assembleBundle(draft)
    expect(rebuilt.slug).toBe('big-night-big-morning')
    expect(rebuilt.workouts[0].title).toBe(BIG_NIGHT_BIG_MORNING.workouts[0].title)
  })

  it('drops empty workout exercises and how-to steps on assembly', () => {
    const draft = emptyDraft()
    draft.slug = 'x'
    draft.name = 'X'
    draft.workouts[0].title = 'Session one'
    draft.workouts[0].exercises = [{ name: 'Squat', prescription: '3x5' }, { name: '', prescription: '' }]
    draft.howToUse = [{ title: 'Take it', detail: 'Daily' }, { title: '', detail: '' }]

    const bundle = assembleBundle(draft)
    expect(bundle.workouts[0].exercises).toHaveLength(1)
    expect(bundle.howToUse).toHaveLength(1)
  })

  it('keeps several workouts, in order, and drops the ones nobody filled in', () => {
    const draft = emptyDraft()
    draft.slug = 'week'
    draft.name = 'Strength Week'
    draft.workouts = [
      { ...EMPTY_WORKOUT, title: 'Lower body', exercises: [{ name: 'Squat', prescription: '3x5' }] },
      { ...EMPTY_WORKOUT, title: 'Upper body', exercises: [{ name: 'Bench', prescription: '3x5' }] },
      // Started with "Add workout" and never filled in — not a session.
      { ...EMPTY_WORKOUT, exercises: [{ name: '', prescription: '' }] },
    ]

    expect(assembleBundle(draft).workouts.map((w) => w.title)).toEqual(['Lower body', 'Upper body'])
  })

  it('round-trips a bundle that still carries a single legacy workout', () => {
    const legacy = {
      ...assembleBundle({ ...emptyDraft(), slug: 'old', name: 'Old' }),
      workouts: [],
      workout: { ...EMPTY_WORKOUT, title: 'The only session', exercises: [{ name: 'Row', prescription: '3x10' }] },
    }

    const draft = bundleToDraft(legacy)
    expect(draft.workouts.map((w) => w.title)).toEqual(['The only session'])
    expect(assembleBundle(draft).workouts).toHaveLength(1)
  })

  it('keeps the package photo, and drops a blank one rather than storing an empty string', () => {
    const draft = emptyDraft()
    draft.slug = 'p'
    draft.name = 'P'
    expect(assembleBundle(draft).imageUrl).toBeNull()

    draft.imageUrl = '  https://cdn.example/strength.jpg  '
    expect(assembleBundle(draft).imageUrl).toBe('https://cdn.example/strength.jpg')
  })

  it('auto-fills meta from name/description when blank', () => {
    const draft = emptyDraft()
    draft.slug = 'y'
    draft.name = 'Y Bundle'
    draft.description = 'A description that becomes the meta.'
    const bundle = assembleBundle(draft)
    expect(bundle.metaTitle).toBe('Y Bundle | CHRGD')
    expect(bundle.metaDescription).toContain('A description')
  })
})
