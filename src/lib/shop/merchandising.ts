import type { CatalogueProduct, CatalogueVariant } from '@/lib/catalogue/types'

/**
 * Shop merchandising: deal detection (RRP vs price) and the good/better/best
 * badges, derived from the same catalogue signals the engine uses so the shop
 * and quiz agree on what's "popular" or "best value".
 */

/** The variant a card/section prices against — first available, else the first. */
export function defaultVariant(product: CatalogueProduct): CatalogueVariant | undefined {
  return product.variants.find((v) => v.available) ?? product.variants[0]
}

export interface DealInfo {
  price: number
  rrp: number | null
  onDeal: boolean
  /** Whole-percent saving vs RRP (0 when not on deal). */
  pct: number
}

/** Price + deal state for a product's default variant. */
export function dealInfo(product: CatalogueProduct): DealInfo {
  const v = defaultVariant(product)
  const price = v?.price ?? product.basePrice
  const rrp = v?.compareAtPrice ?? product.compareAtPrice ?? null
  const onDeal = rrp != null && rrp > price
  const pct = onDeal ? Math.round((1 - price / rrp) * 100) : 0
  return { price, rrp, onDeal, pct }
}

/** Products currently on deal, biggest saving first. */
export function dealsProducts(products: CatalogueProduct[]): CatalogueProduct[] {
  return products
    .filter((p) => dealInfo(p).onDeal)
    .sort((a, b) => dealInfo(b).pct - dealInfo(a).pct)
}

/** The best whole-percent saving across a set of products (0 if none on deal). */
export function maxDealPct(products: CatalogueProduct[]): number {
  return products.reduce((max, p) => Math.max(max, dealInfo(p).pct), 0)
}

/**
 * A single merchandising badge for a card, or null. "Popular" leads on the
 * engine's recommendation priority; "Best value" on margin priority — mirroring
 * the swap modal's good/better/best framing.
 */
export function productBadge(product: CatalogueProduct): string | null {
  if (product.recommendationPriority >= 8) return 'Popular'
  if (product.marginPriority >= 8) return 'Best value'
  return null
}
