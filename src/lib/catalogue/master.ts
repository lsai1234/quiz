import type { CatalogueProduct, CatalogueVariant } from './types'

/**
 * Which SKU a product presents itself as — its MASTER.
 *
 * ── The thing that had no name ──────────────────────────────────────────────
 * PowerBody sell a seven-flavour product as seven SKUs, one of which is the
 * listing the others hang off. Our import merged them into one product and kept
 * that arrangement implicitly: the row's main SKU supplied the picture, the
 * description, the price and the serving count, and everything else became "a
 * variant". Nothing recorded WHICH sku that was, and nothing could change it.
 *
 * So when the roster had the wrong SKU in the main column — which is a thing a
 * person typing a spreadsheet does — the product wore the wrong flavour's
 * photograph and opened on the wrong one, and the only fix was to re-import.
 *
 * `defaultVariantId` is where the choice lives. It already existed and already
 * meant "the one shown by default"; this gives it the rest of its job — the
 * product-level picture, price, cost and serving count all follow it — and a
 * name a founder would use.
 *
 * ── What the master does NOT decide ─────────────────────────────────────────
 * The product's NAME. A master SKU is still one flavour, and naming a product
 * after it is the bug that started all this: "Hydration+, Blue Raspberry - 240
 * grams" is not what a four-flavour product is called. The title is what the
 * flavours share, or whatever the founder typed, and choosing a master leaves
 * it alone.
 *
 * Pure: no network, no database.
 */

/**
 * The variant a product presents itself as: its stored choice when that variant
 * still exists, else the first sellable one, else the first listed.
 *
 * The fallbacks matter as much as the choice. A master that has gone out of
 * stock should not leave the shop showing an unbuyable price, and a master that
 * has been deleted should not leave the product with none.
 *
 * The fallback happens HERE, at read time, and nothing writes it back. A stock
 * level is a fact about today; the master is a decision somebody made. Moving
 * the stored choice because a flavour ran out — which is what the stock sync
 * used to do — quietly spends the founder's decision on a temporary condition,
 * and there is nothing to restore it when the stock returns.
 */
export function masterVariant(product: CatalogueProduct): CatalogueVariant | undefined {
  const chosen = product.variants.find((v) => v.id === product.defaultVariantId)
  if (chosen?.available) return chosen
  return product.variants.find((v) => v.available) ?? chosen ?? product.variants[0]
}

/**
 * What changes when a founder makes a different SKU the master.
 *
 * Everything product-level that describes ONE unit follows the master, because
 * that is what "master" means: the price on the card, the photograph, the cost
 * the margin is read off, and the serving count that sizes a subscription. Each
 * only moves when the new master actually knows its own — a variant with no
 * picture of its own must not blank the product's.
 *
 * Returns null when there is nothing to do, so a caller can skip the write.
 */
export function masterPatch(
  product: CatalogueProduct,
  variantId: string,
): Partial<CatalogueProduct> | null {
  const next = product.variants.find((v) => v.id === variantId)
  if (!next) return null

  const patch: Partial<CatalogueProduct> = { defaultVariantId: next.id }
  if (next.price > 0) patch.basePrice = next.price
  patch.compareAtPrice = next.compareAtPrice ?? null
  if (next.imageUrl) patch.imageUrl = next.imageUrl
  if (next.servings != null && next.servings > 0) patch.servings = next.servings
  if (next.cost != null && next.cost > 0) patch.cost = next.cost

  const unchanged =
    product.defaultVariantId === next.id &&
    (patch.basePrice === undefined || product.basePrice === patch.basePrice) &&
    (product.compareAtPrice ?? null) === (patch.compareAtPrice ?? null) &&
    (patch.imageUrl === undefined || product.imageUrl === patch.imageUrl) &&
    (patch.servings === undefined || product.servings === patch.servings) &&
    (patch.cost === undefined || product.cost === patch.cost)

  return unchanged ? null : patch
}
