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
import { liveServings } from '@/lib/catalogue/servings'

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
  /** PowerBody's id for this SKU, kept on the SKU so it is never searched for again. */
  productId?: string | null
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

    /*
      A price somebody typed is a decision, and `force` does not overrule it.

      `force` means "re-price every variant from its own cost", which is the
      right hammer for a product nobody has priced by hand and the wrong one for
      the product a founder priced against the market last week. The way off a
      manual price is the button that set it (`catalogue/price`), not a sweep
      that happens to pass over it. The cost below is still recorded either way:
      it is a fact, and the margin figures are read off it.
    */
    const priced = variant.priceSource === 'founder'

    if (reprice && !priced && fact.cost != null && fact.cost > 0) {
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

    /*
      A serving count somebody chose is a decision, the same as a price.

      Only two counts are PowerBody's to change: none at all, and one that came
      from PowerBody in the first place (`servingsSource: 'supplier'`). A count
      typed on the product page, spread by "servings for every 1kg SKU", or set
      by the roster sheet is the founder's — and so is one on an older record
      that says nothing about where it came from, because nothing here can tell
      that it was not typed. Replacing those is how a founder corrected 66 to
      60, pressed Pull for a picture, and watched the shelf go back to 66.

      An accessory has no dose, so it has no servings to be right about.
    */
    const ownCount = next.servings != null && next.servings > 0
    const theirsToChange = !ownCount || variant.servingsSource === 'supplier'
    if (!isAccessory(product) && theirsToChange && fact.servings != null && fact.servings > 0 && next.servings !== fact.servings) {
      notes.push(`${next.servings ?? product.servings} → ${fact.servings} servings`)
      next = { ...next, servings: fact.servings, servingsSource: 'supplier' }
    }

    // A size is what tells two rows apart in the picker when the supplier's
    // flavour column is empty — and it is empty more often than not.
    if (!next.size) {
      const size = sizeFromName(fact.name)
      if (size) next = { ...next, size }
    }

    // Only a real PowerBody id — numeric. The sample catalogue's ids look like
    // SKUs ("P89490"), and one stored here would be sent to PowerBody later by
    // the stock check, the nightly sync and the next pull. Import has always
    // refused them (`mapping.ts`); a pull is the same door.
    if (fact.productId && isPowerBodyId(fact.productId) && next.supplierProductId !== fact.productId) {
      next = { ...next, supplierProductId: fact.productId }
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

  const defaultVariant =
    variants.find((v) => v.id === product.defaultVariantId && v.available) ??
    variants.find((v) => v.available) ??
    variants[0]

  /*
    The product's own cost, RRP and PowerBody id follow its STORED master SKU.

    They are what the catalogue list, readiness and Top 25 read. A pull used to
    fill every SKU's cost and leave the product's at null, so the founder
    watched the costs arrive and every screen went on saying "no cost set".

    Stored, not "the first one in stock": that is the one rule every writer
    uses — the nightly stock sync (`sync.ts`) and an absorbed price change read
    the stored master too. This used to skip past an out-of-stock master, so a
    pull set Vanilla's cost, the night's sync put Chocolate's back and reported
    it as "cost moved", and the next pull flipped it again — margin figures and
    the Supplier moved report changing with nothing changing at PowerBody. Stock
    is a fact about today; which SKU the product IS is a decision.
  */
  const storedMaster = variants.find((v) => v.id === product.defaultVariantId) ?? variants[0]
  const masterFact = storedMaster?.sku ? facts.get(storedMaster.sku) : undefined
  const productCost = storedMaster?.cost != null && storedMaster.cost > 0 ? storedMaster.cost : product.cost
  const productRrp = masterFact?.rrp != null && masterFact.rrp > 0 ? round(masterFact.rrp) : product.supplierRrp
  const masterId = storedMaster?.supplierProductId
  const productId = masterId && isPowerBodyId(masterId) ? masterId : product.supplierProductId

  /*
    …and so does its serving count, with the plan behind it.

    `product.servings` is the master's own count wherever the master has one —
    what the shelf shows (`liveServings`) and what everything that reads the
    product sees. When this pass gave the master its first count, or refreshed
    one PowerBody gave, the product-level copy follows, and the subscription's
    `servingsPerUnit` follows too if it was following before (a number that
    differed was set on purpose, and is left alone) — the same rule an edit on
    the product page applies. Without it the shelf said 66 while the product
    and the plan went on saying 60.
  */
  const masterBefore = product.variants.find((v) => v.id === product.defaultVariantId) ?? product.variants[0]
  const masterCount = storedMaster?.servings
  const countMoved = masterCount != null && masterCount > 0 && masterCount !== masterBefore?.servings
  const productServings = countMoved ? masterCount : product.servings

  const variantsMoved = !variants.every((v, i) => v === product.variants[i])
  const productMoved =
    productCost !== product.cost ||
    (productRrp ?? null) !== (product.supplierRrp ?? null) ||
    (productId ?? null) !== (product.supplierProductId ?? null) ||
    productServings !== product.servings
  if (!variantsMoved && !productMoved) return null
  if (productCost !== product.cost && productCost != null) changed.cost = `product cost £${productCost.toFixed(2)}`

  const next: CatalogueProduct = {
    ...product,
    variants,
    // `basePrice` is what every summary quotes, so it follows the variant the
    // page opens on. Leaving it behind is how a product sheet and its own
    // card disagree about the price.
    basePrice: defaultVariant?.price ?? product.basePrice,
    compareAtPrice: defaultVariant?.compareAtPrice ?? product.compareAtPrice,
    servings: productServings,
    ...(productCost != null ? { cost: productCost } : {}),
    ...(productRrp != null ? { supplierRrp: productRrp } : {}),
    ...(productId ? { supplierProductId: productId } : {}),
  }
  return { product: followPlan(product, next), changed }
}

/**
 * Keep the subscription's serving count in step with the shelf's, when it was
 * in step before — the rule the product page's edits follow (`product-edit`),
 * so a pull that moves the count cannot leave the plan sizing a box off the
 * old one. A plan count that differed was set on purpose and is left alone.
 */
function followPlan(before: CatalogueProduct, after: CatalogueProduct): CatalogueProduct {
  const plan = after.consumption
  if (!plan) return after
  const was = liveServings(before)
  const now = liveServings(after)
  if (now === was || plan.servingsPerUnit !== was) return after
  return { ...after, consumption: { ...plan, servingsPerUnit: now } }
}

/** A real PowerBody product id: digits only. The sample catalogue's look like SKUs. */
export function isPowerBodyId(id: string | null | undefined): id is string {
  return typeof id === 'string' && /^\d+$/.test(id)
}


/**
 * As many products as fit in one batch, measured in SKUs.
 *
 * A batch is measured in SKUs rather than products because a SKU is what costs
 * a call: one product with eight flavours is eight requests, and three products
 * with two apiece is six. Measuring in products makes a batch's cost depend on
 * which products it happened to contain, which is how a pass that is fine on
 * Tuesday times out on Wednesday.
 *
 * Always returns at least one product. A product with more variants than the
 * whole budget would otherwise be skipped forever, and blocking the queue on
 * the one product that most needs repairing is the worst possible reading of a
 * limit that exists to keep things moving.
 */
export function sliceBySkuBudget<T extends { variants: Array<{ sku?: string | null }> }>(
  products: T[],
  budget: number,
): T[] {
  const slice: T[] = []
  let count = 0
  for (const product of products) {
    const skus = product.variants.filter((v) => v.sku).length
    if (slice.length > 0 && count + skus > budget) break
    slice.push(product)
    count += skus
    if (count >= budget) break
  }
  return slice
}
