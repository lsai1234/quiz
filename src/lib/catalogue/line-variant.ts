import type { CatalogueProduct, CatalogueVariant } from './types'

/**
 * Which SKU a saved line (a subscription line, a basket line) means.
 *
 * Lines store a product id and a flavour LABEL — what the member saw — rather
 * than a SKU. Matching them back used to compare one spelling of the label
 * ("Chocolate"), while lines were written with another ("Chocolate · 1kg"), so
 * any product with both a flavour and a size never matched and every renewal
 * shipped the first flavour in stock. A rename, a split or a merge broke the
 * match the same way. This matches every spelling, then follows the notes a
 * moved or renamed SKU leaves behind (`formerly`), and only then falls back.
 *
 * Pure.
 */

/** Every way a SKU's label has been written on a saved line. */
export function labelsOf(v: Pick<CatalogueVariant, 'flavour' | 'size' | 'title'>): string[] {
  const joined = [v.flavour, v.size].filter(Boolean).join(' · ')
  return [...new Set([v.flavour || v.size || v.title, joined || v.title, v.title].filter((l): l is string => Boolean(l)))]
}

/** Record that `variant` was `before` on `productId` — for a rename, split or merge. */
export function rememberWhere(
  variant: CatalogueVariant,
  productId: string,
  before: Pick<CatalogueVariant, 'flavour' | 'size' | 'title'> = variant,
): CatalogueVariant {
  const labels = labelsOf(before)
  const formerly = [...(variant.formerly ?? [])]
  const existing = formerly.find((f) => f.productId === productId)
  if (existing) {
    const merged = [...new Set([...existing.labels, ...labels])]
    if (merged.length === existing.labels.length) return variant
    return { ...variant, formerly: formerly.map((f) => (f === existing ? { ...f, labels: merged } : f)) }
  }
  return { ...variant, formerly: [...formerly, { productId, labels }] }
}

/** Labels that changed between two versions of a product's SKUs, remembered on the new ones. */
export function rememberRenames(before: CatalogueProduct, after: CatalogueProduct): CatalogueProduct {
  let touched = false
  const variants = after.variants.map((v) => {
    const was = before.variants.find((x) => x.id === v.id)
    if (!was) return v
    const old = labelsOf(was)
    const now = labelsOf(v)
    if (old.every((l) => now.includes(l))) return v
    touched = true
    return rememberWhere(v, before.id, was)
  })
  return touched ? { ...after, variants } : after
}

export interface LineRef {
  productId: string
  variantTitle?: string | null
  sku?: string | null
  variantId?: string | null
}

export function variantForLine(
  line: LineRef,
  catalogue: CatalogueProduct[],
): { product: CatalogueProduct; variant: CatalogueVariant } | null {
  const label = (line.variantTitle ?? '').trim()

  // The SKU itself, when the line kept it — the one exact answer.
  if (line.sku) {
    let fallback: { product: CatalogueProduct; variant: CatalogueVariant } | null = null
    for (const product of catalogue) {
      const variant = product.variants.find((v) => v.sku === line.sku)
      if (!variant) continue
      if (product.id === line.productId) return { product, variant }
      fallback ??= { product, variant }
    }
    if (fallback) return fallback
  }

  const product = catalogue.find((p) => p.id === line.productId)
  if (product) {
    const byId = line.variantId ? product.variants.find((v) => v.id === line.variantId) : undefined
    if (byId) return { product, variant: byId }
    const byLabel = label ? product.variants.find((v) => labelsOf(v).includes(label)) : undefined
    if (byLabel) return { product, variant: byLabel }
  }

  // Renamed, split off, or merged into another product: follow its note.
  for (const p of catalogue) {
    for (const v of p.variants) {
      if (v.formerly?.some((f) => f.productId === line.productId && (!label || f.labels.includes(label)))) {
        return { product: p, variant: v }
      }
    }
  }

  // As before, for a line nothing above can place: something buyable.
  if (!product) return null
  const variant = product.variants.find((v) => v.available) ?? product.variants[0]
  return variant ? { product, variant } : null
}
