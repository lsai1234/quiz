import type { CatalogueProduct, CatalogueVariant } from './types'
import { spreadServings } from './servings'
import { asFounders } from './review'

/**
 * How a change is applied to a product — the one set of rules every writer uses.
 *
 * Pure: no network, no database. `portal/store` is what persists the result.
 *
 * ── Three rules, each fixing a way an edit used to vanish ───────────────────
 *
 * 1. `null` CLEARS. A choice like "How it's taken: Auto" means "forget what was
 *    set", and the old shallow merge could not say that: the editor sent
 *    `undefined`, JSON dropped the key, and the earlier value survived while the
 *    screen said "Saved". Here a `null` on an optional field deletes it. The two
 *    fields whose type is "a value or null" (`imageUrl`, `compareAtPrice`) keep
 *    null as the value it already means: no picture, no "was" price.
 *
 * 2. `variants` in a patch are EDITS BY ID, never a replacement list. A screen
 *    holds a copy of the SKUs from when it loaded; writing that copy back whole
 *    put back yesterday's stock, cost and price over whatever the supplier sync
 *    had written since. Only the fields a patch names are touched. Adding,
 *    moving or removing a SKU is its own operation (split, merge, add).
 *
 * 3. `servings` on the product means "every SKU of the master's size has this
 *    many" — which is what a founder typing a serving count means, and what the
 *    shop then shows. See `spreadServings` for why only that size.
 */

/** Fields whose type is `T | null` — for these, null is a value, not "unset". */
const PRODUCT_NULL_VALUES = new Set<string>(['imageUrl', 'compareAtPrice'])
const VARIANT_NULL_VALUES = new Set<string>(['compareAtPrice', 'flavour', 'size'])

/**
 * The only fields a null may clear. Everything else on a product is required —
 * its slots, goals, servings, review record — and a null there must change
 * nothing: `{review: null}` would otherwise put an unchecked import on sale.
 */
const PRODUCT_CLEARABLE = new Set<string>([
  'shortName', 'brand', 'defaultVariantId', 'cost', 'subscriptionProductId', 'isSubscriptionOnly', 'consumption',
  'minSubscriptionMonths', 'recommendationBasis', 'effectOnset', 'topRank', 'weightGrams', 'vatRate', 'supplierRrp',
  'supplierProductId', 'contraindications', 'actives', 'rating', 'restockingSoon',
])
const VARIANT_CLEARABLE = new Set<string>([
  'inventory', 'servings', 'servingsSource', 'imageUrl', 'cost', 'priceSource', 'supplierProductId', 'formerly',
])

/** Never stored: worked out on read. */
const DERIVED_FIELDS = ['topRank'] as const

export type VariantEdit = { id: string } & Partial<Omit<CatalogueVariant, 'id'>>

export type ProductPatch = Partial<Omit<CatalogueProduct, 'variants' | 'id'>> & {
  variants?: VariantEdit[]
}

function assign<T extends object>(target: T, patch: object, nullValues: Set<string>, clearable: Set<string>): T {
  const out = { ...target } as Record<string, unknown>
  for (const [key, value] of Object.entries(patch)) {
    if (key === 'id' || key === 'variants' || value === undefined) continue
    if (value === null && !nullValues.has(key)) {
      if (clearable.has(key)) delete out[key]
      continue
    }
    out[key] = value
  }
  return out as T
}

/** Apply edits to the SKUs they name, matched by id then by SKU code. Unknown ids are ignored. */
export function applyVariantEdits(variants: CatalogueVariant[], edits: VariantEdit[]): CatalogueVariant[] {
  if (edits.length === 0) return variants
  return variants.map((variant) => {
    const edit =
      edits.find((e) => e.id === variant.id) ??
      (variant.sku ? edits.find((e) => e.sku && e.sku === variant.sku && !variants.some((v) => v.id === e.id)) : undefined)
    return edit ? assign(variant, edit, VARIANT_NULL_VALUES, VARIANT_CLEARABLE) : variant
  })
}

export interface PatchOptions {
  /** Spread a product-level `servings` onto the master's size. Default true. */
  spreadServings?: boolean
}

/** A product with `patch` applied by the rules above. Never mutates its input. */
export function applyPatch(
  product: CatalogueProduct,
  patch: ProductPatch,
  options: PatchOptions = {},
): CatalogueProduct {
  let next = assign(product, patch, PRODUCT_NULL_VALUES, PRODUCT_CLEARABLE)
  if (patch.variants) next = { ...next, variants: applyVariantEdits(product.variants, patch.variants) }

  // A null `servings` changed nothing above (the field is required), so there is
  // nothing to spread either — spreading the old count would overwrite SKUs.
  if (patch.servings != null && options.spreadServings !== false) {
    const spread = spreadServings(next, next.servings)
    if (spread) next = { ...next, variants: spread }
  }
  return next
}

