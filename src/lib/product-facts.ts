import type { CatalogueProduct, DietaryTag } from '@/lib/catalogue/types'
import { effectOnsetForProduct, onsetWindowLabel } from '@/lib/feedback'

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
  if (f.includes('powder')) return { glyph: 'shaker', label: 'Powder' }
  if (f.includes('capsule')) return { glyph: 'capsule', label: 'Capsules' }
  if (f.includes('tablet')) return { glyph: 'hexagon', label: 'Tablets' }
  if (f.includes('liquid') || f.includes('drink')) return { glyph: 'droplet', label: 'Liquid' }
  if (f.includes('gummy') || f.includes('chew')) return { glyph: 'diamond', label: 'Gummies' }
  if (f.includes('bar')) return { glyph: 'bar', label: 'Bar' }
  const label = formats[0] ? formats[0][0].toUpperCase() + formats[0].slice(1) : 'Mixed'
  return { glyph: 'capsule', label }
}

/** The three headline facts: format, servings per unit, when you'll feel it. */
export function productFacts(product: CatalogueProduct): ProductFact[] {
  const format = formatFact(product.formats)
  return [
    { key: 'format', glyph: format.glyph, label: 'Format', value: format.label },
    { key: 'servings', glyph: 'bar', label: 'Per unit', value: `${product.servings} servings` },
    { key: 'onset', glyph: 'clock', label: "You'll feel it", value: onsetWindowLabel(effectOnsetForProduct(product)) },
  ]
}

/** Dietary chips (labelled) for a product. */
export function productDietary(product: CatalogueProduct): string[] {
  return product.dietaryTags.filter((t) => t in DIETARY_LABEL).map((t) => DIETARY_LABEL[t])
}
