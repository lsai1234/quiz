/**
 * Combining supplier products into one product with variants.
 *
 * PowerBody have no concept of a variant: every flavour and every size is its
 * own SKU with its own name. Imported one at a time, "Whey 1kg Chocolate" and
 * "Whey 1kg Vanilla" become two unrelated products, and a customer is offered
 * the same tub twice instead of one product with a flavour picker.
 *
 * Everything downstream is already built for the grouped shape — order lines
 * take `variant.sku`, the daily sync applies stock per variant and rolls
 * availability up, the shop and Pour Plan both render a flavour/size picker.
 * The only missing step was saying "these SKUs are one product", which is what
 * this does.
 *
 * WHY SIZES ARE REFUSED
 * ─────────────────────
 * `CatalogueVariant` carries a price and a SKU, and nothing else commercial:
 * cost, servings and shipped weight live on the PRODUCT. That is fine for
 * flavours of one tub, which share all three. It is wrong for sizes — a 2.27kg
 * tub costs more, holds more servings and ships in a heavier band than a 1kg
 * one. Merging them would quietly attach the first size's economics to all of
 * them, and every margin, subscription quantity and delivery estimate for the
 * others would be wrong. So a merge that would do that is refused, by name,
 * rather than half-supported.
 *
 * Pure: no I/O, so the rules are testable without a database or a supplier.
 */
import type { CatalogueProduct, CatalogueVariant } from './types'

function slugify(s: string): string {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

/** Supplier SKUs a product resolves to — how it maps back to PowerBody. */
export function skusOf(product: CatalogueProduct): string[] {
  return product.variants.map((v) => v.sku).filter((s): s is string => Boolean(s))
}

export type MergeCheck = { ok: true } | { ok: false; reason: string }

const money = (n: number | undefined | null) => (typeof n === 'number' ? `£${n.toFixed(2)}` : 'unknown')

/**
 * Whether these products can honestly become one.
 *
 * The checks are about what the variant model can actually carry, not about
 * taste — merging two unrelated products is a founder's mistake to make, and
 * they are looking at both titles when they do it.
 */
export function canMerge(products: CatalogueProduct[]): MergeCheck {
  if (products.length < 2) return { ok: false, reason: 'Pick at least two products to combine.' }

  const withoutSku = products.filter((p) => skusOf(p).length === 0)
  if (withoutSku.length > 0) {
    return {
      ok: false,
      reason: `${withoutSku[0].title} has no supplier SKU, so it could not be ordered as a variant.`,
    }
  }

  const [first, ...rest] = products

  const differingCost = rest.find((p) => (p.cost ?? null) !== (first.cost ?? null))
  if (differingCost) {
    return {
      ok: false,
      reason:
        `These cost different amounts (${money(first.cost)} vs ${money(differingCost.cost)}), so they are different ` +
        'sizes rather than flavours. A variant carries its own price and SKU but not its own cost, servings or ' +
        'weight — combining them would price and ship every size as if it were the first. Keep them as separate ' +
        'products.',
    }
  }

  const differingServings = rest.find((p) => p.servings !== first.servings)
  if (differingServings) {
    return {
      ok: false,
      reason:
        `These hold different numbers of servings (${first.servings} vs ${differingServings.servings}), which sizes ` +
        'the monthly subscription. Combining them would size every one off the first. Keep them as separate products.',
    }
  }

  const differingWeight = rest.find((p) => (p.weightGrams ?? null) !== (first.weightGrams ?? null))
  if (differingWeight) {
    return {
      ok: false,
      reason:
        'These ship at different weights, and PowerBody charge delivery by weight band — combining them would cost ' +
        'the wrong postage on all but one. Keep them as separate products.',
    }
  }

  return { ok: true }
}

/**
 * The longest leading run of whole words every title shares.
 *
 * "Whey Protein 1kg Chocolate" + "Whey Protein 1kg Vanilla" → "Whey Protein 1kg",
 * which is both the product's real name and the thing to strip off each title to
 * get its variant label. Whole words only: a character-wise prefix would happily
 * cut "Vanil" out of "Vanilla" and call it a name.
 */
export function commonTitlePrefix(titles: string[]): string {
  if (titles.length === 0) return ''
  const wordLists = titles.map((t) => t.trim().split(/\s+/))
  const shortest = Math.min(...wordLists.map((w) => w.length))
  const prefix: string[] = []
  for (let i = 0; i < shortest; i++) {
    const word = wordLists[0][i]
    if (!wordLists.every((words) => words[i].toLowerCase() === word.toLowerCase())) break
    prefix.push(word)
  }
  // Never let the prefix eat a whole title — that would leave a variant with no
  // label at all.
  if (prefix.length === shortest) prefix.pop()
  return prefix.join(' ')
}

/** What to call one product's variant once it is part of a group. */
export function variantLabelFor(title: string, prefix: string): string {
  if (!prefix) return title
  const rest = title.trim().slice(prefix.length).trim()
  // Tidy the join left behind by stripping the prefix: "Whey 1kg - Vanilla".
  return rest.replace(/^[-–—:,/|]+\s*/, '').trim() || title
}

export interface MergeOptions {
  /** Overrides the derived name for the combined product. */
  title?: string
  /** Which product's descriptive fields to keep. Defaults to the first. */
  primaryId?: string
  /** Treat the labels as sizes rather than flavours (display only). */
  as?: 'flavour' | 'size'
}

/**
 * Combine products into one, each contributing its variants.
 *
 * Every variant keeps its OWN supplier SKU, which is what makes the result
 * orderable: `submitOrderToSupplier` sends `variant.sku` per line, and the daily
 * sync reads stock per variant SKU and rolls availability up to the product.
 *
 * Call `canMerge` first — this assumes it passed.
 */
export function mergeProducts(products: CatalogueProduct[], options: MergeOptions = {}): CatalogueProduct {
  const primary = products.find((p) => p.id === options.primaryId) ?? products[0]
  const prefix = commonTitlePrefix(products.map((p) => p.title))
  const title = options.title?.trim() || prefix || primary.title
  const id = slugify(title) || primary.id
  const as = options.as ?? 'flavour'

  const seen = new Set<string>()
  const variants: CatalogueVariant[] = []
  for (const product of products) {
    const label = variantLabelFor(product.title, prefix)
    for (const variant of product.variants) {
      // A product that already had flavours keeps them, qualified by its own
      // label, so combining two multi-flavour products doesn't collapse them.
      const ownLabel = product.variants.length > 1 && variant.flavour ? `${label} ${variant.flavour}`.trim() : label
      let variantId = `${id}-${slugify(ownLabel)}`
      // Ids have to stay unique even when two sources produce the same label.
      if (seen.has(variantId)) variantId = `${variantId}-${slugify(variant.sku ?? String(seen.size))}`
      seen.add(variantId)
      variants.push({
        ...variant,
        id: variantId,
        title: ownLabel,
        flavour: as === 'flavour' ? ownLabel : variant.flavour,
        size: as === 'size' ? ownLabel : variant.size,
      })
    }
  }

  return {
    ...primary,
    id,
    handle: id,
    title,
    variants,
    // Point at something buyable, not at whichever flavour happens to be first.
    defaultVariantId: variants.find((v) => v.available)?.id ?? variants[0]?.id ?? null,
  }
}