/** A stored record never carries what the resolver works out on read. */
export function withoutDerived(product: CatalogueProduct): CatalogueProduct {
  if (!DERIVED_FIELDS.some((k) => k in product)) return product
  const out = { ...product } as Record<string, unknown>
  for (const k of DERIVED_FIELDS) delete out[k]
  return out as unknown as CatalogueProduct
}

/**
 * Fold an old-style override into the imported record it was masking.
 *
 * Imported products used to be edited through an OVERRIDE composed over the
 * record on read. Everything else — the supplier sync, pulls, prices, splits —
 * wrote the record, so a product that had ever been saved from the product page
 * showed the override's frozen copy of its SKUs for good: stock that never
 * changed, split-out SKUs that came back, a price set later that never showed.
 *
 * Folding has to keep what the founder MEANT and drop what was only a copy:
 *
 *   · product-level fields: the override wins — it is what the shop shows today
 *     and what somebody chose. Except a positive `cost` on the record, which the
 *     sync and "absorb this price change" keep current.
 *   · `variants`: the record decides which SKUs exist and in what order. From the
 *     override's copy only the NAMES (title, flavour) are taken, because naming
 *     them is the only thing the screen that wrote it was for; its price, stock,
 *     cost, servings and picture were a snapshot of the record.
 *   · a founder's `servings` is spread over the master's size exactly as the
 *     read path did, so the shelf does not change when this runs.
 *   · the shelf price follows the master SKU, whose price now comes from the
 *     record and so is the fresher of the two.
 *   · whatever the override set is recorded as the founder's, in the review's
 *     sources and on each SKU whose count it set — see the end of this.
 */
export function foldOverride(
  record: CatalogueProduct,
  override: Partial<CatalogueProduct>,
  options: { costRatio?: number } = {},
): CatalogueProduct {
  const { variants: copied, cost, id: _id, ...rest } = override
  void _id
  let next = assign(record, rest, PRODUCT_NULL_VALUES, PRODUCT_CLEARABLE)

  if (copied && copied.length > 0) {
    const variants = record.variants.map((v) => {
      const named = copied.find((c) => c.id === v.id) ?? (v.sku ? copied.find((c) => c.sku === v.sku) : undefined)
      if (!named) return v
      return {
        ...v,
        ...(typeof named.title === 'string' && named.title ? { title: named.title } : {}),
        ...(named.flavour !== undefined ? { flavour: named.flavour } : {}),
      }
    })
    next = { ...next, variants }
    const master = next.variants.find((v) => v.id === next.defaultVariantId) ?? next.variants[0]
    if (master && master.price > 0) next = { ...next, basePrice: master.price, compareAtPrice: master.compareAtPrice ?? next.compareAtPrice }
  }

  // An override's cost was often not a cost at all: the old editor sent an
  // estimate (price × the default ratio) on every save, and the AI panel did
  // the same. One that equals that estimate is dropped rather than made real.
  // Against the price the override was saved at as well as today's: with a copy
  // of the SKUs the shelf price above now comes from the record, which has
  // usually moved since, and an old estimate is still not a cost.
  const ratio = options.costRatio
  const prices = [next.basePrice, override.basePrice].filter((p): p is number => typeof p === 'number')
  const looksEstimated =
    typeof cost === 'number' &&
    ratio != null &&
    prices.some((price) => Math.abs(cost - Math.round(price * ratio * 100) / 100) < 0.005)
  if (cost !== undefined && !looksEstimated && !(record.cost != null && record.cost > 0)) {
    next = cost === null ? assign(next, { cost: null }, PRODUCT_NULL_VALUES, PRODUCT_CLEARABLE) : { ...next, cost }
  }

  /*
    Over the size of the STORED master, and how far depends on whether the
    count was typed or only re-sent.

    The old editor re-sent its serving count (often the guessed 30) on every
    save; spreading that over SKUs PowerBody had counted would make the guess
    permanent. A re-sent count equals the record's own, so that one fills only
    SKUs that do not know theirs.

    A count that DIFFERS from the record's was typed — a founder correcting
    PowerBody's 12 to 20 — and the read path before the fold spread it over
    every SKU of the master's size, so the shelf and the per-serving price said
    20. Spreading it only onto unknown SKUs put 12 back on the shelf on deploy,
    with nobody touching the product. Typed, it goes everywhere the read path
    put it, and those SKUs record it as the founder's so a pull keeps it.
  */
  if (override.servings !== undefined) {
    const typed = override.servings != null && override.servings !== record.servings
    const spread = spreadServings(next, next.servings, { onlyUnknown: !typed, storedMaster: true })
    if (spread) {
      next = {
        ...next,
        variants: typed
          ? spread.map((v, i) => (v === next.variants[i] ? v : { ...v, servingsSource: 'founder' as const }))
          : spread,
      }
    }
  }

  /*
    What the override set is the founder's, and the review has to say so.

    A pull refreshes any field whose source still says `supplier` — that is
    how it keeps PowerBody's own facts current. An import stamps the picture,
    description, category, weight and VAT `supplier`; an old-editor override
    over them changed the value and left the label. Folded without this, the
    next "Pull from PowerBody" put PowerBody's category back over the founder's
    and called it theirs. Only fields that really end up different from the
    record are marked: a field the override merely repeated is still whoever's
    it was.
  */
  const a = record as unknown as Record<string, unknown>
  const b = next as unknown as Record<string, unknown>
  const set = [...Object.keys(rest), ...(cost !== undefined ? ['cost'] : [])].filter(
    (key) =>
      key !== 'review' &&
      !(DERIVED_FIELDS as readonly string[]).includes(key) &&
      JSON.stringify(a[key] ?? null) !== JSON.stringify(b[key] ?? null),
  )
  return withoutDerived(asFounders(next, set))
}

