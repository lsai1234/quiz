/**
 * Bundle store — database-backed, serverless-safe. Mirrors the portal product
 * store: shipped SEED_BUNDLES are the baseline; founders can edit them (per-slug
 * overrides), author new bundles, reorder, publish/unpublish and soft-remove
 * them. All founder state persists in the app database via the portal persist
 * seam, so every serverless instance sees the latest edits.
 *
 * Prices are never persisted — resolved bundles are priced live from the
 * catalogue by the read path (`getShopBundles`).
 *
 * Server-only. Reads degrade to the shipped seeds if the database is
 * unreachable rather than crashing.
 */
import type { DataSource } from '@/lib/data-source'
import type { CatalogueProduct } from '@/lib/catalogue/types'
import { getResolvedCatalogue } from '@/lib/catalogue/resolve'
import { readJson, writeJson } from '@/lib/portal/persist'
import { SEED_BUNDLES } from './seeds'
import type { ProductBundle, WorkoutBundle } from './types'
import {
  composeBundles,
  EMPTY_PERSISTED_BUNDLES,
  type PersistedBundles,
  type ResolvedBundle,
} from './resolve'
import { bundlePriceSummary, isBundleSellable, type BundlePriceSummary } from './pricing'
import { bundleReadiness, type BundleReadiness } from './readiness'

const BUNDLES_FILE = 'bundles'
/*
  Pre-built bundles are stored apart from the packages that sell them, and ship
  with no seeds at all.

  Which products belong together is a decision that moves with the range — a
  product goes out of stock, a better one arrives — and a decision that moves
  does not belong in a deploy. There are two of them and they are authored in
  the Hub.
*/
const PRODUCT_BUNDLES_FILE = 'product-bundles'

async function loadBundles(): Promise<PersistedBundles> {
  const stored = await readJson<PersistedBundles>(BUNDLES_FILE, EMPTY_PERSISTED_BUNDLES)
  return {
    created: stored.created ?? [],
    overrides: stored.overrides ?? {},
    removedSlugs: stored.removedSlugs ?? [],
  }
}

async function saveBundles(state: PersistedBundles): Promise<void> {
  await writeJson(BUNDLES_FILE, state)
}

async function loadProductBundles(): Promise<ProductBundle[]> {
  const stored = await readJson<{ bundles: ProductBundle[] }>(PRODUCT_BUNDLES_FILE, { bundles: [] })
  return stored.bundles ?? []
}

async function saveProductBundles(bundles: ProductBundle[]): Promise<void> {
  await writeJson(PRODUCT_BUNDLES_FILE, { bundles })
}

// ── Pre-built bundles (the product stacks) ────────────────────────────────────

/** Every pre-built bundle, in the founder's order. */
export async function getProductBundles(): Promise<ProductBundle[]> {
  const bundles = await loadProductBundles()
  return [...bundles].sort(
    (a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0) || a.name.localeCompare(b.name),
  )
}

export async function getProductBundle(slug: string): Promise<ProductBundle | undefined> {
  return (await loadProductBundles()).find((b) => b.slug === slug)
}

/** Create a pre-built bundle. Throws if the slug is taken. */
export async function createProductBundle(bundle: ProductBundle): Promise<void> {
  const bundles = await loadProductBundles()
  if (bundles.some((b) => b.slug === bundle.slug)) {
    throw new Error(`A pre-built bundle with slug "${bundle.slug}" already exists`)
  }
  bundles.push({ ...bundle, displayOrder: bundle.displayOrder ?? bundles.length })
  await saveProductBundles(bundles)
}

/** Edit a pre-built bundle in place. `slug` itself cannot be changed here. */
export async function editProductBundle(slug: string, patch: Partial<ProductBundle>): Promise<void> {
  const bundles = await loadProductBundles()
  const idx = bundles.findIndex((b) => b.slug === slug)
  if (idx === -1) throw new Error(`Pre-built bundle "${slug}" not found`)
  const { slug: _ignore, ...rest } = patch
  bundles[idx] = { ...bundles[idx], ...rest }
  await saveProductBundles(bundles)
}

