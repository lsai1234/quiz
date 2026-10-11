import type {
  CatalogueProduct,
  ConsumptionCadence,
  PourAnchor,
} from '@/lib/catalogue/types'
import {
  AS_NEEDED_TRIGGERS,
  DIETARY_TAGS,
  EFFECT_ONSETS,
  SAFETY_FLAGS,
  STACK_SLOTS,
  SWAP_GROUPS,
} from '@/lib/catalogue/types'
import { ALL_GOALS } from '@/lib/types'
import { MOCK_CATALOGUE } from '@/lib/catalogue/mock-catalogue'
import { applyPatch, type ProductPatch, type VariantEdit } from '@/lib/catalogue/patch'
import { masterPatch } from '@/lib/catalogue/master'
import { liveServings } from '@/lib/catalogue/servings'
import { rememberRenames } from '@/lib/catalogue/line-variant'
import { REVIEW_FIELDS, approved, fieldsNeedingReview, isReviewComplete, withConfirmed } from '@/lib/catalogue/review'
import { priceRows, type PriceRow } from '@/lib/catalogue/price'
import { getPricingConfig } from '@/lib/stack-blueprint/pricing'
import { productReadiness, type ProductReadiness } from './readiness'
import { productUsage, usageWarning, type ProductUsage } from './product-usage'
import { clearPersistCache } from './persist'
import { applyTopRanks } from './top-products'
import { getDataSource } from '@/lib/data-source'
import {
  applyProductOverrides,
  editStoredProduct,
  getPersistedProducts,
  syncPortalRuntime,
} from './store'

/**
 * The hub's one way to read and change a product.
 *
 * Every product a founder can see — on sale, waiting for review, or removed —
 * comes from `listEditableProducts`, and every change made on the product page
 * goes through `updateProduct`, which checks what it is given before anything
 * is written. One path is the point: the old screens each wrote products their
 * own way, and the ways disagreed (an override here, a whole record there), so
 * an edit made on one screen could be silently undone by another.
 */

export type ProductState = 'live' | 'pending' | 'removed'

export interface EditableEntry {
  product: CatalogueProduct
  state: ProductState
  /** Imported from the supplier (ours to rewrite) or the built-in sample catalogue. */
  storage: 'imported' | 'base'
}

/** Every product a founder can open, with where it stands. */
export async function listEditableProducts(): Promise<EditableEntry[]> {
  await syncPortalRuntime()
  const { overrides, removedIds, imported, topProductIds } = await getPersistedProducts()
  const removed = new Set(removedIds)
  const base = getDataSource() === 'real' ? [] : applyProductOverrides(MOCK_CATALOGUE as CatalogueProduct[], overrides)
  const importedIds = new Set(imported.map((p) => p.id))

  const entries: EditableEntry[] = [
    ...base.filter((p) => !importedIds.has(p.id)).map((product) => ({ product, storage: 'base' as const })),
    ...imported.map((product) => ({ product, storage: 'imported' as const })),
  ].map(({ product, storage }) => ({
    product,
    storage,
    state: removed.has(product.id) ? 'removed' : product.review?.status === 'pending' ? 'pending' : 'live',
  }))

  // Rank stamps only onto what is actually on sale, the way the shop sees it.
  const ranked = new Map(
    applyTopRanks(entries.filter((e) => e.state === 'live').map((e) => e.product), topProductIds ?? []).map((p) => [p.id, p]),
  )
  return entries.map((e) => (ranked.has(e.product.id) ? { ...e, product: ranked.get(e.product.id)! } : e))
}

export async function getEditableProduct(id: string): Promise<EditableEntry | undefined> {
  return (await listEditableProducts()).find((e) => e.product.id === id)
}

// ── What a change may contain ────────────────────────────────────────────────

/** What the product page sends. Every part optional. */
export interface ProductEdit {
  /** Product-level fields. `null` clears an optional one back to "auto". */
  set?: Record<string, unknown>
  /** Per-SKU edits, matched by id. */
  variants?: Array<Record<string, unknown>>
  /** Make this SKU the master: the price, picture, cost and servings follow it. */
  master?: string
  /** Review fields checked and left as they are. */
  confirm?: string[]
}

/** A change that was refused, with every reason (not just the first). */
export class EditRejected extends Error {
  constructor(readonly problems: string[]) {
    super(problems.join(' '))
    this.name = 'EditRejected'
  }
}

type Check = (value: unknown, label: string) => { ok: true; value: unknown } | { ok: false; problem: string }

const ok = (value: unknown) => ({ ok: true as const, value })
const bad = (problem: string) => ({ ok: false as const, problem })

