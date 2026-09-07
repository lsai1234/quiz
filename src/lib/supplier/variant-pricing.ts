/**
 * Giving each variant its own price and its own serving count.
 *
 * ── The bug this undoes ─────────────────────────────────────────────────────
 * Import merged a roster row's sibling SKUs into one product and priced them
 * all from the ROW's main SKU, on the reasoning that a flavour of one tub costs
 * one price. True of flavours; false of everything else a person puts under one
 * master SKU:
 *
 *   Glycine, 1000mg - 100 vcaps      £11.12 cost   33 servings
 *   Glycine, Pure Powder - 454 grams £20.04 cost  454 servings
 *
 * Both went on the shelf at one price with "33 servings" under each — one sold
 * at a loss, and a per-serving figure out by a factor of fourteen.
 *
 * Pure: no network, no database. The route (`api/portal/products/
 * repair-variant-pricing`) fetches what the supplier says and this decides what
 * to do with it, so the rules can be tested without standing up either.
 */
import type { CatalogueProduct, CatalogueVariant } from '@/lib/catalogue/types'
import { listPriceFor } from '@/lib/pricing/list-price'
import { isAccessory } from '@/lib/catalogue/accessory'
import { sizeFromName } from '@/lib/supplier/roster-import'

/** What the supplier says about one SKU right now. */
export interface SkuFacts {
  cost: number | null
  rrp: number | null
  servings: number | null
  name: string | null
  /**
   * This SKU's own photograph.
   *
   * PowerBody hold one per product id and every flavour is its own product at
   * their end, so the per-flavour pictures have always existed — import just
   * never asked for any but the main SKU's, and six flavours went live showing
   * one photograph six times.
   */
  image?: string | null
}

const round = (n: number) => Math.round(n * 100) / 100

/**
 * Re-price and re-count one product's variants.
 *
 * Returns null when nothing changed, so a caller can skip the write rather than
 * rewriting a hundred identical rows.
 */
export function repriceVariants(
  product: CatalogueProduct,
  facts: Map<string, SkuFacts>,
  force: boolean,
): { product: CatalogueProduct; changed: Record<string, string> } | null {
  const known = product.variants
    .map((v) => (v.sku ? facts.get(v.sku) : undefined))
    .filter((f): f is SkuFacts => Boolean(f))
  const costs = new Set(known.map((f) => f.cost).filter((c): c is number => c != null && c > 0))
  const shelfPrices = new Set(product.variants.map((v) => v.price))

  // The narrow pass: siblings that genuinely cost different amounts but are all
  // being sold at one price. Anything else is somebody's pricing decision.
  const mispriced = costs.size > 1 && shelfPrices.size === 1
  const reprice = force || mispriced

  const changed: Record<string, string> = {}
  const variants: CatalogueVariant[] = product.variants.map((variant) => {
    const fact = variant.sku ? facts.get(variant.sku) : undefined
    if (!fact) return variant
    let next = variant
    const notes: string[] = []

    if (reprice && fact.cost != null && fact.cost > 0) {
      const price = listPriceFor(fact.cost)
      const rrp = fact.rrp != null && fact.rrp > price ? round(fact.rrp) : next.compareAtPrice
      if (price !== next.price) notes.push(`£${next.price.toFixed(2)} → £${price.toFixed(2)}`)
      next = { ...next, price, compareAtPrice: rrp, cost: round(fact.cost) }
    } else if (fact.cost != null && fact.cost > 0 && next.cost !== round(fact.cost)) {
      // Cost is a fact even when the price is a decision: the hub's margin
      // figures are read off it, and a per-variant cost nobody recorded is why
      // a loss-making variant looked profitable.
      next = { ...next, cost: round(fact.cost) }
    }

    // An accessory has no dose, so it has no servings to be right about.
    if (!isAccessory(product) && fact.servings != null && fact.servings > 0 && next.servings !== fact.servings) {
      notes.push(`${next.servings ?? product.servings} → ${fact.servings} servings`)
      next = { ...next, servings: fact.servings }
    }

    // A size is what tells two rows apart in the picker when the supplier's
    // flavour column is empty — and it is empty more often than not.
    if (!next.size) {
      const size = sizeFromName(fact.name)
      if (size) next = { ...next, size }
    }

    // Its own picture. Only filled in, never overwritten: a founder who has
    // pointed a variant at a better photograph than the supplier's should not
    // have it replaced by a repair pass.
    if (!next.imageUrl && fact.image) {
      notes.push('picture')
      next = { ...next, imageUrl: fact.image }
    }

    if (next === variant) return variant
    if (notes.length > 0) changed[variant.sku ?? variant.id] = notes.join(', ')
    return next
  })

  if (variants.every((v, i) => v === product.variants[i])) return null

  const defaultVariant =
    variants.find((v) => v.id === product.defaultVariantId && v.available) ??
    variants.find((v) => v.available) ??
    variants[0]

  return {
    product: {
      ...product,
      variants,
      // `basePrice` is what every summary quotes, so it follows the variant the
      // page opens on. Leaving it behind is how a product sheet and its own
      // card disagree about the price.
      basePrice: defaultVariant?.price ?? product.basePrice,
      compareAtPrice: defaultVariant?.compareAtPrice ?? product.compareAtPrice,
    },
    changed,
  }
}

