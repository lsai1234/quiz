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
import {
  variantLabels,
  looksLikeSku,
  titleFromSiblings,
  commonProductName,
  nameSwap,
  withoutProductName,
  sharedPackSuffix,
  withoutPackSuffix,
} from './variant-labels'

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

/**
 * Is one of the VARIANTS wearing the product's name?
 *
 * The other face of the same mix-up, and the one in front of you on the shelf:
 *
 *   Hydration+, Blue Raspberry - 240 grams
 *     ├ Hydration+                          ← this
 *     ├ Hydration+, Lemon & Lime - 240 grams
 *     └ Hydration+, Tropical Vibes - 240 grams
 *
 * "Hydration+" is what every flavour shares, so it cannot be what tells one
 * flavour from another. A variant labelled with it is not a flavour label at
 * all — it is the product's name that ended up on a row — and that is provable
 * from the labels alone, with no supplier call and no judgement.
 */
export function variantWearingTheProductName(product: CatalogueProduct): boolean {
  if (product.variants.length < 2) return false
  const shared = commonProductName(product.variants.map((v) => v.title))
  const title = product.title.trim().toLowerCase()
  return product.variants.some((v) => {
    const label = v.title.trim().toLowerCase()
    return (shared !== null && label === shared.toLowerCase()) || label === title
  })
}

/** Either end of the mix-up: the product wearing a flavour, or the reverse. */
export function namingLooksWrong(product: CatalogueProduct): boolean {
  return titleLooksLikeAFlavour(product) || variantWearingTheProductName(product)
}

/**
 * The SKUs a repair run has to ask the supplier about.
 *
 * Not just the ones showing a code. A product whose NAMES are muddled — the
 * title is a flavour, or a flavour is the title — can only be untangled by
 * comparing what the supplier calls every one of its SKUs, so all of them are
 * asked about. Getting this wrong was silent and total: the pass listed the
 * product, fetched nothing, compared the muddled titles with themselves, found
 * them consistent, and reported that there was nothing to do.
 */
