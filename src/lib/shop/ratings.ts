import type { CatalogueProduct, ProductRating } from '@/lib/catalogue/types'

/**
 * Shop social-proof helpers: formatting a rating for display and aggregating the
 * catalogue's real ratings for the trust strip. Plus a deterministic demo-rating
 * generator used *only* by the mock catalogue so the feature is visible in
 * local/dev — live products get their ratings from real review data, never here.
 */

/** A rating is only worth showing once at least one review backs it. */
export function hasRating(rating: ProductRating | undefined): rating is ProductRating {
  return !!rating && rating.count > 0 && rating.average > 0
}

/** Compact review count for tight card labels: 1240 → "1.2k". */
export function formatRatingCount(count: number): string {
  if (count < 1000) return String(count)
  const k = count / 1000
  return `${k >= 10 ? Math.round(k) : Math.round(k * 10) / 10}k`
}

export interface CatalogueRatingSummary {
  /** Review-count-weighted mean across all rated products, 0–5. */
  average: number
  /** Total reviews behind the summary. */
  count: number
  /** How many products carry a rating (the summary's breadth). */
  ratedProducts: number
}

/**
 * Weighted average rating across the catalogue, for the shop trust strip. Weighted
 * by review count so a 5.0 from two reviews doesn't outweigh a 4.6 from hundreds.
 * Returns null when nothing is rated, so the strip simply omits the line.
 */
export function catalogueRatingSummary(products: CatalogueProduct[]): CatalogueRatingSummary | null {
  let weighted = 0
  let count = 0
  let ratedProducts = 0
  for (const p of products) {
    if (!hasRating(p.rating)) continue
    weighted += p.rating.average * p.rating.count
    count += p.rating.count
    ratedProducts += 1
  }
  if (count === 0) return null
  return { average: Math.round((weighted / count) * 10) / 10, count, ratedProducts }
}

// ─── Demo ratings (mock catalogue only) ─────────────────────────────────────────

/** FNV-1a: a tiny stable string hash for seeding deterministic demo data. */
export function hashString(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/**
 * A stable, representative rating for a mock product, seeded by its id. Ratings
 * land in a believable 4.2–4.9 band with review counts from ~40 to ~600 — plainly
 * example data, in the same spirit as the mock catalogue's invented prices. Real
 * Real products never use this; their ratings come from review data.
 */
export function demoRating(id: string): ProductRating {
  const h = hashString(id)
  const average = 4.2 + ((h % 8) / 10) // 4.2 … 4.9 in 0.1 steps
  const count = 40 + ((h >>> 3) % 561) // 40 … 600
  return { average: Math.round(average * 10) / 10, count }
}
