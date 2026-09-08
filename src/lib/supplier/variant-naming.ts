/**
 * Naming a product and its flavours from the same comparison.
 *
 * A flavour is what a set of sibling SKUs do NOT share; the product is what they
 * do. Import used only the first half of that — it took the row's MAIN sku's
 * name for the whole product, and a main sku is one flavour of it — so a
 * four-flavour hydration powder went on the shelf like this:
 *
 *   Hydration+, Blue Raspberry - 240 grams        ← the product
 *     ├ Hydration+                                ← the product's name, on a variant
 *     ├ Hydration+, Lemon & Lime - 240 grams
 *     └ Hydration+, Tropical Vibes - 240 grams
 *
 * The two ends swapped over. Both are repaired from one set of supplier names,
 * which is why they live in one function.
 *
 * Pure: no network, no database. The route (`api/portal/products/
 * repair-variants`) fetches the names and this decides what to do with them.
 */
import type { CatalogueProduct, CatalogueVariant } from '@/lib/catalogue/types'
import { variantLabels, looksLikeSku, titleFromSiblings, commonProductName } from './variant-labels'

/** What a source knows about one SKU. */
export interface SupplierName {
  name: string
  /** The supplier's own flavour field. Present far less often than the name. */
  flavour: string | null
}

/**
 * Does this product's title look like one of its own flavours?
 *
 * The tell, and it needs no supplier call to see: the variants share an opening
 * — "Hydration+" — and the product's title starts with that same opening and
 * then keeps going. A product is what its flavours have in common; a title that
 * is the common part PLUS something else is one of the flavours wearing the
 * product's hat.
 *
 * A SUSPICION, not a verdict. A product legitimately called "Whey Protein
 * Professional" whose flavours share "Whey Protein" trips this, and `relabel`
 * then declines to rename it because the title is not one of the supplier's own
 * names. That asymmetry is deliberate: this decides what to LOOK at, and
 * `titleFromSiblings` decides what to CHANGE, and the second is the strict one
 * because it is the one that overwrites a founder's wording.
 */
export function titleLooksLikeAFlavour(product: CatalogueProduct): boolean {
  if (product.variants.length < 2) return false
  const shared = commonProductName(product.variants.map((v) => v.title))
  if (!shared) return false
  const title = product.title.trim()
  return title.toLowerCase().startsWith(shared.toLowerCase()) && title.length > shared.length
}

/** The variants of a product that still carry a raw code as their title. */
export function brokenSkus(product: CatalogueProduct): string[] {
  if (product.variants.length < 2) return []
  return product.variants
    .filter((v) => v.sku && looksLikeSku(v.title))
    .map((v) => v.sku as string)
}

/**
 * Re-label a product's variants from supplier names, keeping everything else.
 *
 * Returns null when nothing changed, so a caller can skip the write rather than
 * rewriting a hundred identical rows.
 */
export function relabel(
  product: CatalogueProduct,
  names: Map<string, SupplierName>,
  force: boolean,
): { product: CatalogueProduct; fixed: Record<string, string>; unresolved: string[]; renamedTo?: string } | null {
  /* Which variants this run is allowed to touch. */
  const rewritable = (v: CatalogueVariant) => force || looksLikeSku(v.title)

  const labels = variantLabels(
    product.variants.map((v) => {
      const found = names.get(v.sku ?? '')
      return {
        sku: v.sku ?? v.id,
        // A title we are not rewriting is a name somebody is happy with — feed
        // it back in so it takes part in working out the common prefix, and so
        // it survives untouched.
        name: rewritable(v) ? (found?.name ?? null) : v.title,
        flavour: rewritable(v) ? (found?.flavour ?? null) : null,
      }
    }),
  )

  const fixed: Record<string, string> = {}
  const unresolved: string[] = []
  const variants: CatalogueVariant[] = product.variants.map((v, i) => {
    const label = labels[i]
    if (!rewritable(v)) return v
    if (!label.named) {
      unresolved.push(v.sku ?? v.id)
      return v
    }
    // Nothing to report when the label it would write is the one already there.
    if (v.title === label.label && v.flavour === label.label) return v
    fixed[v.sku ?? v.id] = label.label
    return { ...v, title: label.label, flavour: label.label }
  })

  /*
    …and the other half of the same comparison: the product's own name.

    A flavour is what the siblings do NOT share; the product is what they do.
    Import used only the first half and took the row's MAIN sku's name for the
    whole product — so a four-flavour hydration powder was called "Hydration+,
    Blue Raspberry - 240 grams" with "Hydration+" sitting under it as a flavour.

    `titleFromSiblings` is deliberately narrow: it acts only when the current
    title IS one of the supplier's names, so a title somebody wrote is never
    touched. The HANDLE is left alone whatever happens — it is the product's
    URL, and every link anyone has to it.
  */
  const renamedTo =
    titleFromSiblings(
      product.title,
      product.variants.map((v) => names.get(v.sku ?? '')?.name ?? v.title),
    ) ?? undefined

  if (Object.keys(fixed).length === 0 && !renamedTo) return null
  return {
    product: { ...product, variants, ...(renamedTo ? { title: renamedTo } : {}) },
    fixed,
    unresolved,
    ...(renamedTo ? { renamedTo } : {}),
  }
}

/** What a source knows about one SKU. */
export interface SupplierName {
  name: string
  /** The supplier's own flavour field. Present far less often than the name. */
  flavour: string | null
}
