import type { CatalogueProduct, CatalogueVariant } from '@/lib/catalogue/types'
import { discountWithFloor, getPricingConfig, unitCostOf, type PricingConfig } from '@/lib/stack-blueprint/pricing'

/**
 * What one extra in a subscriber's next box costs (`hub/next-box`): the
 * variant's price with the plan's own saving, never below the margin floor. The
 * same price the hub's calendar quotes for "just this box". In its own file so
 * the shop can show it without the delivery schedule's code.
 */
export function extraPrice(product: CatalogueProduct, variant: CatalogueVariant, config: PricingConfig = getPricingConfig()): number {
  const cost = unitCostOf(product, variant.price, config)
  return Math.round(discountWithFloor(variant.price, config.subscriptionDiscount, cost, config) * 100) / 100
}