export function skusToAsk(product: CatalogueProduct, force: boolean): string[] {
  const all = product.variants.map((v) => v.sku).filter((s): s is string => Boolean(s))
  if (force || namingLooksWrong(product)) return all
  return brokenSkus(product)
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
  /*
    Which variants this run is allowed to touch.

    Three things are provably not a label anybody chose, and each is safe to
    overwrite without `force`:

      · a raw supplier code, "P45757" — the original bug;
      · the supplier's own full name for that SKU, which is what a variant
        carries when nothing has ever shortened it;
      · the name every sibling shares, which cannot tell one flavour from
        another and is therefore the PRODUCT's name sitting on a row.

    Anything else is somebody's wording and is left alone — that is what makes
    the narrow pass safe to press, and it is the reason `force` still exists for
    the labels a person genuinely typed.
  */
  // Read from the supplier's names where we have them: a sibling somebody has
  // renamed by hand must not decide what the rest of them share.
  const shared = commonProductName(
    product.variants.map((v) => names.get(v.sku ?? '')?.name ?? v.title),
  )
  const rewritable = (v: CatalogueVariant) => {
    if (force || looksLikeSku(v.title)) return true
    const label = v.title.trim()
    if (shared && label.toLowerCase() === shared.toLowerCase()) return true
    return label === (names.get(v.sku ?? '')?.name ?? '').trim()
  }

  /*
    The diff runs over the SUPPLIER's names wherever we have them, whatever we
    then decide to write.

    It used to feed a kept label back in so it took part in working out the
    common prefix — which was right when names were only ever fetched for the
    SKUs showing a code, and is wrong now that a muddled product is asked about
    in full. One hand-named sibling ("Lemon Lime (house name)") shares nothing
    with "Hydration+, Tropical Vibes - 240 grams", so it dragged the common
    prefix to nothing and every OTHER flavour came out as its whole
    sixty-character name. Comparing the supplier's own set keeps the labels
    coherent; the write guard below is what keeps the founder's wording.
  */
  const labels = variantLabels(
    product.variants.map((v) => {
      const found = names.get(v.sku ?? '')
      return {
        sku: v.sku ?? v.id,
        name: found?.name ?? v.title,
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
      // The supplier's names where we have them, and the current labels where
      // we do not — the same fallback the labels use, so both halves of the
      // repair are reading the same set of names.
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

/**
 * Put a product's name and its flavours' names the right way round, from what
 * we already hold.
 *
 * ── Why this is not the repair above ────────────────────────────────────────
 * `relabel` asks PowerBody what each SKU is called and works from the answer.
 * That is right when the labels are missing or wrong, and it is useless for the
 * damage that is left AFTER a good import: names that are all present, all
 * correct as supplier names, and on the wrong rows.
 *
 *   Protein Bars, Caramel Chaos - 12 x 60g       ← the product
 *     ├ Protein Bars                             ← the product's name, on a row
 *     ├ Bars, Chocolate Chip Cookie Dough - …
 *     └ Protein Bars, Dark Chocolate Mint - …
 *
 * Nothing needs fetching to see that. The product's title opens with one of its
 * own rows' labels and then keeps going, so that row is wearing the product's
 * name and the title is carrying that row's flavour. Both halves are provable
 * from strings we hold, which is why this needs no network, cannot half-fail,
 * and can be run over the whole catalogue in one press.
 *
 * Two corrections, in order:
 *   1. the SWAP — the row wearing the name gives it up, and takes back the
 *      flavour the title was carrying;
 *   2. the TRIM — every other row that repeats the product's name loses it,
 *      because "Protein Bars, Dark Chocolate Mint" under a product called
 *      "Protein Bars" is the product's name printed twice and the flavour once.
 *
 * The trim runs whether or not the swap did: a product that was already named
 * correctly can still have rows repeating it.
 *
 * Null when there is nothing to do, so a sweep can skip the write.
 */
export function putNamesRightWayRound(
  product: CatalogueProduct,
): { title: string; variants: CatalogueVariant[]; swapped: string | null } | null {
  if (product.variants.length < 2) return null

  /*
    Which row is wearing the product's name.

    The master first when it is one of them. It usually is — it is the SKU whose
    supplier name became the title — and where two rows both open the title, the
    one the product presents itself as is the one the title came from.
  */
  const candidates = product.variants.filter((v) => nameSwap(product.title, v.title, v.size))
  const wearer =
    candidates.find((v) => v.id === product.defaultVariantId) ?? candidates[0] ?? null
  const swap = wearer ? nameSwap(product.title, wearer.title, wearer.size) : null

  const title = swap ? swap.title : product.title.trim()

  const trimmed = product.variants.map((v) =>
    v.id === wearer?.id && swap ? swap.label : withoutProductName(v.title, title, v.size),
  )
  /*
    …and the same argument applied to the other end.

    PowerBody's names routinely still carry the pack size after the flavour —
    "Caramel Chaos - 12 x 60g", "Fudged Up - 12 x 60g" — which every sibling
    shares and which therefore cannot tell one from another. It is printed
    beside the label anyway.

    Narrow on purpose: only a numeric pack spec after a spaced dash, and only
    when every label carries the SAME one. See `sharedPackSuffix` for what
    happens if you generalise this to "whatever they all end with".
  */
  const tail = sharedPackSuffix(trimmed)

  const variants = product.variants.map((v, i) => {
    const label = tail ? withoutPackSuffix(trimmed[i], tail) : trimmed[i]
    /*
      Untouched means UNTOUCHED, `flavour` included.

      A row still showing its raw code has `flavour: null` on purpose — it is
      the honest "we were never told", and it is what the supplier-driven
      repair looks for. Stamping the code into `flavour` because this pass
      happened to walk past would hide it from the pass that can fix it.
    */
    if (label === v.title) return v
    // The label and the flavour move together: the shop's picker reads
    // `flavour` and falls back to `title`, so setting one and not the other is
    // how a product ends up named two different things.
    return { ...v, title: label, flavour: label }
  })

  const changed = title !== product.title || variants.some((v, i) => v !== product.variants[i])
  return changed ? { title, variants, swapped: swap ? (wearer?.sku ?? wearer?.id ?? null) : null } : null
}