/**
 * The override that turns `base` into `next`, for products that are not ours
 * to rewrite (the sample catalogue). A field `next` dropped is stored as null so
 * the read path deletes it too.
 */
export function overrideFor(base: CatalogueProduct, next: CatalogueProduct): Partial<CatalogueProduct> {
  const out: Record<string, unknown> = {}
  const a = base as unknown as Record<string, unknown>
  const b = next as unknown as Record<string, unknown>
  for (const key of Object.keys(b)) {
    if (key === 'id' || (DERIVED_FIELDS as readonly string[]).includes(key)) continue
    // A key set to undefined is dropped too: stored as-is, JSON would lose it
    // and the base's value would come back on read.
    if (JSON.stringify(a[key]) !== JSON.stringify(b[key])) out[key] = b[key] === undefined ? null : b[key]
  }
  for (const key of Object.keys(a)) {
    if (key === 'id' || (DERIVED_FIELDS as readonly string[]).includes(key)) continue
    if (!(key in b) && a[key] !== undefined) out[key] = null
  }
  return out as Partial<CatalogueProduct>
}

/** Compose a stored override over its base product (the read path). */
export function composeOverride(base: CatalogueProduct, override: Partial<CatalogueProduct>): CatalogueProduct {
  const { variants, ...rest } = override
  const merged = assign(base, rest, PRODUCT_NULL_VALUES, PRODUCT_CLEARABLE)
  return variants ? { ...merged, variants } : merged
}

/**
 * The patch that turns `before` into `after`, field by field and SKU by SKU.
 *
 * For a pass that read a product, worked something out and now wants to save
 * it: writing back the whole product it read would also write back every field
 * it did NOT mean to change, as they were when it read them — and the supplier
 * sync or another screen may have moved them since. Only the difference goes.
 * SKUs added or removed are not a patch (see `ProductPatch`) and are ignored.
 */
export function diffProducts(before: CatalogueProduct, after: CatalogueProduct): ProductPatch {
  const patch: Record<string, unknown> = {}
  const a = before as unknown as Record<string, unknown>
  const b = after as unknown as Record<string, unknown>
  for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if (key === 'id' || key === 'variants' || (DERIVED_FIELDS as readonly string[]).includes(key)) continue
    if (JSON.stringify(a[key]) === JSON.stringify(b[key])) continue
    patch[key] = key in b && b[key] !== undefined ? b[key] : null
  }
  const edits: VariantEdit[] = []
  for (const v of after.variants) {
    const was = before.variants.find((x) => x.id === v.id)
    if (!was) continue
    const edit: Record<string, unknown> = {}
    const va = was as unknown as Record<string, unknown>
    const vb = v as unknown as Record<string, unknown>
    for (const key of new Set([...Object.keys(va), ...Object.keys(vb)])) {
      if (key === 'id' || JSON.stringify(va[key]) === JSON.stringify(vb[key])) continue
      edit[key] = key in vb && vb[key] !== undefined ? vb[key] : null
    }
    if (Object.keys(edit).length > 0) edits.push({ id: v.id, ...edit } as VariantEdit)
  }
  if (edits.length > 0) patch.variants = edits
  return patch as ProductPatch
}

export function isEmptyPatch(patch: ProductPatch): boolean {
  return Object.keys(patch).length === 0
}