const text = (required: boolean): Check => (v, label) => {
  if (typeof v !== 'string') return bad(`${label} must be text.`)
  const t = v.trim()
  if (required && !t) return bad(`${label} can’t be empty.`)
  return ok(t)
}
/** Optional text: blank clears it. */
const optionalText: Check = (v, label) => {
  if (v === null) return ok(null)
  if (typeof v !== 'string') return bad(`${label} must be text.`)
  return ok(v.trim() || null)
}
const number = (opts: { min?: number; max?: number; integer?: boolean; nullable?: boolean; zeroIsUnknown?: boolean }): Check =>
  (v, label) => {
    // Blank — including a box of spaces, which `Number` would read as 0: a VAT
    // rate of 0 is zero-rated, a 20% error on the margin, not "not set".
    if (v === null || (typeof v === 'string' && v.trim() === '')) return opts.nullable ? ok(null) : bad(`${label} needs a number.`)
    const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN
    if (!Number.isFinite(n)) return bad(`${label} must be a number.`)
    if (opts.zeroIsUnknown && n === 0) return ok(null)
    if (opts.min !== undefined && n < opts.min) return bad(`${label} must be at least ${opts.min}.`)
    if (opts.max !== undefined && n > opts.max) return bad(`${label} must be at most ${opts.max}.`)
    if (opts.integer && !Number.isInteger(n)) return bad(`${label} must be a whole number.`)
    return ok(n)
  }
const bool = (nullable: boolean): Check => (v, label) =>
  typeof v === 'boolean' ? ok(v) : v === null && nullable ? ok(null) : bad(`${label} must be yes or no.`)
const oneOf = (values: readonly string[], nullable: boolean): Check => (v, label) =>
  v === null && nullable ? ok(null) : typeof v === 'string' && values.includes(v) ? ok(v) : bad(`${label} can’t be “${String(v)}”.`)
const listOf = (values: readonly string[] | null): Check => (v, label) => {
  if (!Array.isArray(v)) return bad(`${label} must be a list.`)
  const items = v.map((x) => (typeof x === 'string' ? x.trim() : x)).filter((x) => x !== '')
  if (items.some((x) => typeof x !== 'string')) return bad(`${label} must be a list of words.`)
  const unknown = values ? items.filter((x) => !values.includes(x as string)) : []
  if (unknown.length > 0) return bad(`${label} can’t include ${unknown.map((u) => `“${u}”`).join(', ')}.`)
  return ok([...new Set(items as string[])])
}
const productId: Check = (v, label) => {
  if (v === null || v === '') return ok(null)
  const t = typeof v === 'number' ? String(v) : typeof v === 'string' ? v.trim() : ''
  return /^\d{1,12}$/.test(t) ? ok(t) : bad(`${label} must be PowerBody’s numeric product id.`)
}
const picture: Check = (v, label) => {
  if (v === null || v === '') return ok(null)
  if (typeof v !== 'string') return bad(`${label} must be a link.`)
  const t = v.trim()
  return /^(https?:\/\/|\/)/.test(t) ? ok(t) : bad(`${label} must be a web link (https://…) or an uploaded picture.`)
}

const CADENCES: ConsumptionCadence[] = ['daily', 'per-workout', 'as-needed']
const ANCHORS: PourAnchor[] = ['morning', 'midday', 'evening', 'pre-workout', 'post-workout', 'hot-days', 'wind-down', 'run-down']

const consumption: Check = (v, label) => {
  if (v === null) return ok(null)
  if (typeof v !== 'object' || Array.isArray(v)) return bad(`${label} is not in the right shape.`)
  const c = v as Record<string, unknown>
  if (!CADENCES.includes(c.cadence as ConsumptionCadence)) return bad(`${label}: choose how it is taken.`)
  const servings = Number(c.servingsPerUnit)
  if (!Number.isFinite(servings) || servings <= 0) return bad(`${label}: servings per unit must be above 0.`)
  const out: Record<string, unknown> = { cadence: c.cadence, servingsPerUnit: servings }
  if (c.daysPerWeek != null) {
    const d = Number(c.daysPerWeek)
    if (!Number.isInteger(d) || d < 1 || d > 7) return bad(`${label}: days a week must be 1 to 7.`)
    out.daysPerWeek = d
  }
  if (c.asNeededTrigger != null) {
    if (!AS_NEEDED_TRIGGERS.includes(c.asNeededTrigger as never)) return bad(`${label}: unknown trigger.`)
    out.asNeededTrigger = c.asNeededTrigger
  }
  if (c.anchor != null) {
    if (!ANCHORS.includes(c.anchor as PourAnchor)) return bad(`${label}: unknown time of day.`)
    out.anchor = c.anchor
  }
  return ok(out)
}
const actives: Check = (v, label) => {
  if (v === null) return ok(null)
  if (!Array.isArray(v)) return bad(`${label} must be a list.`)
  const out: Array<{ name: string; mg?: number }> = []
  for (const a of v) {
    const name = typeof a?.name === 'string' ? a.name.trim() : ''
    if (!name) continue
    const mg = a.mg === undefined || a.mg === null || a.mg === '' ? undefined : Number(a.mg)
    if (mg !== undefined && (!Number.isFinite(mg) || mg < 0)) return bad(`${label}: “${name}” needs a dose in mg, or none.`)
    out.push(mg === undefined ? { name } : { name, mg })
  }
  return ok(out)
}