/**
 * Delete a pre-built bundle.
 *
 * Refused while a session stack still points at it. Deleting it anyway would
 * empty every package built on it at once, and the packages are the things
 * customers can see — so the founder is told which ones to re-point first
 * rather than finding out from the shop.
 */
export async function deleteProductBundle(slug: string): Promise<void> {
  const inUse = (await getResolvedBundles({ includeRemoved: true })).filter(
    (b) => b.productBundleSlug === slug,
  )
  if (inUse.length > 0) {
    throw new Error(
      `${inUse.map((b) => b.name).join(', ')} ${inUse.length === 1 ? 'is' : 'are'} still selling this stack. ` +
        'Point them at another one first.',
    )
  }
  const bundles = await loadProductBundles()
  await saveProductBundles(bundles.filter((b) => b.slug !== slug))
}

/** Clear all pre-built bundles (test helper). */
export async function resetProductBundlesStore(): Promise<void> {
  await saveProductBundles([])
}

// ── Session stacks (the packages) ────────────────────────────────────────────

/** True when a slug belongs to a shipped seed (edited via overrides, never deleted). */
function isSeedSlug(slug: string): boolean {
  return SEED_BUNDLES.some((s) => s.slug === slug)
}

// ── Resolution (seeds + persisted state) ──────────────────────────────────────

/** Every bundle in effective form. `includeRemoved` surfaces soft-removed ones. */
export async function getResolvedBundles(opts: { includeRemoved?: boolean } = {}): Promise<ResolvedBundle[]> {
  const [persisted, productBundles] = await Promise.all([loadBundles(), loadProductBundles()])
  return composeBundles(SEED_BUNDLES, persisted, productBundles, opts)
}

/** A single resolved bundle by slug (including unpublished/removed). */
export async function getResolvedBundle(slug: string): Promise<ResolvedBundle | undefined> {
  const all = await getResolvedBundles({ includeRemoved: true })
  return all.find((b) => b.slug === slug)
}

/**
 * The public, published bundle for a slug — what the landing page serves.
 * Returns undefined when the bundle is missing, unpublished, removed, or has a
 * core product that no longer resolves (so a broken bundle 404s rather than
 * showing an unbuyable page).
 */
export async function getPublicBundle(
  slug: string,
): Promise<{ bundle: ResolvedBundle; products: CatalogueProduct[] } | undefined> {
  const bundle = await getResolvedBundle(slug)
  if (!bundle || !bundle.published || bundle.removed) return undefined
  const { products } = await getResolvedCatalogue()
  if (!isBundleSellable(bundle, products)) return undefined
  return { bundle, products }
}

export interface ShopBundle {
  bundle: ResolvedBundle
  price: BundlePriceSummary
}

/**
 * The published, sellable bundles for the shop row, priced live and ordered.
 * Bundles with a missing core product are auto-hidden.
 */
export async function getShopBundles(): Promise<ShopBundle[]> {
  const [all, { products }] = await Promise.all([getResolvedBundles(), getResolvedCatalogue()])
  return all
    .filter((b) => b.published && isBundleSellable(b, products))
    .map((bundle) => ({ bundle, price: bundlePriceSummary(bundle, products) }))
}

export interface PortalBundle {
  bundle: ResolvedBundle
  price: BundlePriceSummary
  readiness: BundleReadiness
}

/** Every bundle (including removed/unpublished) with pricing + readiness, for the portal. */
export async function getPortalBundles(): Promise<{ bundles: PortalBundle[]; source: DataSource }> {
  const [all, { products, source }] = await Promise.all([
    getResolvedBundles({ includeRemoved: true }),
    getResolvedCatalogue(),
  ])
  return {
    source,
    bundles: all.map((bundle) => ({
      bundle,
      price: bundlePriceSummary(bundle, products),
      readiness: bundleReadiness(bundle, products),
    })),
  }
}

// ── Mutations ─────────────────────────────────────────────────────────────────

