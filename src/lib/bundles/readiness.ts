import type { ResolvedBundle } from './resolve'
import type { CatalogueProduct } from '@/lib/catalogue/types'
import { missingCoreProducts, bundlePriceSummary } from './pricing'
import { bundleWorkouts } from './resolve'

export type CheckStatus = 'ok' | 'warn' | 'fail'

export interface ReadinessCheck {
  id: string
  label: string
  status: CheckStatus
  detail?: string
}

export interface BundleReadiness {
  slug: string
  overall: CheckStatus
  checks: ReadinessCheck[]
  /** Convenience: the bundle can actually be sold right now. */
  sellable: boolean
}

const RANK: Record<CheckStatus, number> = { ok: 0, warn: 1, fail: 2 }
function worst(statuses: CheckStatus[]): CheckStatus {
  return statuses.reduce<CheckStatus>((acc, s) => (RANK[s] > RANK[acc] ? s : acc), 'ok')
}

/**
 * Traffic-light readiness for a bundle — mirrors the product readiness model
 * the portal already uses. Overall status is the worst of its checks.
 */
export function bundleReadiness(bundle: ResolvedBundle, products: CatalogueProduct[]): BundleReadiness {
  const checks: ReadinessCheck[] = []

  // 1. A pre-built bundle is chosen, and it still exists. Everything
  //    product-shaped hangs off this: without it the package has no stack, no
  //    price and nothing to ship.
  const linked = Boolean(bundle.productBundle)
  checks.push({
    id: 'stack',
    label: linked ? `Stack — ${bundle.productBundle!.name}` : 'No pre-built bundle chosen',
    status: linked ? 'ok' : 'fail',
    detail: linked
      ? undefined
      : bundle.productBundleSlug
        ? `"${bundle.productBundleSlug}" no longer exists — pick another.`
        : 'Pick the pre-built bundle this workout sells.',
  })

  // 2. Its products resolve and are in stock — a bundle can't ship without them.
  const missing = missingCoreProducts(bundle, products)
  checks.push({
    id: 'products',
    label: 'Products in stock',
    status: bundle.blueprint.slots.length === 0 ? 'fail' : missing.length === 0 ? 'ok' : 'fail',
    detail:
      bundle.blueprint.slots.length === 0
        ? linked ? 'The pre-built bundle has no products in it' : 'No stack to take products from'
        : missing.length > 0
          ? `Unavailable: ${missing.join(', ')}`
          : undefined,
  })

  // 2. Pricing resolves to a sensible total.
  const price = bundlePriceSummary(bundle, products)
  checks.push({
    id: 'pricing',
    label: 'Prices cleanly',
    status: price.price > 0 ? 'ok' : 'warn',
    detail: price.price > 0 ? undefined : 'Total is £0 — check the products',
  })

  // 3. At least one workout — the whole point of a package vs a plain stack.
  //    More than one is normal now (a strength package is a week of sessions),
  //    so this counts them and names the ones that are still empty.
  const workouts = bundleWorkouts(bundle)
  const complete = workouts.filter((w) => !!w.title?.trim() && w.exercises.length > 0)
  checks.push({
    id: 'workout',
    label: complete.length > 1 ? `${complete.length} workouts attached` : 'Workout attached',
    status: complete.length > 0 ? 'ok' : 'warn',
    detail:
      complete.length > 0
        ? workouts.length > complete.length
          ? `${workouts.length - complete.length} with no exercises set`
          : undefined
        : 'No workout exercises set',
  })

  // 4. Story & claim-safety copy present.
  const missingCopy: string[] = []
  if (!bundle.tagline?.trim()) missingCopy.push('tagline')
  if (!bundle.description?.trim()) missingCopy.push('description')
  if (!bundle.disclaimer?.trim()) missingCopy.push('disclaimer')
  if (!bundle.howToUse || bundle.howToUse.length === 0) missingCopy.push('how-to')
  checks.push({
    id: 'copy',
    label: 'Story & safety copy',
    status: missingCopy.length === 0 ? 'ok' : missingCopy.length <= 1 ? 'warn' : 'fail',
    detail: missingCopy.length ? `Missing: ${missingCopy.join(', ')}` : undefined,
  })

  // 5. Metadata for SEO.
  checks.push({
    id: 'meta',
    label: 'SEO metadata',
    status: bundle.metaTitle?.trim() && bundle.metaDescription?.trim() ? 'ok' : 'warn',
    detail: bundle.metaTitle?.trim() && bundle.metaDescription?.trim() ? undefined : 'Meta title/description missing',
  })

  return {
    slug: bundle.slug,
    overall: worst(checks.map((c) => c.status)),
    checks,
    sellable: linked && missing.length === 0 && bundle.blueprint.slots.length > 0,
  }
}
