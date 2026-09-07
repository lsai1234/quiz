import type { StackBlueprint } from '@/lib/stack-blueprint'
import type { BundleAddOn, BundleWorkout, ProductBundle, WorkoutBundle } from './types'

/**
 * A bundle's workouts, whichever shape it is stored in.
 *
 * A bundle used to carry exactly one `workout`, and every bundle a founder
 * saved before this change still does — those records live in the database, not
 * in this repository, so both shapes are real and will be for as long as those
 * rows exist. This is the one place that knows that.
 *
 * Order is the authored order; the landing page leads with the first.
 */
export function bundleWorkouts(bundle: Pick<WorkoutBundle, 'workouts' | 'workout'>): BundleWorkout[] {
  if (Array.isArray(bundle.workouts) && bundle.workouts.length > 0) return bundle.workouts
  return bundle.workout ? [bundle.workout] : []
}

/**
 * Fill in `workouts` for a bundle that predates it, so nothing downstream has
 * to ask which shape it was handed. Cheap and idempotent: a bundle that already
 * has the list is returned as it came.
 */
export function normaliseBundle(bundle: WorkoutBundle): WorkoutBundle {
  if (Array.isArray(bundle.workouts) && bundle.workouts.length > 0) return bundle
  const workouts = bundleWorkouts(bundle)
  return { ...bundle, workouts }
}

/**
 * Founder-managed bundle state, persisted in the database (see `store.ts`).
 * Bundles resolve as: seeds (shipped) with per-slug overrides merged on, then
 * founder-authored bundles appended, minus any soft-removed slugs.
 */
export interface PersistedBundles {
  /** Founder-authored workout bundles (full records). */
  created: WorkoutBundle[]
  /** Partial edits keyed by slug — applied to seeds (and created bundles). */
  overrides: Record<string, Partial<WorkoutBundle>>
  /** Slugs hidden from the shop/public API but kept for restore. */
  removedSlugs: string[]
}

export const EMPTY_PERSISTED_BUNDLES: PersistedBundles = { created: [], overrides: {}, removedSlugs: [] }

/**
 * A workout bundle resolved to what it actually sells.
 *
 * `blueprint` and `addOns` are NOT stored on the bundle — they come from the
 * pre-built bundle it points at, resolved here on every read. That is what
 * makes the reference worth having: change the Strength stack once and every
 * session built on it is selling the new one, with no copy left behind.
 *
 * An unlinked bundle resolves to an empty stack rather than to nothing, so the
 * Hub can still list it, price it at zero and say what it is missing.
 */
export interface ResolvedBundle extends WorkoutBundle {
  /** The stack this package sells, from its pre-built bundle. Empty when unlinked. */
  blueprint: StackBlueprint
  addOns: BundleAddOn[]
  /** The pre-built bundle itself, for anything that needs its name. */
  productBundle: ProductBundle | null
  displayOrder: number
  published: boolean
  custom: boolean
  /** True when the bundle is soft-removed (only surfaced when includeRemoved). */
  removed: boolean
}

/** Shallow-merge a partial override onto a bundle. Nested objects are replaced wholesale. */
export function mergeBundleOverride(base: WorkoutBundle, override?: Partial<WorkoutBundle>): WorkoutBundle {
  if (!override || Object.keys(override).length === 0) return normaliseBundle(base)
  const merged = { ...base, ...override }
  /*
    An override saved by the old editor carries a single `workout` and no list.
    Merged naively it loses: the base's `workouts` survives the spread and the
    founder's edit is silently discarded — the one failure mode of keeping two
    shapes around. The override's own workout wins, which is what saving it
    meant.
  */
  if (override.workout && !override.workouts) return { ...merged, workouts: [override.workout] }
  return normaliseBundle(merged)
}

/** The stack a package sells when it points at nothing yet. */
function emptyBlueprint(bundle: WorkoutBundle): StackBlueprint {
  return {
    id: `bundle-${bundle.slug}`,
    stackName: bundle.name,
    summary: bundle.tagline || bundle.description,
    primaryGoal: 'health',
    secondaryGoals: [],
    userProfileSummary: bundle.seriesName,
    slots: [],
    estimatedOneOffPrice: 0,
    estimatedSubscriptionPrice: 0,
    savingsSummary: '',
    createdAt: new Date(0).toISOString(),
  }
}

/**
 * The stack a package sells, wearing the package's name.
 *
 * The slots, the products and the reasons are the pre-built bundle's — they are
 * the same whichever session is selling them. The name and the summary are the
 * package's, because that is what a receipt, a checkout line and a subscription
 * are labelled with, and "Strength" on somebody's bank statement tells them
 * nothing about what they bought.
 */
export function blueprintFor(bundle: WorkoutBundle, productBundle: ProductBundle | null): StackBlueprint {
  if (!productBundle) return emptyBlueprint(bundle)
  return {
    ...productBundle.blueprint,
    id: `bundle-${bundle.slug}`,
    stackName: bundle.name,
    summary: bundle.tagline || productBundle.blueprint.summary,
    userProfileSummary: bundle.seriesName || productBundle.blueprint.userProfileSummary,
  }
}

/**
 * Compose the effective bundle list from seeds + persisted founder state,
 * resolving each one's stack from the pre-built bundle it points at.
 *
 * Seeds come first in their shipped order, then founder-authored bundles; the
 * result is sorted by displayOrder (falling back to that composition order).
 * Soft-removed bundles are dropped unless `includeRemoved` is set (the portal
 * list needs them to offer a restore).
 */
export function composeBundles(
  seeds: WorkoutBundle[],
  persisted: PersistedBundles,
  productBundles: ProductBundle[] = [],
  opts: { includeRemoved?: boolean } = {},
): ResolvedBundle[] {
  const removed = new Set(persisted.removedSlugs)
  const stacks = new Map(productBundles.map((p) => [p.slug, p]))
  const composed: WorkoutBundle[] = [
    ...seeds.map((s) => mergeBundleOverride(s, persisted.overrides[s.slug])),
    ...persisted.created.map((c) => mergeBundleOverride(c, persisted.overrides[c.slug])),
  ]
  const seedSlugs = new Set(seeds.map((s) => s.slug))

  const resolved: ResolvedBundle[] = composed.map((b, i) => {
    // A slug pointing at a stack that has since been deleted resolves to null
    // rather than throwing: the Hub then says the link is broken, and the shop
    // hides the bundle, which is the same handling as never having linked it.
    const productBundle = b.productBundleSlug ? stacks.get(b.productBundleSlug) ?? null : null
    return {
      ...b,
      productBundle,
      blueprint: blueprintFor(b, productBundle),
      addOns: productBundle?.addOns ?? [],
      displayOrder: b.displayOrder ?? i,
      published: b.published !== false,
      custom: !seedSlugs.has(b.slug),
      removed: removed.has(b.slug),
    }
  })

  const visible = opts.includeRemoved ? resolved : resolved.filter((b) => !b.removed)
  return visible.sort((a, b) => a.displayOrder - b.displayOrder || a.slug.localeCompare(b.slug))
}

/** A URL/DOM-safe slug from a bundle name (for the creator). */
export function bundleSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
}
