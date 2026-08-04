/**
 * The Top 25 — the hand-picked roster the quiz reaches for first.
 *
 * WHY A ROSTER AND NOT A FIELD
 * ────────────────────────────
 * "Which products should the quiz actually recommend?" is one decision about the
 * range, not twenty-five separate decisions about individual products. Held as a
 * per-product number it drifts: two products creep to priority 10, nobody
 * remembers why, and the shortlist stops being a shortlist. Held as one ORDERED
 * LIST it stays honest — there are 25 places, putting something in means taking
 * something out, and the order is visible in one screen.
 *
 * The roster does not restrict the catalogue. Everything we sell is still in the
 * shop and still swappable in a built stack; the roster only says what the
 * engine should prefer when several products could fill the same slot. That
 * matters because the quiz is where the range earns its keep, and a supplier
 * feed of hundreds of SKUs will otherwise recommend whatever happens to score
 * highest that week.
 *
 * Applied in `catalogue/resolve.ts` as `product.topRank`, consumed by the
 * scoring engine. Pure functions here; persistence goes through `./store.ts`.
 */
import type { CatalogueProduct } from '@/lib/catalogue/types'

/**
 * How many products the roster holds.
 *
 * 25 is a business decision, not a technical one: it is roughly what a founder
 * can actually keep the data right for — costs, doses, claims, imagery — and the
 * whole point of the roster is that everything on it is properly maintained.
 */
export const TOP_PRODUCT_LIMIT = 25

/** Trim a roster to the limit and drop duplicates, keeping the first occurrence. */
export function normaliseRoster(ids: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const id of ids) {
    if (!id || seen.has(id)) continue
    seen.add(id)
    out.push(id)
    if (out.length >= TOP_PRODUCT_LIMIT) break
  }
  return out
}

/** Rank (1-based) for each id on the roster. */
export function rankMap(ids: string[]): Map<string, number> {
  return new Map(normaliseRoster(ids).map((id, i) => [id, i + 1]))
}

/**
 * Stamp `topRank` onto the catalogue.
 *
 * Ids on the roster that no longer exist are simply ignored rather than being
 * an error: a product can be removed from the catalogue at any time, and the
 * roster should degrade to "24 picks" rather than break the quiz.
 */
export function applyTopRanks(products: CatalogueProduct[], ids: string[]): CatalogueProduct[] {
  if (ids.length === 0) return products
  const ranks = rankMap(ids)
  return products.map((p) => {
    const rank = ranks.get(p.id)
    return rank ? { ...p, topRank: rank } : p
  })
}

export interface TopProductSlot {
  rank: number
  productId: string
  /** Null when the roster still lists something that has since been removed. */
  product: CatalogueProduct | null
}

/** The roster resolved against the catalogue, in order, for the hub screen. */
export function resolveRoster(ids: string[], products: CatalogueProduct[]): TopProductSlot[] {
  const byId = new Map(products.map((p) => [p.id, p]))
  return normaliseRoster(ids).map((productId, i) => ({
    rank: i + 1,
    productId,
    product: byId.get(productId) ?? null,
  }))
}

/** Move an entry up or down the roster. Out-of-range moves are no-ops. */
export function reorder(ids: string[], productId: string, direction: -1 | 1): string[] {
  const next = normaliseRoster(ids)
  const from = next.indexOf(productId)
  const to = from + direction
  if (from === -1 || to < 0 || to >= next.length) return next
  ;[next[from], next[to]] = [next[to], next[from]]
  return next
}
