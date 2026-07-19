import type { PrebuiltBundle } from './types'
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
export function bundlePriceSummary(bundle: PrebuiltBundle, products: CatalogueProduct[]): BundlePriceSummary {
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
export function missingCoreProducts(bundle: PrebuiltBundle, products: CatalogueProduct[]): string[] {
  const byId = new Map(products.map((p) => [p.id, p]))
  const missing: string[] = []
  for (const slot of bundle.blueprint.slots) {
    const product = byId.get(slot.selectedProductId)
    const inStock = product && product.variants.some((v) => v.available)
    if (!inStock) missing.push(slot.selectedProductId)
  }
  return missing
}

/** True when every core product resolves and is in stock — the bundle is sellable. */
export function isBundleSellable(bundle: PrebuiltBundle, products: CatalogueProduct[]): boolean {
  return missingCoreProducts(bundle, products).length === 0
}
