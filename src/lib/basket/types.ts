import type { CatalogueProduct, CatalogueVariant } from '@/lib/catalogue/types'

/**
 * A persisted basket line — deliberately lightweight (ids + quantity only) so
 * the stored basket stays small and survives catalogue changes. Full product
 * data is joined back on read via `resolveBasket`, so a product that later
 * disappears simply drops out rather than corrupting the basket.
 */
export interface BasketLine {
  productId: string
  variantId: string
  quantity: number
}

/** A basket line joined against the live catalogue, ready to render/price. */
export interface ResolvedBasketLine {
  product: CatalogueProduct
  variant: CatalogueVariant
  quantity: number
  /** variant.price × quantity. */
  lineTotal: number
}
