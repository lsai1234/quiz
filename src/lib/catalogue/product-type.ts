import type { CatalogueProduct, SwapGroup } from './types'
import { ACTIVE_NAMES, activeDisplayName } from '@/lib/results/phrases'

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
 * Some kinds' shelf names say what they are for ("Joint formula", "Night-time
 * blend", "Thermogenic", "Nootropic") or what they do ("Mass gainer", "Energy
 * gel"), and "probiotic" is itself treated as a health claim in the UK. Those
 * get a label for what is in them instead: the one active, by name, when a
 * product has exactly one we can name (`NAMED_BY_ACTIVE`), else "Blend" or the
 * plainest true word for the kind.
 */
export const PRODUCT_TYPE_LABELS: Record<SwapGroup, string> = {
  'protein-whey': 'Whey protein',
  'protein-plant': 'Plant protein',
  'protein-mass': 'Protein & carbs',
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
  'joint-support': 'Blend',
  'sleep-support': 'Blend',
  'fat-burner': 'Blend',
  adaptogen: 'Herbal extract',
  probiotic: 'Live cultures',
  greens: 'Greens powder',
  fibre: 'Fibre',
  menopause: 'Blend',
  'vitamin-c': 'Vitamin C',
  'protein-bar': 'Protein bar',
  nootropic: 'Supplement',
  'vitamin-b': 'B-complex',
  zma: 'ZMA',
  'energy-gel': 'Carb gel',
  accessory: 'Shaker',
  general: 'Supplement',
}

/** Kinds named for a purpose: a product with one nameable active is called by it. */
const NAMED_BY_ACTIVE: ReadonlySet<SwapGroup> = new Set<SwapGroup>([
  'joint-support', 'sleep-support', 'fat-burner', 'adaptogen', 'menopause', 'nootropic',
])

const capitalised = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

const VITAMIN = /^Vitamin [A-Z]\d{0,2}$/

/** Actives a label may name: the reviewed names, and vitamins. Never a raw stored name. */
const ACTIVE_LABELS: ReadonlySet<string> = new Set(Object.values(ACTIVE_NAMES).map(capitalised))

function activeLabel(product: Pick<CatalogueProduct, 'actives'>): string | null {
  const names = [...new Set((product.actives ?? []).map((a) => activeDisplayName(a.name)))]
  if (names.length !== 1 || !names[0]) return null
  const label = capitalised(names[0])
  return ACTIVE_LABELS.has(label) || VITAMIN.test(label) ? label : null
}

/**
 * The neutral type label for a product. A generic word when there is no
 * product to read (an id the catalogue no longer has) — never the slot title,
 * which is the benefit label this exists to replace.
 */
export function productTypeLabel(
  product: (Pick<CatalogueProduct, 'swapGroup'> & Partial<Pick<CatalogueProduct, 'actives'>>) | null | undefined,
): string {
  if (!product) return 'Supplement'
  if (NAMED_BY_ACTIVE.has(product.swapGroup)) {
    const byActive = activeLabel(product)
    if (byActive) return byActive
  }
  return PRODUCT_TYPE_LABELS[product.swapGroup] || 'Supplement'
}

/**
 * A type label as it reads mid-sentence: "Change your vitamin C", not "your
 * Vitamin C". Only a leading capital followed by a lower-case letter drops, so
 * "ZMA" and "B-complex" keep theirs.
 */
export function inSentence(label: string): string {
  return label.replace(/^[A-Z](?=[a-z])/, (c) => c.toLowerCase())
}

/**
 * Whether a stored label is one `productTypeLabel` can give. The share card
 * prints a row's category only then: cards saved before Phase 1 hold the slot
 * title there ("Immune Support"), which names a benefit.
 */
export function isProductTypeLabel(label: string): boolean {
  const l = label.trim().toLowerCase()
  return KNOWN_LABELS.has(l) || /^vitamin [a-z]\d{0,2}$/.test(l)
}

/** Every fixed and active label, lower-cased: stored cards vary in case ("Amino Acids"). */
const KNOWN_LABELS: ReadonlySet<string> = new Set(
  [...Object.values(PRODUCT_TYPE_LABELS), ...ACTIVE_LABELS].map((l) => l.toLowerCase()),
)