/** Create a founder-authored bundle. Throws if the slug already exists. */
export async function createBundle(bundle: WorkoutBundle): Promise<void> {
  const state = await loadBundles()
  const exists = isSeedSlug(bundle.slug) || state.created.some((b) => b.slug === bundle.slug)
  if (exists) throw new Error(`A bundle with slug "${bundle.slug}" already exists`)
  state.created.push({ ...bundle, custom: true })
  await saveBundles(state)
}

/**
 * Edit a bundle by slug. Seed bundles record a per-slug override; founder
 * bundles are updated in place. `slug` itself cannot be changed here.
 */
export async function editBundle(slug: string, patch: Partial<WorkoutBundle>): Promise<void> {
  const state = await loadBundles()
  const { slug: _ignore, ...rest } = patch
  if (isSeedSlug(slug)) {
    state.overrides[slug] = { ...state.overrides[slug], ...rest }
  } else {
    const idx = state.created.findIndex((b) => b.slug === slug)
    if (idx === -1) throw new Error(`Bundle "${slug}" not found`)
    state.created[idx] = { ...state.created[idx], ...rest }
  }
  await saveBundles(state)
}

/** Publish or unpublish a bundle. */
export async function setBundlePublished(slug: string, published: boolean): Promise<void> {
  await editBundle(slug, { published })
}

/** Set the display order (shop-row position) for a set of slugs, in the given order. */
export async function reorderBundles(slugsInOrder: string[]): Promise<void> {
  const state = await loadBundles()
  slugsInOrder.forEach((slug, order) => {
    if (isSeedSlug(slug)) {
      state.overrides[slug] = { ...state.overrides[slug], displayOrder: order }
    } else {
      const idx = state.created.findIndex((b) => b.slug === slug)
      if (idx !== -1) state.created[idx] = { ...state.created[idx], displayOrder: order }
    }
  })
  await saveBundles(state)
}

/** Soft-remove a bundle (hidden from the shop, restorable in the portal). */
export async function removeBundle(slug: string): Promise<void> {
  const state = await loadBundles()
  if (!state.removedSlugs.includes(slug)) state.removedSlugs.push(slug)
  await saveBundles(state)
}

/** Restore a soft-removed bundle. */
export async function restoreBundle(slug: string): Promise<void> {
  const state = await loadBundles()
  state.removedSlugs = state.removedSlugs.filter((s) => s !== slug)
  await saveBundles(state)
}

/**
 * Permanently delete a founder-authored bundle. Seed bundles can only be
 * soft-removed (they'd reappear on the next deploy anyway), so this throws for
 * a seed slug.
 */
export async function deleteBundle(slug: string): Promise<void> {
  if (isSeedSlug(slug)) throw new Error('Seed bundles can only be removed, not deleted')
  const state = await loadBundles()
  state.created = state.created.filter((b) => b.slug !== slug)
  state.removedSlugs = state.removedSlugs.filter((s) => s !== slug)
  delete state.overrides[slug]
  await saveBundles(state)
}

/** Duplicate any bundle into a new founder-authored draft. */
export async function duplicateBundle(slug: string, newSlug: string, newName: string): Promise<void> {
  const source = await getResolvedBundle(slug)
  if (!source) throw new Error(`Bundle "${slug}" not found`)
  const {
    displayOrder: _o, published: _p, custom: _c, removed: _r,
    // Resolved, not stored: the copy points at the same pre-built bundle and
    // resolves its own stack on the next read.
    blueprint: _b, addOns: _a, productBundle: _pb,
    ...base
  } = source
  const copy: WorkoutBundle = {
    ...base,
    slug: newSlug,
    name: newName,
    published: false, // duplicates start as drafts
    custom: true,
  }
  await createBundle(copy)
}

/** Raw persisted state — for tests and diagnostics. */
export async function getPersistedBundles(): Promise<PersistedBundles> {
  return loadBundles()
}

/** Clear all founder bundle state back to the shipped seeds (test helper). */
export async function resetBundlesStore(): Promise<void> {
  await saveBundles({ created: [], overrides: {}, removedSlugs: [] })
}
