import { MOCK_CATALOGUE } from '@/lib/catalogue'
import { BIG_NIGHT_BIG_MORNING } from '..'
import { composeBundles, mergeBundleOverride, bundleSlug, EMPTY_PERSISTED_BUNDLES, type PersistedBundles } from '../resolve'
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
import type { PrebuiltBundle } from '../types'

const seed = BIG_NIGHT_BIG_MORNING

function draft(slug: string, name = slug): PrebuiltBundle {
  return { ...seed, slug, name, blueprint: { ...seed.blueprint, id: `bundle-${slug}`, stackName: name } }
}

describe('bundle resolution (pure)', () => {
  it('merges a per-slug override onto a seed', () => {
    const merged = mergeBundleOverride(seed, { tagline: 'New tagline' })
    expect(merged.tagline).toBe('New tagline')
    expect(merged.name).toBe(seed.name)
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
    const withRemoved = composeBundles([seed], persisted, { includeRemoved: true })
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
    const price = bundlePriceSummary(seed, MOCK_CATALOGUE)
    expect(price.price).toBeGreaterThan(0)
    expect(price.sumOfParts).toBeGreaterThanOrEqual(price.price)
    expect(price.saving).toBeGreaterThan(0)
    expect(price.savingPct).toBeGreaterThan(0)
  })

  it('flags a bundle with a missing product as unsellable', () => {
    const trimmed = MOCK_CATALOGUE.filter((p) => p.id !== 'chrgd-creatine')
    expect(missingCoreProducts(seed, trimmed)).toContain('chrgd-creatine')
    expect(isBundleSellable(seed, trimmed)).toBe(false)
    expect(isBundleSellable(seed, MOCK_CATALOGUE)).toBe(true)
  })

  it('reports readiness — green for a complete seed', () => {
    const r = bundleReadiness(seed, MOCK_CATALOGUE)
    expect(r.sellable).toBe(true)
    expect(r.overall).toBe('ok')
  })

  it('readiness fails when a product is unavailable', () => {
    const trimmed = MOCK_CATALOGUE.filter((p) => p.id !== 'chrgd-electrolytes')
    const r = bundleReadiness(seed, trimmed)
    expect(r.sellable).toBe(false)
    expect(r.overall).toBe('fail')
  })
})

describe('bundle store (database-backed)', () => {
  beforeEach(async () => { await resetBundlesStore() })
  afterAll(async () => { await resetBundlesStore() })

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
    await setBundlePublished('big-night-big-morning', false)
    expect((await getShopBundles()).find((b) => b.bundle.slug === 'big-night-big-morning')).toBeUndefined()
    await setBundlePublished('big-night-big-morning', true)
    expect((await getShopBundles()).find((b) => b.bundle.slug === 'big-night-big-morning')).toBeDefined()
  })

  it('reorders bundles', async () => {
    await createBundle(draft('a-bundle', 'A'))
    await createBundle(draft('z-bundle', 'Z'))
    await reorderBundles(['z-bundle', 'big-night-big-morning', 'a-bundle'])
    const order = (await getResolvedBundles()).map((b) => b.slug)
    expect(order.indexOf('z-bundle')).toBeLessThan(order.indexOf('a-bundle'))
  })

  it('duplicates a bundle as an unpublished draft', async () => {
    await duplicateBundle('big-night-big-morning', 'bnbm-copy', 'BNBM Copy')
    const copy = await getResolvedBundle('bnbm-copy')
    expect(copy?.name).toBe('BNBM Copy')
    expect(copy?.published).toBe(false)
    expect(copy?.custom).toBe(true)
    expect(copy?.blueprint.stackName).toBe('BNBM Copy')
  })

  it('shop feed prices bundles and portal feed adds readiness', async () => {
    const shop = await getShopBundles()
    const bnbm = shop.find((b) => b.bundle.slug === 'big-night-big-morning')
    expect(bnbm?.price.price).toBeGreaterThan(0)

    const portal = await getPortalBundles()
    const pb = portal.bundles.find((b) => b.bundle.slug === 'big-night-big-morning')
    expect(pb?.readiness.overall).toBeDefined()
  })
})
