import type { CatalogueProduct } from './types'

/**
 * The flavour/size shown by default for a product: its own chosen default when
 * that variant still exists, else the first available one, else the first
 * listed. Falls back to the product id so callers always have a usable key.
 */
export function defaultVariantId(product: CatalogueProduct): string {
  if (product.defaultVariantId && product.variants.some((v) => v.id === product.defaultVariantId)) {
    return product.defaultVariantId
  }
  return (product.variants.find((v) => v.available) ?? product.variants[0])?.id ?? product.id
}