/**
 * The product fields the hub may change, and how each is checked.
 *
 * Not here on purpose: `id` and `handle` (they are the product's address and
 * orders point at them), `variants` (edited by id below), `basePrice` and the
 * per-SKU prices (the price section owns them, with the founder/rule split),
 * `defaultVariantId` (that is `master`), `review` (approve/confirm), `topRank`
 * (the Top 25 page), `rating` (only real reviews may set it).
 */
const PRODUCT_FIELDS: Record<string, { label: string; check: Check }> = {
  title: { label: 'Name', check: text(true) },
  shortName: { label: 'Short name', check: optionalText },
  brand: { label: 'Brand', check: optionalText },
  description: { label: 'Description', check: text(false) },
  shortReason: { label: 'Card copy', check: text(false) },
  category: { label: 'Category', check: text(true) },
  imageUrl: { label: 'Picture', check: picture },
  stackSlots: { label: 'Stack slots', check: listOf(STACK_SLOTS) },
  goals: { label: 'Goals', check: listOf(ALL_GOALS) },
  dietaryTags: { label: 'Dietary tags', check: listOf(DIETARY_TAGS) },
  formats: { label: 'Formats', check: listOf(null) },
  warnings: { label: 'Warnings', check: listOf(null) },
  contraindications: { label: 'Not for', check: listOf(SAFETY_FLAGS) },
  actives: { label: 'Active ingredients', check: actives },
  swapGroup: { label: 'Swap group', check: oneOf(SWAP_GROUPS, false) },
  hasStimulants: { label: 'Contains stimulants', check: bool(false) },
  subscriptionEligible: { label: 'Subscription', check: bool(false) },
  isSubscriptionOnly: { label: 'Hidden refill product', check: bool(true) },
  subscriptionProductId: { label: 'Monthly refill product', check: optionalText },
  consumption: { label: 'How it is taken', check: consumption },
  minSubscriptionMonths: { label: 'Minimum term', check: number({ min: 1, max: 24, integer: true, nullable: true }) },
  recommendationBasis: { label: 'Keep-or-change advice', check: oneOf(['objective', 'subjective'], true) },
  effectOnset: { label: 'When it is felt', check: oneOf(EFFECT_ONSETS, true) },
  recommendationPriority: { label: 'Recommendation priority', check: number({ min: 1, max: 10, integer: true }) },
  marginPriority: { label: 'Margin priority', check: number({ min: 1, max: 10, integer: true }) },
  isCoreEligible: { label: 'Can be core', check: bool(false) },
  isBoosterEligible: { label: 'Can be a booster', check: bool(false) },
  restockingSoon: { label: 'Back in stock soon', check: bool(true) },
  cost: { label: 'What we pay', check: number({ min: 0, nullable: true, zeroIsUnknown: true }) },
  supplierRrp: { label: 'PowerBody’s RRP', check: number({ min: 0, nullable: true, zeroIsUnknown: true }) },
  compareAtPrice: { label: '“Was” price', check: number({ min: 0, nullable: true, zeroIsUnknown: true }) },
  weightGrams: { label: 'Shipped weight', check: number({ min: 1, max: 100_000, nullable: true, zeroIsUnknown: true }) },
  vatRate: { label: 'VAT rate', check: number({ min: 0, max: 1, nullable: true }) },
  supplierProductId: { label: 'PowerBody product id', check: productId },
}

const VARIANT_FIELDS: Record<string, { label: string; check: Check }> = {
  title: { label: 'Flavour or size name', check: text(true) },
  flavour: { label: 'Flavour', check: optionalText },
  size: { label: 'Size', check: optionalText },
  servings: { label: 'Servings', check: number({ min: 0.01, nullable: true }) },
  imageUrl: { label: 'Picture', check: picture },
  cost: { label: 'What we pay', check: number({ min: 0, nullable: true, zeroIsUnknown: true }) },
  supplierProductId: { label: 'PowerBody product id', check: productId },
  // The struck-through "was" price on the card for THIS SKU. Null removes it —
  // a "was" price is a claim, and one PowerBody's RRP made for us may be one
  // we would rather not make.
  compareAtPrice: { label: '“Was” price', check: number({ min: 0, nullable: true, zeroIsUnknown: true }) },
}

