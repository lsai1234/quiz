import type { ResolvedBundle } from './resolve'
import type { CatalogueProduct } from '@/lib/catalogue/types'
import { calculatePricing } from '@/lib/stack-blueprint/pricing'

/**
 * A bundle's price, computed live from the catalogue — never stored, so a
 * pricing-config change or a product edit is reflected immediately.
 */
export interface BundlePriceSummary {
  /** The bundle's one-off total (after the bundle discount). */
  price: number
  /** Sum of the parts bought individually (pre-discount). */
  sumOfParts: number
  /** sumOfParts − price. 0 when nothing is saved. */
  saving: number
  /** saving as a whole-number percentage of sumOfParts. */
  savingPct: number
  /** Monthly subscription total (0 when the bundle can't subscribe). */
  subscriptionPrice: number
  /** True when a monthly subscription is offered. */
  subscribable: boolean
}

/** Compute a bundle's live price summary against the given catalogue. */
export function bundlePriceSummary(bundle: ResolvedBundle, products: CatalogueProduct[]): BundlePriceSummary {
  const pricing = calculatePricing(bundle.blueprint, products)
  const saving = Math.round((pricing.oneOffSubtotal - pricing.oneOffTotal) * 100) / 100
  const subscribable = pricing.subscriptionItemCount > 0 && pricing.subscriptionMinOrderMet
  return {
    price: pricing.oneOffTotal,
    sumOfParts: pricing.oneOffSubtotal,
    saving: Math.max(0, saving),
    savingPct: pricing.oneOffSubtotal > 0 ? Math.round((saving / pricing.oneOffSubtotal) * 100) : 0,
    subscriptionPrice: subscribable ? pricing.subscriptionTotal : 0,
    subscribable,
  }
}

/**
 * The core product ids of a bundle that are missing from (or unavailable in) the
 * given catalogue. A bundle with any missing core product should not be sold.
 */
export function missingCoreProducts(bundle: ResolvedBundle, products: CatalogueProduct[]): string[] {
  const byId = new Map(products.map((p) => [p.id, p]))
  const missing: string[] = []
  for (const slot of bundle.blueprint.slots) {
    const product = byId.get(slot.selectedProductId)
    const inStock = product && product.variants.some((v) => v.available)
    if (!inStock) missing.push(slot.selectedProductId)
  }
  return missing
}

/**
 * True when the bundle has a stack and every product in it is in stock.
 *
 * The empty case is the one that matters now: a session stack that points at
 * no pre-built bundle resolves to an empty stack, and an empty stack has no
 * missing products — so "nothing is missing" used to mean "sell it". A package
 * with no products in it is not a thing anybody can buy.
 */
export function isBundleSellable(bundle: ResolvedBundle, products: CatalogueProduct[]): boolean {
  if (bundle.blueprint.slots.length === 0) return false
  return missingCoreProducts(bundle, products).length === 0
}
