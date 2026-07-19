import type { PrebuiltBundle } from './types'
import type { CatalogueProduct } from '@/lib/catalogue/types'
import { missingCoreProducts, bundlePriceSummary } from './pricing'

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
export function bundleReadiness(bundle: PrebuiltBundle, products: CatalogueProduct[]): BundleReadiness {
  const checks: ReadinessCheck[] = []

  // 1. Products resolve and are in stock — a bundle can't ship without them.
  const missing = missingCoreProducts(bundle, products)
  checks.push({
    id: 'products',
    label: 'Products in stock',
    status: bundle.blueprint.slots.length === 0 ? 'fail' : missing.length === 0 ? 'ok' : 'fail',
    detail:
      bundle.blueprint.slots.length === 0
        ? 'No products in the stack'
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

  // 3. Workout present — the whole point of a bundle vs a plain stack.
  const hasWorkout = !!bundle.workout?.title && bundle.workout.exercises.length > 0
  checks.push({
    id: 'workout',
    label: 'Workout attached',
    status: hasWorkout ? 'ok' : 'warn',
    detail: hasWorkout ? undefined : 'No workout exercises set',
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
    sellable: missing.length === 0 && bundle.blueprint.slots.length > 0,
  }
}
