import type { CatalogueProduct, CatalogueVariant, DietaryTag } from '@/lib/catalogue/types'
import { effectOnsetForProduct, onsetWindowLabel } from '@/lib/feedback'
import { isAccessory, servingsLabel } from '@/lib/catalogue/accessory'
import { servingsForVariant } from '@/lib/shop/per-serving'

/**
 * Presentation helpers for a product's key facts — the icon-led grid shown in
 * the Act 4 detail sheet and (from S4) the shop product sheet. Kept claim-safe:
 * format, serving count, and when a benefit becomes noticeable, never a promised
 * result.
 */

export interface ProductFact {
  key: string
  /** QuizIcon glyph name. */
  glyph: string
  label: string
  value: string
}

export const DIETARY_LABEL: Record<DietaryTag, string> = {
  vegan: 'Vegan',
  vegetarian: 'Vegetarian',
  'gluten-free': 'Gluten-free',
  'dairy-free': 'Dairy-free',
  'nut-free': 'Nut-free',
  halal: 'Halal',
  'keto-friendly': 'Keto-friendly',
}

/** A physical format → glyph + label for the facts grid. */
export function formatFact(formats: string[]): { glyph: string; label: string } {
  const f = (formats[0] ?? '').toLowerCase()
  // Before powder, because an accessory imported before the accessory rule
  // existed carries the default format and would otherwise call a shaker a
  // powder — on the one product where the format is the whole description.
  if (f.includes('accessor') || f.includes('shaker') || f.includes('bottle')) return { glyph: 'shaker', label: 'Accessory' }
  if (f.includes('powder')) return { glyph: 'shaker', label: 'Powder' }
  if (f.includes('capsule')) return { glyph: 'capsule', label: 'Capsules' }
  if (f.includes('tablet')) return { glyph: 'hexagon', label: 'Tablets' }
  if (f.includes('liquid') || f.includes('drink')) return { glyph: 'droplet', label: 'Liquid' }
  if (f.includes('gummy') || f.includes('chew')) return { glyph: 'diamond', label: 'Gummies' }
  if (f.includes('bar')) return { glyph: 'bar', label: 'Bar' }
  const label = formats[0] ? formats[0][0].toUpperCase() + formats[0].slice(1) : 'Mixed'
  return { glyph: 'capsule', label }
}

/**
 * The three headline facts: format, servings per unit, when you'll feel it.
 *
 * `variant` is the one the shopper is looking at. It matters wherever a product
 * holds more than one size — the 454g glycine powder is 454 servings and the
 * 100-cap bottle is 33, and printing the product's single number under both is
 * wrong about one of them however it is rounded.
 *
 * An accessory gets ONE fact. It has no dose, so it has no servings, and there
 * is nothing to feel: "you'll feel it within a few weeks" under a shaker is a
 * claim about a plastic bottle. What is left is what it is.
 */
export function productFacts(product: CatalogueProduct, variant?: CatalogueVariant): ProductFact[] {
  const format = formatFact(product.formats)
  const formatFactEntry = { key: 'format', glyph: format.glyph, label: 'Format', value: format.label }
  if (isAccessory(product)) return [formatFactEntry]

  const servings = variant ? servingsForVariant(product, variant) : product.servings
  return [
    formatFactEntry,
    ...(servings != null && servings > 0
      ? [{ key: 'servings', glyph: 'bar', label: 'Per unit', value: servingsLabel(servings) }]
      : []),
    { key: 'onset', glyph: 'clock', label: "You'll feel it", value: onsetWindowLabel(effectOnsetForProduct(product)) },
  ]
}

/** Dietary chips (labelled) for a product. */
export function productDietary(product: CatalogueProduct): string[] {
  return product.dietaryTags.filter((t) => t in DIETARY_LABEL).map((t) => DIETARY_LABEL[t])
}
