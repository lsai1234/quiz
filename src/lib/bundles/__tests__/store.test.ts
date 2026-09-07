import { MOCK_CATALOGUE } from '@/lib/catalogue'
import { BIG_NIGHT_BIG_MORNING } from '..'
import { composeBundles, mergeBundleOverride, bundleWorkouts, bundleSlug, EMPTY_PERSISTED_BUNDLES, type PersistedBundles } from '../resolve'
import { bundlePriceSummary, missingCoreProducts, isBundleSellable } from '../pricing'
import { bundleReadiness } from '../readiness'
import {
  getResolvedBundles,
  getResolvedBundle,
  getShopBundles,
  getPortalBundles,
  createBundle,
  editBundle,
  setBundlePublished,
  reorderBundles,
  removeBundle,
  restoreBundle,
  deleteBundle,
  duplicateBundle,
  resetBundlesStore,
} from '../store'
import {
  getProductBundles,
  createProductBundle,
  editProductBundle,
  deleteProductBundle,
  resetProductBundlesStore,
} from '../store'
import { assembleProductBundle, emptyProductBundleDraft } from '../assemble'
import type { ProductBundle, WorkoutBundle } from '../types'

const seed = BIG_NIGHT_BIG_MORNING

function draft(slug: string, name = slug): WorkoutBundle {
  return { ...seed, slug, name }
}

/** A stack to sell — what the Hub's pre-built bundle editor produces. */
function stack(slug = 'strength', name = 'Strength'): ProductBundle {
  return assembleProductBundle(
    {
      ...emptyProductBundleDraft(),
      slug,
      name,
      description: 'Three products.',
      primaryGoal: 'recovery',
      cores: [
        { productId: 'chrgd-electrolytes', title: 'Hydration', reason: 'Replace what you sweat.' },
        { productId: 'chrgd-creatine', title: 'Performance', reason: 'The daily base.' },
        { productId: 'chrgd-whey-protein', title: 'Protein', reason: 'Refuel.' },
      ],
    },
    MOCK_CATALOGUE,
  )
}

const STACK = stack()
/** A seed pointed at a stack — the only form a customer meets. */
const sold = (bundle: WorkoutBundle = seed) =>
  composeBundles([{ ...bundle, productBundleSlug: STACK.slug }], EMPTY_PERSISTED_BUNDLES, [STACK])[0]
/** A workout bundle that is linked, for the store tests. */
const linked = (slug: string, name = slug): WorkoutBundle => ({ ...draft(slug, name), productBundleSlug: STACK.slug })

describe('bundle resolution (pure)', () => {
  it('merges a per-slug override onto a seed', () => {
    const merged = mergeBundleOverride(seed, { tagline: 'New tagline' })
    expect(merged.tagline).toBe('New tagline')
    expect(merged.name).toBe(seed.name)
  })

  /*
    A package can carry a week of sessions now, and every bundle saved before
    that change carries exactly one `workout` — those records live in the
    database rather than in this repository, so both shapes are real and will be
    for as long as those rows exist.
  */
  it('reads a bundle saved with a single legacy workout as a list of one', () => {
    const legacy = { ...seed, workouts: [], workout: seed.workouts[0] } as WorkoutBundle
    expect(bundleWorkouts(legacy)).toEqual([seed.workouts[0]])
    expect(composeBundles([legacy], EMPTY_PERSISTED_BUNDLES)[0].workouts).toHaveLength(1)
  })

  it('lets an override written by the old editor replace the workouts, not lose to them', () => {
    // Merged naively the base's list survives the spread and the founder's edit
    // vanishes — the one failure mode of keeping two shapes around.
    const edited = { ...seed.workouts[0], title: 'Edited session' }
    const merged = mergeBundleOverride(seed, { workout: edited })
    expect(merged.workouts.map((w) => w.title)).toEqual(['Edited session'])
  })

  it('keeps several workouts through a compose', () => {
    const week = { ...seed, workouts: [seed.workouts[0], { ...seed.workouts[0], title: 'Day two' }] }
    expect(composeBundles([week], EMPTY_PERSISTED_BUNDLES)[0].workouts).toHaveLength(2)
  })

  it('composes seeds + created and sorts by displayOrder', () => {
    const persisted: PersistedBundles = {
      created: [draft('alpha'), draft('beta')],
      overrides: { alpha: { displayOrder: 0 }, 'big-night-big-morning': { displayOrder: 5 }, beta: { displayOrder: 2 } },
      removedSlugs: [],
    }
    const list = composeBundles([seed], persisted)
    expect(list.map((b) => b.slug)).toEqual(['alpha', 'beta', 'big-night-big-morning'])
    expect(list.find((b) => b.slug === 'alpha')!.custom).toBe(true)
    expect(list.find((b) => b.slug === 'big-night-big-morning')!.custom).toBe(false)
  })

  it('drops removed bundles unless includeRemoved', () => {
    const persisted: PersistedBundles = { ...EMPTY_PERSISTED_BUNDLES, removedSlugs: ['big-night-big-morning'] }
    expect(composeBundles([seed], persisted)).toHaveLength(0)
    const withRemoved = composeBundles([seed], persisted, [], { includeRemoved: true })
    expect(withRemoved).toHaveLength(1)
    expect(withRemoved[0].removed).toBe(true)
  })

  it('treats published:false as a draft', () => {
    const persisted: PersistedBundles = { ...EMPTY_PERSISTED_BUNDLES, overrides: { 'big-night-big-morning': { published: false } } }
    expect(composeBundles([seed], persisted)[0].published).toBe(false)
  })

  it('slugifies names', () => {
    expect(bundleSlug('Leg Day Loading!')).toBe('leg-day-loading')
  })
})

