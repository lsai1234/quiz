import type { CatalogueProduct, CatalogueVariant } from '@/lib/catalogue/types'
import { dealInfo } from './merchandising'
import { applyShopQuery, type ShopQuery } from './shop-query'

/**
 * Flavour Roulette — a wheel, with real merchandising behind it.
 *
 * Every product has flavours nobody scrolls far enough to find. A pull of the
 * wheel lands on one, at its real price, and makes picking a flavour a thing you
 * do rather than a dropdown you endure.
 *
 * ── The novelty is the front; the back is inventory ──────────────────────────
 * The wheel is weighted — towards genuinely discounted lines, towards variants
 * we hold a lot of, and towards higher `marginPriority`. That last one is worth
 * stating plainly, because everywhere else in this shop margin is forbidden from
 * influencing what surfaces: `search.ts` refuses it in ranking and says so.
 *
 * The difference is that a search is a QUESTION and this is a GAME. Someone
 * typing "creatine" is owed the best answer to what they asked; someone pulling
 * a lever has asked for a surprise, and which surprise arrives is ours to
 * choose. If this ever stops being a lever and starts being an answer, the
 * weighting has to go.
 *
 * ── The guardrails, which are not negotiable ─────────────────────────────────
 *   · It only ever lands on a variant that is IN STOCK.
 *   · It only ever lands on something that passes the shopper's ACTIVE filters —
 *     a wheel that lands on something you cannot eat is a broken toy.
 *   · The price shown is `variant.price`, the price charged.
 *
 * All three are asserted in `roulette.test.ts`.
 */

export interface RouletteEntry {
  product: CatalogueProduct
  variant: CatalogueVariant
  /** Relative likelihood. Always at least the base weight. */
  weight: number
}

/** Every entry starts here, so nothing eligible is ever unreachable. */
const BASE_WEIGHT = 1

/** A 25%-off line is worth 2.5 extra pulls of the base weight. */
const DEAL_DIVISOR = 10

/** Inventory above this counts as plenty — worth moving. */
const OVERSTOCK_UNITS = 100
const OVERSTOCK_BONUS = 1

/** `marginPriority` is 1–10; only above the midpoint does it add anything. */
const MARGIN_MIDPOINT = 5
const MARGIN_DIVISOR = 5

/**
 * Everything the wheel is allowed to land on, given what the shopper has filtered
 * to.
 *
 * The query is applied through `applyShopQuery` — the same function the results
 * grid uses — rather than re-implementing the predicates here, so the wheel can
 * never drift from the filters on screen. Its text is ignored: a search is a
 * question with an answer, and spinning for a surprise inside one is a different
 * gesture.
 */
export function rouletteEntries(products: CatalogueProduct[], query: ShopQuery): RouletteEntry[] {
  const eligible = applyShopQuery(products, { ...query, q: '', sort: 'featured' }).products

  const entries: RouletteEntry[] = []
  for (const product of eligible) {
    for (const variant of product.variants) {
      // Not negotiable: a wheel that lands on something nobody can buy has
      // wasted the pull.
      if (!variant.available) continue
      entries.push({ product, variant, weight: entryWeight(product, variant) })
    }
  }
  return entries
}

/** How hard the wheel leans towards one variant. Never below the base. */
export function entryWeight(product: CatalogueProduct, variant: CatalogueVariant): number {
  let weight = BASE_WEIGHT

  const rrp = variant.compareAtPrice ?? product.compareAtPrice ?? null
  if (rrp !== null && rrp > variant.price) {
    weight += Math.round((1 - variant.price / rrp) * 100) / DEAL_DIVISOR
  }

  const inventory = variant.inventory ?? null
  if (inventory !== null && inventory >= OVERSTOCK_UNITS) weight += OVERSTOCK_BONUS

  if (product.marginPriority > MARGIN_MIDPOINT) {
    weight += (product.marginPriority - MARGIN_MIDPOINT) / MARGIN_DIVISOR
  }

  return weight
}

/**
 * Pick one entry, weighted.
 *
 * `random` is injectable so the wheel can be tested rather than hoped about —
 * the guardrails above are only guarantees if they can be asserted across every
 * point on the distribution.
 */
export function pickEntry(entries: RouletteEntry[], random: () => number = Math.random): RouletteEntry | null {
  if (entries.length === 0) return null

  const total = entries.reduce((sum, entry) => sum + entry.weight, 0)
  if (total <= 0) return entries[0]

  let target = random() * total
  for (const entry of entries) {
    target -= entry.weight
    if (target < 0) return entry
  }
  // Only reachable through floating-point drift at the very top of the range.
  return entries[entries.length - 1]
}

/**
 * Spin, avoiding the variant just landed on where possible.
 *
 * "Spin again" returning the same thing reads as a broken lever, even though it
 * is a perfectly fair outcome — so the previous entry is excluded unless it is
 * the only one left.
 */
export function spin(
  products: CatalogueProduct[],
  query: ShopQuery,
  previousVariantId: string | null = null,
  random: () => number = Math.random,
): RouletteEntry | null {
  const entries = rouletteEntries(products, query)
  const fresh = previousVariantId ? entries.filter((e) => e.variant.id !== previousVariantId) : entries
  return pickEntry(fresh.length > 0 ? fresh : entries, random)
}

/** What the landed variant is called — "Chocolate Fudge · 1kg". */
export function entryLabel(entry: RouletteEntry): string {
  const parts = [entry.variant.flavour, entry.variant.size].filter(Boolean)
  return parts.length > 0 ? parts.join(' · ') : entry.variant.title
}

/** The saving on the landed variant, when there is one. */
export function entryDeal(entry: RouletteEntry): { onDeal: boolean; pct: number } {
  const info = dealInfo({ ...entry.product, variants: [entry.variant] })
  return { onDeal: info.onDeal, pct: info.pct }
}
