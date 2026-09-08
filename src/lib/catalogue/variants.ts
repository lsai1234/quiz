import type { CatalogueProduct } from './types'
import { masterVariant } from './master'

/**
 * The flavour/size shown by default for a product: its MASTER — the SKU a
 * founder chose in the Hub — with `masterVariant`'s fallbacks when that variant
 * is sold out or gone. Falls back to the product id so callers always have a
 * usable key.
 */
export function defaultVariantId(product: CatalogueProduct): string {
  return masterVariant(product)?.id ?? product.id
}