describe('bundle pricing + readiness (pure)', () => {
  it('prices a bundle live with a sum-of-parts saving', () => {
    const price = bundlePriceSummary(sold(), MOCK_CATALOGUE)
    expect(price.price).toBeGreaterThan(0)
    expect(price.sumOfParts).toBeGreaterThanOrEqual(price.price)
    expect(price.saving).toBeGreaterThan(0)
    expect(price.savingPct).toBeGreaterThan(0)
  })

  it('flags a bundle with a missing product as unsellable', () => {
    const trimmed = MOCK_CATALOGUE.filter((p) => p.id !== 'chrgd-creatine')
    expect(missingCoreProducts(sold(), trimmed)).toContain('chrgd-creatine')
    expect(isBundleSellable(sold(), trimmed)).toBe(false)
    expect(isBundleSellable(sold(), MOCK_CATALOGUE)).toBe(true)
  })

  it('reports readiness — green for a complete seed', () => {
    const r = bundleReadiness(sold(), MOCK_CATALOGUE)
    expect(r.sellable).toBe(true)
    expect(r.overall).toBe('ok')
  })

  it('readiness fails when a product is unavailable', () => {
    const trimmed = MOCK_CATALOGUE.filter((p) => p.id !== 'chrgd-electrolytes')
    const r = bundleReadiness(sold(), trimmed)
    expect(r.sellable).toBe(false)
    expect(r.overall).toBe('fail')
  })
})

