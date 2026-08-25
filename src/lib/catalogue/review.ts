/**
 * Import review — what a founder confirms before a supplier product goes live.
 *
 * An imported product is assembled from three sources that look identical once
 * they are in the same object: what PowerBody actually sent, what our own rules
 * computed, and what a language model wrote. The third kind is the reason this
 * exists. `autopopulate` gates copy against `APPROVED_CLAIMS` so a model cannot
 * invent a health claim, but a gate is not a substitute for someone looking:
 * the model still picks the stack slots, goals and dietary tags that decide who
 * gets recommended the product, and none of that is claim-gated.
 *
 * So imports land as `pending` — held out of the shop and the quiz — carrying a
 * record of where each field came from, and a founder walks the fields that were
 * not simply copied from the supplier before the product can be sold.
 *
 * Pure: no I/O, so the rules are testable without a database or a supplier.
 */
import type { CatalogueProduct, FieldSource, ProductReview } from './types'

/**
 * Fields taken straight from the PowerBody feed — and which the enrichment step
 * must therefore never overwrite.
 *
 * This is load-bearing, not bookkeeping. The classifier fills in `cost` and
 * `servings` for products that have neither (the sample catalogue), estimating
 * cost from the shelf price. Spread over an imported product it replaced the
 * real wholesale price with a guess — a £20.00 cost silently became £21.99 —
 * and every margin figure in the hub was then computed from a number PowerBody
 * never sent. What the supplier actually said wins.
 */
const SUPPLIER_FIELDS = [
  'title',
  'description',
  'imageUrl',
  'category',
  'variants',
  'cost',
  'weightGrams',
  'vatRate',
  'supplierRrp',
  'compareAtPrice',
  'servings',
] as const

/** Fields one of our own rules computes. */
const RULE_FIELDS = ['basePrice', 'handle', 'id', 'defaultVariantId'] as const

/**
 * Fields the classifier decides — by keyword, or by model when one is
 * configured. These drive who the quiz recommends the product to, so they are
 * the ones most worth a second pair of eyes.
 */
const CLASSIFIED_FIELDS = [
  'stackSlots',
  'goals',
  'dietaryTags',
  'formats',
  'swapGroup',
  'hasStimulants',
  'consumption',
  'isCoreEligible',
  'shortReason',
  'effectOnset',
  'warnings',
] as const

/** The order the review screen walks fields in, with what to call them. */
export interface ReviewField {
  key: keyof CatalogueProduct
  label: string
  /** How to render/edit it. */
  kind: 'text' | 'longtext' | 'image' | 'money' | 'list' | 'boolean' | 'readonly'
  /** Why this field matters, shown under it. */
  note?: string
}

export const REVIEW_FIELDS: ReviewField[] = [
  { key: 'imageUrl', label: 'Image', kind: 'image', note: 'From PowerBody. Blank means they sent none.' },
  { key: 'title', label: 'Title', kind: 'text', note: 'What the shop and quiz call it.' },
  { key: 'description', label: 'Description', kind: 'longtext' },
  { key: 'category', label: 'Category', kind: 'text' },
  { key: 'cost', label: 'What we pay', kind: 'money', note: 'PowerBody’s wholesale price.' },
  { key: 'basePrice', label: 'What we charge', kind: 'money', note: 'Cost × 2, rounded to .99. Change it here if this one should differ.' },
  { key: 'servings', label: 'Servings per unit', kind: 'text', note: 'Sizes the monthly subscription.' },
  { key: 'weightGrams', label: 'Shipped weight (g)', kind: 'text', note: 'Sets the delivery band, so it moves the margin.' },
  { key: 'stackSlots', label: 'Stack slots', kind: 'list', note: 'Which part of a stack this can fill. Decides who gets recommended it.' },
  { key: 'goals', label: 'Goals', kind: 'list' },
  { key: 'dietaryTags', label: 'Dietary tags', kind: 'list', note: 'Wrong here means someone is sold something they can’t take.' },
  { key: 'formats', label: 'Formats', kind: 'list' },
  { key: 'swapGroup', label: 'Swap group', kind: 'text', note: 'What this is interchangeable with.' },
  { key: 'hasStimulants', label: 'Contains stimulants', kind: 'boolean' },
  { key: 'shortReason', label: 'Card copy', kind: 'longtext', note: 'Claim-gated, but still machine-written. Read it.' },
  { key: 'warnings', label: 'Warnings', kind: 'list' },
]

/**
 * Drop anything from an enrichment patch that the supplier already answered.
 *
 * The classifier is written for products that arrive with gaps, so it happily
 * supplies a cost and a serving count. On an imported product those are facts,
 * not gaps, and a guess must never overwrite a fact.
 */
export function withoutSupplierOwned(patch: Partial<CatalogueProduct>): Partial<CatalogueProduct> {
  const owned = new Set<string>([...SUPPLIER_FIELDS, ...RULE_FIELDS])
  return Object.fromEntries(Object.entries(patch).filter(([key]) => !owned.has(key)))
}

