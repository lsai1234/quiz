import type { CatalogueProduct, CatalogueVariant, DietaryTag } from '@/lib/catalogue/types'
import { isAccessory, servingsLabel } from '@/lib/catalogue/accessory'
import { formatPerServing, servingsForVariant } from '@/lib/shop/per-serving'

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
 * The headline facts: format and servings per unit. Never when you'll "feel
 * it": a felt-effect window says the product does something, an implied claim,
 * so it is gone from the shop as it is from the results page.
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
  ]
}

/** Dietary chips (labelled) for a product. */
export function productDietary(product: CatalogueProduct): string[] {
  return product.dietaryTags.filter((t) => t in DIETARY_LABEL).map((t) => DIETARY_LABEL[t])
}

// ─── Stack cards: what a pack holds, costs and lasts ─────────────────────────

/** A pack length rounded the way the last-chance card rounds it. */
function packLength(months: number): { n: number; unit: 'week' | 'month'; word: string } {
  if (months < 0.8) {
    const n = Math.max(1, Math.round(months * 4.3))
    return { n, unit: 'week', word: String(n) }
  }
  if (months < 1.25) return { n: 1, unit: 'month', word: 'a' }
  if (months < 1.75) return { n: 6, unit: 'week', word: 'six' }
  const n = Math.round(months)
  return { n, unit: 'month', word: ['', '', 'two', 'three', 'four', 'five', 'six'][n] ?? String(n) }
}

/**
 * How long one pack lasts, in words: "about a month", "about six weeks",
 * "about two months", "about 3 weeks". The wording and rounding of the
 * last-chance card's "What you get", so the two never disagree.
 */
export function packLengthLabel(months: number): string {
  const { n, unit, word } = packLength(months)
  return `about ${word} ${unit}${n === 1 ? '' : 's'}`
}

/** The same length in figures, for a narrow stat cell: "2 months", "6 weeks", "1 month". */
export function packLengthShort(months: number): string {
  const { n, unit } = packLength(months)
  return `${n} ${unit}${n === 1 ? '' : 's'}`
}

/** "Lasts about two months". */
export function lastsLabel(months: number): string {
  return `Lasts ${packLengthLabel(months)}`
}

/** "13p a serving" / "£1.17 a serving", in the shop's per-serving format. */
export function perServingLabel(perServing: number): string {
  return `${formatPerServing(perServing)} a serving`
}

/** The numbers behind a stack card, as `cardFacts` (lib/results/card-facts.ts) works them out. */
export interface PackNumbers {
  servings: number | null
  perServing: number | null
  packMonths: number | null
}

/**
 * The facts grid on the quiz results' detail sheet: format, servings in the
 * pack, cost per serving and how long it lasts. No onset fact (Phase 1).
 *
 * Unlike `productFacts`, the numbers are passed in, and a number that is not
 * known is left out rather than estimated. The shop sheet keeps `productFacts`.
 * `atYourUsage` adds "at your usage" to the pack length, for when it was
 * worked out from their answers.
 */
export function stackProductFacts(
  product: CatalogueProduct,
  numbers: PackNumbers,
  { atYourUsage = false }: { atYourUsage?: boolean } = {},
): ProductFact[] {
  const format = formatFact(product.formats)
  const facts: ProductFact[] = [{ key: 'format', glyph: format.glyph, label: 'Format', value: format.label }]
  if (isAccessory(product)) return facts
  const { servings, perServing, packMonths } = numbers
  if (servings != null && servings > 0) {
    facts.push({ key: 'servings', glyph: 'bar', label: 'Per unit', value: servingsLabel(servings) })
  }
  if (perServing != null && perServing > 0) {
    facts.push({ key: 'per-serving', glyph: 'credit-card', label: 'Cost per serving', value: formatPerServing(perServing) })
  }
  if (packMonths != null && packMonths > 0) {
    const length = packLengthLabel(packMonths)
    const value = `${length[0].toUpperCase()}${length.slice(1)}${atYourUsage ? ' at your usage' : ''}`
    facts.push({ key: 'lasts', glyph: 'calendar', label: 'Lasts', value })
  }
  return facts
}