describe('bundle store (database-backed)', () => {
  beforeEach(async () => {
    await resetBundlesStore()
    await resetProductBundlesStore()
    await createProductBundle(STACK)
  })
  afterAll(async () => {
    await resetBundlesStore()
    await resetProductBundlesStore()
  })

  it('starts from the shipped seeds', async () => {
    const all = await getResolvedBundles()
    expect(all.map((b) => b.slug)).toContain('big-night-big-morning')
  })

  it('creates, edits and removes a founder bundle', async () => {
    await createBundle(draft('leg-day', 'Leg Day'))
    expect((await getResolvedBundle('leg-day'))?.name).toBe('Leg Day')

    await editBundle('leg-day', { tagline: 'Push. Pull. Grind.' })
    expect((await getResolvedBundle('leg-day'))?.tagline).toBe('Push. Pull. Grind.')

    await removeBundle('leg-day')
    expect(await getResolvedBundle('leg-day')).toBeDefined() // soft — still resolvable
    expect((await getResolvedBundles()).find((b) => b.slug === 'leg-day')).toBeUndefined()

    await restoreBundle('leg-day')
    expect((await getResolvedBundles()).find((b) => b.slug === 'leg-day')).toBeDefined()

    await deleteBundle('leg-day')
    expect(await getResolvedBundle('leg-day')).toBeUndefined()
  })

  it('rejects a duplicate slug', async () => {
    await createBundle(draft('dupe'))
    await expect(createBundle(draft('dupe'))).rejects.toThrow(/already exists/)
  })

  it('will not delete a seed bundle', async () => {
    await expect(deleteBundle('big-night-big-morning')).rejects.toThrow(/can only be removed/)
  })

  it('edits a seed via overrides without mutating the seed', async () => {
    await editBundle('big-night-big-morning', { tagline: 'Edited' })
    expect((await getResolvedBundle('big-night-big-morning'))?.tagline).toBe('Edited')
    expect(BIG_NIGHT_BIG_MORNING.tagline).toBe('Hydrate. Move. Refuel. Reset.')
  })

  it('publishes/unpublishes and hides drafts from the shop feed', async () => {
    // Pointed at a stack first: a package with no products is not sellable, so
    // publishing alone cannot put it on the shelf.
    await editBundle('big-night-big-morning', { productBundleSlug: STACK.slug })
    await setBundlePublished('big-night-big-morning', false)
    expect((await getShopBundles()).find((b) => b.bundle.slug === 'big-night-big-morning')).toBeUndefined()
    await setBundlePublished('big-night-big-morning', true)
    expect((await getShopBundles()).find((b) => b.bundle.slug === 'big-night-big-morning')).toBeDefined()
  })

  it('keeps an unlinked bundle off the shop shelf however published it is', async () => {
    await setBundlePublished('big-night-big-morning', true)
    expect((await getShopBundles()).find((b) => b.bundle.slug === 'big-night-big-morning')).toBeUndefined()
  })

  it('reorders bundles', async () => {
    await createBundle(draft('a-bundle', 'A'))
    await createBundle(draft('z-bundle', 'Z'))
    await reorderBundles(['z-bundle', 'big-night-big-morning', 'a-bundle'])
    const order = (await getResolvedBundles()).map((b) => b.slug)
    expect(order.indexOf('z-bundle')).toBeLessThan(order.indexOf('a-bundle'))
  })

  it('duplicates a bundle as an unpublished draft that sells the same stack', async () => {
    await editBundle('big-night-big-morning', { productBundleSlug: STACK.slug })
    await duplicateBundle('big-night-big-morning', 'bnbm-copy', 'BNBM Copy')
    const copy = await getResolvedBundle('bnbm-copy')
    expect(copy?.name).toBe('BNBM Copy')
    expect(copy?.published).toBe(false)
    expect(copy?.custom).toBe(true)
    // Pointed at the same stack, and wearing its own name on the receipt.
    expect(copy?.productBundleSlug).toBe(STACK.slug)
    expect(copy?.blueprint.stackName).toBe('BNBM Copy')
  })

  it('shop feed prices bundles and portal feed adds readiness', async () => {
    await editBundle('big-night-big-morning', { productBundleSlug: STACK.slug })
    const shop = await getShopBundles()
    const bnbm = shop.find((b) => b.bundle.slug === 'big-night-big-morning')
    expect(bnbm?.price.price).toBeGreaterThan(0)

    const portal = await getPortalBundles()
    const pb = portal.bundles.find((b) => b.bundle.slug === 'big-night-big-morning')
    expect(pb?.readiness.overall).toBeDefined()
  })
})

describe('pre-built bundles (the stacks)', () => {
  beforeEach(async () => {
    await resetBundlesStore()
    await resetProductBundlesStore()
  })
  afterAll(async () => {
    await resetBundlesStore()
    await resetProductBundlesStore()
  })

  it('creates, lists and edits a stack', async () => {
    await createProductBundle(stack('strength', 'Strength'))
    expect((await getProductBundles()).map((b) => b.name)).toEqual(['Strength'])

    await editProductBundle('strength', { name: 'Strength & Size' })
    expect((await getProductBundles())[0].name).toBe('Strength & Size')
  })

  it('rejects a duplicate reference', async () => {
    await createProductBundle(stack())
    await expect(createProductBundle(stack())).rejects.toThrow(/already exists/)
  })

  it('one stack serves every package pointed at it', async () => {
    await createProductBundle(stack())
    await createBundle(linked('monday', 'Monday'))
    await createBundle(linked('friday', 'Friday'))

    const shop = await getShopBundles()
    expect(shop.map((b) => b.bundle.slug).sort()).toEqual(['friday', 'monday'])
    for (const entry of shop) expect(entry.bundle.blueprint.slots).toHaveLength(3)
  })

  it('a product swapped in the stack changes every package selling it', async () => {
    await createProductBundle(stack())
    await createBundle(linked('monday', 'Monday'))

    const swapped = assembleProductBundle(
      {
        ...emptyProductBundleDraft(),
        slug: 'strength',
        name: 'Strength',
        primaryGoal: 'recovery',
        cores: [{ productId: 'chrgd-creatine', title: 'Performance', reason: 'The daily base.' }],
      },
      MOCK_CATALOGUE,
    )
    await editProductBundle('strength', swapped)

    const monday = await getResolvedBundle('monday')
    expect(monday?.blueprint.slots.map((s) => s.selectedProductId)).toEqual(['chrgd-creatine'])
  })

  it('refuses to delete a stack a package is still selling, and names it', async () => {
    await createProductBundle(stack())
    await createBundle(linked('monday', 'Monday'))

    await expect(deleteProductBundle('strength')).rejects.toThrow(/Monday/)

    await editBundle('monday', { productBundleSlug: null })
    await deleteProductBundle('strength')
    expect(await getProductBundles()).toEqual([])
  })
})
