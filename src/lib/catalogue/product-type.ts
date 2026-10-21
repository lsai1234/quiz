import type { CatalogueProduct, SwapGroup } from './types'

/**
 * What a product IS, in the words on a shelf label — the tag on a stack card.
 *
 * The cards used to carry the slot's title, and slot titles describe a job:
 * "Immune Support", "Sleep", "Recovery", "Stress Support". Under a product's
 * name that reads as a statement of what the product does for you, which is a
 * health claim the register does not authorise. A product type ("Vitamin C",
 * "Magnesium") says nothing about an effect.
 *
 * Read from the PRODUCT's swap group, not from the slot. The slot titles stay
 * as they are in the engine (they are part of the persona snapshots and of
 * what the founders see); this is only the label a customer is shown.
 *
 * A few groups have no neutral trade name — the product category is named for
 * its purpose ("Joint formula", "Menopause blend"). Those are the closest
 * plain category names in use on a shelf and are listed for review in the
 * Phase 1 summary.
 */
export const PRODUCT_TYPE_LABELS: Record<SwapGroup, string> = {
  'protein-whey': 'Whey protein',
  'protein-plant': 'Plant protein',
  'protein-mass': 'Mass gainer',
  'protein-clear': 'Clear protein',
  creatine: 'Creatine',
  'pre-workout-stim': 'Pre-workout',
  'pre-workout-stim-free': 'Stim-free pre-workout',
  aminos: 'Amino acids',
  electrolytes: 'Electrolytes',
  'omega-3': 'Omega-3',
  magnesium: 'Magnesium',
  'vitamin-d': 'Vitamin D',
  multivitamin: 'Multivitamin',
  collagen: 'Collagen',
  'joint-support': 'Joint formula',
  'sleep-support': 'Night-time blend',
  'fat-burner': 'Thermogenic',
  adaptogen: 'Ashwagandha',
  probiotic: 'Probiotic',
  greens: 'Greens powder',
  fibre: 'Fibre',
  menopause: 'Menopause blend',
  'vitamin-c': 'Vitamin C',
  'protein-bar': 'Protein bar',
  nootropic: 'Nootropic',
  'vitamin-b': 'B-complex',
  zma: 'ZMA',
  'energy-gel': 'Energy gel',
  accessory: 'Shaker',
  general: 'Supplement',
}

/**
 * The neutral type label for a product. A generic word when there is no
 * product to read (an id the catalogue no longer has) — never the slot title,
 * which is the benefit label this exists to replace.
 */
export function productTypeLabel(product: Pick<CatalogueProduct, 'swapGroup'> | null | undefined): string {
  return (product && PRODUCT_TYPE_LABELS[product.swapGroup]) || 'Supplement'
}