/**
 * Empty in the sense the fill step means it: nothing there to overwrite.
 *
 * `swapGroup: 'general'` is checked BEFORE the string case and counts as blank,
 * because "general" is the engine's way of saying it does not know — a product
 * left there gets no swap alternatives and no targeted scoring, so it is a gap
 * wearing a value's clothes. Order matters: behind the string test that case
 * never fires.
 */
export function isBlankValue(key: string, value: unknown): boolean {
  if (value === null || value === undefined) return true
  if (key === 'swapGroup') return value === 'general'
  if (typeof value === 'string') return value.trim() === ''
  if (Array.isArray(value)) return value.length === 0
  return false
}

/**
 * The review fields that are empty AND that a machine is allowed to fill.
 *
 * Supplier- and rule-owned fields are excluded for the same reason
 * `withoutSupplierOwned` excludes them: a blank cost is PowerBody's silence, not
 * an invitation to guess a wholesale price. What is left is the judgement —
 * slots, goals, group, copy — which is exactly what the classifier is for.
 */
export function blankFillableFields(product: CatalogueProduct): ReviewField[] {
  const owned = new Set<string>([...SUPPLIER_FIELDS, ...RULE_FIELDS])
  return REVIEW_FIELDS.filter(
    (field) => !owned.has(field.key as string) && isBlankValue(field.key as string, product[field.key]),
  )
}

/**
 * Provenance for a freshly imported product.
 *
 * `aiFields` are the keys the autopopulate step actually wrote, and `aiUsed`
 * says whether a model or the keyword fallback produced them — a heuristic
 * result is deterministic and worth flagging differently, because it cannot
 * hallucinate but is often blunt.
 */
export function sourcesForImport(
  aiFields: readonly string[],
  aiUsed: boolean,
): Partial<Record<keyof CatalogueProduct, FieldSource>> {
  const sources: Partial<Record<keyof CatalogueProduct, FieldSource>> = {}
  for (const key of SUPPLIER_FIELDS) sources[key] = 'supplier'
  for (const key of RULE_FIELDS) sources[key] = 'rule'
  for (const key of CLASSIFIED_FIELDS) sources[key] = 'heuristic'
  // Whatever autopopulate actually wrote wins over the defaults above.
  for (const key of aiFields) {
    sources[key as keyof CatalogueProduct] = aiUsed ? 'ai' : 'heuristic'
  }
  return sources
}

/** A product as it should be stored the moment it is imported: not yet sellable. */
export function asPendingReview(
  product: CatalogueProduct,
  sources: Partial<Record<keyof CatalogueProduct, FieldSource>>,
  now = new Date().toISOString(),
): CatalogueProduct {
  return { ...product, review: { status: 'pending', sources, confirmed: [], importedAt: now } }
}

/** True while a product is waiting to be reviewed — the test the shop uses. */
export function isPendingReview(product: CatalogueProduct): boolean {
  return product.review?.status === 'pending'
}

/**
 * The fields a founder still has to look at.
 *
 * Supplier fields are excluded on purpose: they are a faithful copy of what
 * PowerBody sent, and asking someone to tick 11 of those to get to the two that
 * a machine wrote is how a review becomes a rubber stamp. What is left is
 * everything a rule or a model decided.
 */
export function fieldsNeedingReview(product: CatalogueProduct): ReviewField[] {
  const sources = product.review?.sources ?? {}
  const confirmed = new Set(product.review?.confirmed ?? [])
  return REVIEW_FIELDS.filter((field) => {
    const source = sources[field.key]
    if (source === 'supplier' || source === 'founder') return false
    return !confirmed.has(field.key as string)
  })
}

/** Everything that needed checking has been checked. */
export function isReviewComplete(product: CatalogueProduct): boolean {
  return fieldsNeedingReview(product).length === 0
}

/** Mark fields as confirmed (and re-source edited ones to the founder). */
export function withConfirmed(
  product: CatalogueProduct,
  keys: string[],
  edited: string[] = [],
): CatalogueProduct {
  const review = product.review
  if (!review) return product
  const confirmed = new Set([...review.confirmed, ...keys])
  const sources = { ...review.sources }
  for (const key of edited) sources[key as keyof CatalogueProduct] = 'founder'
  return { ...product, review: { ...review, confirmed: [...confirmed], sources } }
}

/** Approve a product: it becomes sellable from this moment. */
export function approved(product: CatalogueProduct, by?: string, now = new Date().toISOString()): CatalogueProduct {
  const review = product.review ?? { status: 'pending' as const, sources: {}, confirmed: [], importedAt: now }
  return {
    ...product,
    review: {
      ...review,
      status: 'approved',
      // Approving is itself a confirmation of everything on the screen.
      confirmed: [...new Set([...review.confirmed, ...REVIEW_FIELDS.map((f) => f.key as string)])],
      approvedAt: now,
      ...(by ? { approvedBy: by } : {}),
    },
  }
}
