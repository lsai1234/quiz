import type { CatalogueProduct, CatalogueVariant } from '@/lib/catalogue/types'
import { discountWithFloor, getPricingConfig, unitCostOf, type PricingConfig } from '@/lib/stack-blueprint/pricing'

/**
 * What one extra in a subscriber's next box costs (`hub/next-box`): the
 * variant's price with the member's OWN plan saving (13%, 15% or 20%, by their
 * plan's size), never below the margin floor. It ships in the box that's going
 * anyway, so there's no delivery to pay for it. The same price the hub's
 * calendar quotes for "just this box". In its own file so the shop can show it
 * without the delivery schedule's code.
 *
 * It used to be a flat 15% for every member, which was more than a 13% plan
 * gets on its own products and less than a 20% plan does.
 */
export function extraPrice(
  product: CatalogueProduct,
  variant: CatalogueVariant,
  config: PricingConfig = getPricingConfig(),
  rate: number = config.subscriptionDiscount,
): number {
  const cost = variant.cost ?? unitCostOf(product, variant.price, config)
  return Math.round(discountWithFloor(variant.price, rate, cost, config, product.vatRate) * 100) / 100
}

/**
 * The first-time price for trying something new in the next box (`hub/try-new`):
 * up to `maxPct` off, never below the margin floor.
 */
export function tryPrice(product: CatalogueProduct, variant: CatalogueVariant, maxPct: number, config: PricingConfig = getPricingConfig()): number {
  return extraPrice(product, variant, config, Math.min(0.5, Math.max(0, maxPct)))
}
