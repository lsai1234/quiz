import type { CatalogueProduct, CatalogueVariant } from './types'
import { masterVariant } from './master'
import { normaliseSize } from './split'

/**
 * A serving count typed in the Hub, put where the shop will actually read it.
 *
 * ── The field that edited nothing ───────────────────────────────────────────
 * "Servings per unit" writes `product.servings`. The shop reads
 * `servingsForVariant`, which prefers the SELECTED SKU's own count — rightly,
 * because 100 capsules and a 454g bag of the same powder are 33 servings and
 * 454, and one product-level number cannot be true under both.
 *
 * So the moment a pull from PowerBody gave each SKU its own `portion_count`,
 * the product-level field stopped being read. A founder could type 20 into it,
 * press Save, watch it save, and see 12 in the shop for ever. That is the worst
 * shape a bug can take: the edit appears to work.
 *
 * ── What "this product is 20 servings" means ────────────────────────────────
 * It means the unit on the shelf is 20 servings — so it is written to every SKU
 * that IS that unit: the master, and every sibling of the same size. A sibling
 * of a DIFFERENT size is a different unit of sale (see `catalogue/split`) and
 * keeps its own count, because that is exactly the case the product-level
 * number cannot describe.
 *
 * Pure: no network, no database.
 */
export function spreadServings(
  product: CatalogueProduct,
  servings: number | null | undefined,
): CatalogueVariant[] | null {
  const master = masterVariant(product)
  if (!master) return null

  const key = normaliseSize(master.size)
  const value = servings != null && Number.isFinite(servings) && servings > 0 ? servings : null

  const variants = product.variants.map((v) => {
    if (normaliseSize(v.size) !== key) return v
    if ((v.servings ?? null) === value) return v
    if (value === null) {
      // Cleared rather than set to zero: `servings: 0` reads as a fact ("no
      // servings"), and what is meant is "we were never told".
      const { servings: _dropped, ...rest } = v
      return rest as CatalogueVariant
    }
    return { ...v, servings: value }
  })

  return variants.some((v, i) => v !== product.variants[i]) ? variants : null
}

/**
 * The serving count the SHOP is showing for this product.
 *
 * The master SKU's own count when it has one, and the product-level number
 * otherwise — the same precedence `servingsForVariant` uses, because this is
 * the figure on the shelf and there is no second opinion worth showing.
 *
 * The Hub's editor seeds from this and compares against it. Seeding from
 * `product.servings` instead is what made the last fix unreachable: on a
 * product whose SKUs said 12 and whose product-level field said 20, the box
 * opened on 20, so typing 20 changed nothing, so nothing was written, and the
 * shelf kept saying 12 for ever. A field that shows a number the shop does not
 * use cannot be corrected, because there is nothing visibly wrong with it.
 */
export function liveServings(product: CatalogueProduct): number {
  const own = masterVariant(product)?.servings
  return own != null && Number.isFinite(own) && own > 0 ? own : product.servings
}

/** How many SKUs a product-level serving count would apply to. */
export function servingsAppliesTo(product: CatalogueProduct): number {
  const master = masterVariant(product)
  if (!master) return 0
  const key = normaliseSize(master.size)
  return product.variants.filter((v) => normaliseSize(v.size) === key).length
}
