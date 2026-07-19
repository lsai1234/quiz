import type { PrebuiltBundle } from './types'

/**
 * Founder-managed bundle state, persisted in the database (see `store.ts`).
 * Bundles resolve as: seeds (shipped) with per-slug overrides merged on, then
 * founder-authored bundles appended, minus any soft-removed slugs.
 */
export interface PersistedBundles {
  /** Founder-authored bundles (full records). */
  created: PrebuiltBundle[]
  /** Partial edits keyed by slug — applied to seeds (and created bundles). */
  overrides: Record<string, Partial<PrebuiltBundle>>
  /** Slugs hidden from the shop/public API but kept for restore. */
  removedSlugs: string[]
}

export const EMPTY_PERSISTED_BUNDLES: PersistedBundles = { created: [], overrides: {}, removedSlugs: [] }

/** A bundle resolved to its effective state, with curation fields filled in. */
export interface ResolvedBundle extends PrebuiltBundle {
  displayOrder: number
  published: boolean
  custom: boolean
  /** True when the bundle is soft-removed (only surfaced when includeRemoved). */
  removed: boolean
}

/** Shallow-merge a partial override onto a bundle. Nested objects are replaced wholesale. */
export function mergeBundleOverride(base: PrebuiltBundle, override?: Partial<PrebuiltBundle>): PrebuiltBundle {
  if (!override || Object.keys(override).length === 0) return base
  return { ...base, ...override }
}

/**
 * Compose the effective bundle list from seeds + persisted founder state.
 * Seeds come first in their shipped order, then founder-authored bundles; the
 * result is sorted by displayOrder (falling back to that composition order).
 * Soft-removed bundles are dropped unless `includeRemoved` is set (the portal
 * list needs them to offer a restore).
 */
export function composeBundles(
  seeds: PrebuiltBundle[],
  persisted: PersistedBundles,
  opts: { includeRemoved?: boolean } = {},
): ResolvedBundle[] {
  const removed = new Set(persisted.removedSlugs)
  const composed: PrebuiltBundle[] = [
    ...seeds.map((s) => mergeBundleOverride(s, persisted.overrides[s.slug])),
    ...persisted.created.map((c) => mergeBundleOverride(c, persisted.overrides[c.slug])),
  ]
  const seedSlugs = new Set(seeds.map((s) => s.slug))

  const resolved: ResolvedBundle[] = composed.map((b, i) => ({
    ...b,
    displayOrder: b.displayOrder ?? i,
    published: b.published !== false,
    custom: !seedSlugs.has(b.slug),
    removed: removed.has(b.slug),
  }))

  const visible = opts.includeRemoved ? resolved : resolved.filter((b) => !b.removed)
  return visible.sort((a, b) => a.displayOrder - b.displayOrder || a.slug.localeCompare(b.slug))
}

/** A URL/DOM-safe slug from a bundle name (for the creator). */
export function bundleSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
}
