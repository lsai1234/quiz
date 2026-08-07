import type { CatalogueProduct, CatalogueVariant } from '@/lib/catalogue/types'
import { hashString } from './ratings'

/**
 * Shop merchandising: deal detection (RRP vs price) and the good/better/best
 * badges, derived from the same catalogue signals the engine uses so the shop
 * and quiz agree on what's "popular" or "best value".
 */

/** The variant a card/section prices against — first available, else the first. */
export function defaultVariant(product: CatalogueProduct): CatalogueVariant | undefined {
  return product.variants.find((v) => v.available) ?? product.variants[0]
}

// ─── Availability & low stock ───────────────────────────────────────────────────

/** At or below this many units left, a variant reads as "Only N left". */
export const LOW_STOCK_THRESHOLD = 10

export interface StockState {
  /** Real remaining units, or null when inventory isn't tracked. */
  count: number | null
  /** In stock but at/below the threshold (a real, positive count) — show the urgency chip. */
  low: boolean
}

/** Honest stock state for a variant. Only "low" when a real, positive count is known. */
export function variantStock(v: Pick<CatalogueVariant, 'available' | 'inventory'>): StockState {
  const count = v.inventory ?? null
  const low = v.available && count != null && count > 0 && count <= LOW_STOCK_THRESHOLD
  return { count, low }
}

/**
 * A stable, representative inventory count for a mock variant, seeded by its id.
 * Roughly one variant in four runs low (1–9 left, triggering "Only N left"); the
 * rest are comfortably stocked. Demo data only — live variants use the real
 * the supplier's reported stock level.
 */
export function demoInventory(variantId: string): number {
  const h = hashString(`${variantId}:stock`)
  if (h % 4 === 0) return 1 + (h % 9) // 1 … 9 — low stock
  return 24 + (h % 160) // 24 … 183 — healthy
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