/** The validated patch for an edit against the product as it stands. */
export function validateEdit(
  current: CatalogueProduct,
  edit: ProductEdit,
): { patch: ProductPatch; changed: string[]; master: string | null } {
  const problems: string[] = []
  const patch: Record<string, unknown> = {}
  const changed: string[] = []

  for (const [key, value] of Object.entries(edit.set ?? {})) {
    const rule = PRODUCT_FIELDS[key]
    if (!rule) {
      problems.push(`“${key}” can’t be changed here.`)
      continue
    }
    if (value === undefined) continue
    const result = rule.check(value, rule.label)
    if (!result.ok) {
      problems.push(result.problem)
      continue
    }
    if (key === 'subscriptionProductId' && result.value === current.id) {
      problems.push('A product can’t be its own monthly refill.')
      continue
    }
    patch[key] = result.value
    if (JSON.stringify(result.value ?? null) !== JSON.stringify((current as unknown as Record<string, unknown>)[key] ?? null)) {
      changed.push(key)
    }
  }

  const variantEdits: VariantEdit[] = []
  for (const raw of edit.variants ?? []) {
    const id = typeof raw?.id === 'string' ? raw.id : ''
    const variant = current.variants.find((v) => v.id === id)
    if (!variant) {
      problems.push(`There is no SKU “${id || '(blank)'}” on this product any more — reload the page.`)
      continue
    }
    const out: Record<string, unknown> = { id }
    for (const [key, value] of Object.entries(raw)) {
      if (key === 'id' || value === undefined) continue
      const rule = VARIANT_FIELDS[key]
      if (!rule) {
        problems.push(`A SKU’s “${key}” can’t be changed here.`)
        continue
      }
      const result = rule.check(value, `${variant.sku ?? variant.title}: ${rule.label.toLowerCase()}`)
      if (!result.ok) problems.push(result.problem)
      else out[key] = result.value
    }
    // The label and the flavour move together: the shop's picker reads
    // `flavour` and falls back to `title`, so setting one and not the other is
    // how a product ends up named two different things.
    if (typeof out.title === 'string' && out.title !== variant.title && !('flavour' in raw) && variant.flavour !== null) {
      out.flavour = out.title
    }
    const moved = Object.keys(out).filter(
      (k) => k !== 'id' && JSON.stringify(out[k] ?? null) !== JSON.stringify((variant as unknown as Record<string, unknown>)[k] ?? null),
    )
    if (moved.length > 0) variantEdits.push(out as VariantEdit)
  }
  if (variantEdits.length > 0) {
    patch.variants = variantEdits
    changed.push('variants')
  }

  let master: string | null = null
  if (edit.master !== undefined && edit.master !== null) {
    if (!current.variants.some((v) => v.id === edit.master)) problems.push('That SKU is not on this product any more — reload the page.')
    else master = edit.master
  }

  for (const key of edit.confirm ?? []) {
    if (!REVIEW_FIELDS.some((f) => f.key === key)) problems.push(`“${key}” is not something to confirm.`)
  }

  if (problems.length > 0) throw new EditRejected(problems)
  return { patch: patch as ProductPatch, changed, master }
}

/**
 * Keep the subscription's serving count in step with the product's.
 *
 * `consumption.servingsPerUnit` is what sizes a monthly plan, and it used to be
 * set once (by a cadence choice or an AI pass) and then never move — so a
 * founder correcting "Servings" changed the shelf and not the plan. It follows
 * only when it was following before: a number that differs from the old serving
 * count was set on purpose (the advanced override) and is left alone.
 */
function followServings(before: CatalogueProduct, after: CatalogueProduct): CatalogueProduct {
  const plan = after.consumption
  if (!plan) return after
  const was = liveServings(before)
  const now = liveServings(after)
  if (now === was || plan.servingsPerUnit !== was) return after
  return { ...after, consumption: { ...plan, servingsPerUnit: now } }
}

/** Apply a validated edit to a product. Pure — the caller writes it. */
export function applyEdit(current: CatalogueProduct, edit: ProductEdit): { product: CatalogueProduct; changed: string[] } {
  const { patch, changed, master } = validateEdit(current, edit)
  // A plan set explicitly in the same edit is the founder's number; don't move it.
  const planSet = 'consumption' in patch
  let next = applyPatch(current, patch)
  if (master) {
    // The master's own facts, without spreading its serving count over its
    // siblings — choosing which flavour leads is not a statement that every
    // flavour has the same number of scoops.
    const facts = masterPatch(next, master)
    if (facts) {
      next = applyPatch(next, facts, { spreadServings: false })
      changed.push('defaultVariantId')
    }
  }
  // The product's serving count IS its master SKU's — what the shelf shows and
  // what everything that reads `product.servings` should see. Servings are set
  // per SKU (Flavours & sizes); this keeps the product-level copy honest.
  const masterOwn = (next.variants.find((v) => v.id === next.defaultVariantId) ?? next.variants[0])?.servings
  if (masterOwn != null && masterOwn > 0 && masterOwn !== next.servings) next = { ...next, servings: masterOwn }
  if (!planSet) next = followServings(current, next)
  // A renamed flavour keeps its old name on file, so subscription lines written
  // against it still find it (see `catalogue/line-variant`).
  next = rememberRenames(current, next)

  const confirm = edit.confirm ?? []
  if (next.review && (changed.length > 0 || confirm.length > 0)) {
    const reviewKeys = new Set(REVIEW_FIELDS.map((f) => f.key as string))
    const edited = changed.filter((k) => reviewKeys.has(k))
    next = withConfirmed(next, [...edited, ...confirm], edited)
  }
  return { product: next, changed }
}

/**
 * Change a product, checked, in one safe write. Throws `EditRejected` (nothing
 * written) when any part of the edit is wrong, and `ProductNotFound` for an id
 * the store does not hold.
 */
export async function updateProduct(
  id: string,
  edit: ProductEdit,
): Promise<{ product: CatalogueProduct; changed: string[] }> {
  let changed: string[] = []
  const product = await editStoredProduct(id, (current) => {
    const result = applyEdit(current, edit)
    changed = result.changed
    return changed.length > 0 || (edit.confirm ?? []).length > 0 ? result.product : null
  })
  return { product, changed }
}

// ── The product page's payload ───────────────────────────────────────────────

/**
 * Everything the product page draws, in one shape — returned by the page's read
 * AND by every write, so the page replaces its state from the answer instead of
 * re-fetching (and possibly reading another server's five-second-old copy).
 */
export interface ProductPayload {
  product: CatalogueProduct
  state: ProductState
  storage: 'imported' | 'base'
  readiness: ProductReadiness
  /** Review fields still to check (pending products). */
  remaining: string[]
  /** Per-SKU prices, worked out on the server with the founder's own markup. */
  priceRows: PriceRow[]
  markupOnCost: number
  usage: ProductUsage
  usageWarning: string | null
  /** Whether the shop is serving the real catalogue or the sample one. */
  source: 'real' | 'mock'
}

/**
 * Build the payload for one product. `fresh` skips this server's short read
 * cache — for landing on a product another request just created (a split, a
 * merge), where a five-second-old copy would say it does not exist.
 */
export async function productPayload(id: string, options: { fresh?: boolean } = {}): Promise<ProductPayload | null> {
  if (options.fresh) clearPersistCache()
  let entry = await getEditableProduct(id)
  if (!entry && !options.fresh) {
    clearPersistCache()
    entry = await getEditableProduct(id)
  }
  if (!entry) return null
  const config = getPricingConfig()
  const live = getDataSource() === 'real'
  const usage = await productUsage(id)
  return {
    ...entry,
    readiness: productReadiness(entry.product, { live }),
    remaining: entry.state === 'pending' ? fieldsNeedingReview(entry.product).map((f) => f.key as string) : [],
    priceRows: priceRows(entry.product, config),
    markupOnCost: config.listPricing.markupOnCost,
    usage,
    usageWarning: usageWarning(usage),
    source: live ? 'real' : 'mock',
  }
}

/**
 * Put a product that has been checked on sale. Refused, with what is left,
 * when any review field is still unchecked. Decided on the product as stored at
 * write time, so an edit saved a moment ago on another server is not undone.
 */
export async function approveProduct(id: string, by: string | null): Promise<{ ok: true } | { ok: false; remaining: string[] }> {
  let remaining: string[] = []
  await editStoredProduct(id, (current) => {
    if (current.review?.status !== 'pending') return null
    if (!isReviewComplete(current)) {
      remaining = fieldsNeedingReview(current).map((f) => f.key as string)
      return null
    }
    return approved(current, by ?? undefined)
  })
  return remaining.length > 0 ? { ok: false, remaining } : { ok: true }
}
