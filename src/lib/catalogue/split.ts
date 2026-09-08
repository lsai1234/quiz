import type { CatalogueProduct, CatalogueVariant } from './types'

/**
 * Telling a FLAVOUR apart from a different PRODUCT.
 *
 * ── The conflation ──────────────────────────────────────────────────────────
 * A PowerBody row lists a main SKU and the SKUs that hang off it, and our
 * import merged every one of them into a single product with variants. That is
 * right for six flavours of one 500g bag and wrong for everything else, because
 * their sheet also hangs genuinely different things off one master SKU:
 *
 *   Glycine
 *     ├ 100 vcaps   £14.99    33 servings   ← a tub of capsules
 *     └ 454 grams   £39.99   454 servings   ← a bag of powder
 *
 * Those are two products a customer chooses BETWEEN, not two flavours of one
 * product. Merged, they share a page, a photograph and a price, and whichever
 * SKU happened to be the master decided all three — which is how a 454-serving
 * bag went on the shelf at the capsules' price with the capsules' serving count.
 *
 * ── The line this draws ─────────────────────────────────────────────────────
 * A flavour is a SKU that differs from its siblings ONLY in flavour. The moment
 * the size differs — 500 grams beside 100 caps, 1kg beside 2kg — it is a
 * different unit of sale, and it belongs on its own page with its own price,
 * its own photograph and its own serving count.
 *
 * Size is the signal because it is the one PowerBody actually give us per SKU
 * (`sizeFromName`), and because it is the thing that makes a price difference
 * legitimate. Two SKUs at different prices and the same size is a mistake in
 * somebody's data; two SKUs at different sizes is two products.
 *
 * ── Nothing here decides on its own ─────────────────────────────────────────
 * Grouping is a suggestion with the evidence attached. `splitOut` moves exactly
 * the SKUs it is handed, because the founder is the one who knows whether their
 * "20 x 60g" gels and their "12 x 60g" gels are one product or two.
 *
 * Pure: no network, no database.
 */

/** One unit of sale within a product: the SKUs that are the same size. */
export interface SkuGroup {
  /** Normalised size — `500g`, `100cap` — or '' for SKUs that never said. */
  key: string
  /** What to call it on screen: the size as written, or a plain admission. */
  label: string
  variants: CatalogueVariant[]
}

const UNITS: Array<[RegExp, string]> = [
  [/^(kg|kilos?|kilograms?)$/, 'kg'],
  [/^(g|gr|gram|grams|gramme|grammes)$/, 'g'],
  [/^(ml|millilitres?|milliliters?)$/, 'ml'],
  [/^(l|litres?|liters?)$/, 'l'],
  [/^(v?caps?|v?capsules?)$/, 'cap'],
  [/^(tabs?|tablets?)$/, 'tab'],
  [/^softgels?$/, 'softgel'],
  [/^servings?$/, 'serving'],
  [/^sachets?$/, 'sachet'],
  [/^bars?$/, 'bar'],
]

/**
 * A size string reduced to something two SKUs can be compared on.
 *
 * "500 grams", "500g" and "500 Grams" are one size written three ways, and
 * PowerBody use all three across a single brand's line. Comparing the raw
 * strings would split one product into three.
 *
 * Deliberately NOT a converter: 500g and 0.5kg come out different, because a
 * supplier who writes both is describing two listings and guessing that they
 * are the same tub is how a split silently merges two real products.
 */
export function normaliseSize(size: string | null | undefined): string {
  const s = (size ?? '').trim().toLowerCase()
  if (!s) return ''
  const m = s.match(/^([\d.]+)\s*([a-z]+)$/)
  if (!m) return s.replace(/\s+/g, ' ')
  const [, amount, rawUnit] = m
  const unit = UNITS.find(([re]) => re.test(rawUnit))?.[1] ?? rawUnit
  return `${Number(amount)}${unit}`
}

/** The format a size implies, when it implies one at all. */
function formatForUnit(key: string): string | null {
  if (key.endsWith('cap') || key.endsWith('softgel')) return 'capsule'
  if (key.endsWith('tab')) return 'tablet'
  if (key.endsWith('g') || key.endsWith('kg')) return 'powder'
  if (key.endsWith('ml') || key.endsWith('l')) return 'liquid'
  return null
}

/**
 * The formats a set of SKUs actually are, or the fallback.
 *
 * Only when every one of them agrees. `formats` decides who the quiz offers a
 * product to, so a confident guess is worth having and a half-confident one is
 * worth nothing — a founder who wanted capsules and is shown a powder has been
 * failed by exactly this field.
 */
function formatsFor(variants: CatalogueVariant[], fallback: string[]): string[] {
  const formats = new Set(variants.map((v) => formatForUnit(normaliseSize(v.size))))
  if (formats.size !== 1) return fallback
  const only = [...formats][0]
  return only ? [only] : fallback
}

/**
 * A product's SKUs, gathered into the units of sale they really are.
 *
 * Sized SKUs first, biggest group first, so the group a product is mostly made
 * of leads. SKUs with no size at all come last in one group of their own: we
 * cannot say they are a different product, only that we do not know.
 */
export function skuGroups(product: CatalogueProduct): SkuGroup[] {
  const byKey = new Map<string, SkuGroup>()
  for (const v of product.variants) {
    const key = normaliseSize(v.size)
    const group = byKey.get(key)
    if (group) group.variants.push(v)
    else byKey.set(key, { key, label: (v.size ?? '').trim() || 'no size given', variants: [v] })
  }
  return [...byKey.values()].sort((a, b) => {
    if (!a.key !== !b.key) return a.key ? -1 : 1
    return b.variants.length - a.variants.length
  })
}

/**
 * Is this product actually two or more products sharing a page?
 *
 * Two groups that both KNOW their size. A product where half the SKUs never
 * said is not evidence of anything, and saying so would put a warning on most
 * of the catalogue.
 */
export function mixedSizes(product: CatalogueProduct): boolean {
  return skuGroups(product).filter((g) => g.key).length > 1
}

/** Which SKU a set presents itself as, honouring a stored choice that survived. */
function faceOf(variants: CatalogueVariant[], product: CatalogueProduct) {
  const chosen = variants.find((v) => v.id === product.defaultVariantId)
  const master = (chosen?.available ? chosen : null) ?? variants.find((v) => v.available) ?? chosen ?? variants[0]
  const servings = master?.servings ?? product.servings
  return {
    defaultVariantId: master?.id ?? null,
    basePrice: master && master.price > 0 ? master.price : product.basePrice,
    compareAtPrice: master?.compareAtPrice ?? null,
    imageUrl: master?.imageUrl ?? product.imageUrl,
    servings,
    cost: master?.cost ?? product.cost,
    // The plan's maths reads this, not `servings`, and leaving it on the old
    // number is how a monthly subscription for a 454-serving bag gets sized
    // like a tub of 33 capsules.
    ...(product.consumption ? { consumption: { ...product.consumption, servingsPerUnit: servings } } : {}),
  }
}

/**
 * Move some of a product's SKUs onto a product of their own.
 *
 * Both sides come back rebuilt, because both change: whichever SKU each side
 * now presents itself as decides its price, photograph, cost and serving count,
 * and a product that just lost its master must not keep quoting the price of a
 * SKU it no longer sells.
 *
 * Null when the move would empty one side. "Everything" is not a split, and
 * "nothing" is not either.
 */
export function splitOut(
  product: CatalogueProduct,
  variantIds: string[],
  opts: { id: string; title?: string },
): { kept: CatalogueProduct; moved: CatalogueProduct } | null {
  const ids = new Set(variantIds)
  const moving = product.variants.filter((v) => ids.has(v.id))
  const staying = product.variants.filter((v) => !ids.has(v.id))
  if (moving.length === 0 || staying.length === 0) return null

  const moved: CatalogueProduct = {
    ...product,
    id: opts.id,
    // The handle IS the id for everything imported, and a new product needs a
    // URL nothing else answers on.
    handle: opts.id,
    title: (opts.title ?? '').trim() || defaultTitleFor(product, moving),
    variants: moving,
    formats: formatsFor(moving, product.formats),
    ...faceOf(moving, product),
  }
  /*
    The supplier's product id does not travel.

    It is the id of the PARENT's main SKU — the handle every later detail call
    is made against — and carrying it onto a product built from different SKUs
    would have the next lookup fetch the wrong product's name and picture and
    write them here confidently.
  */
  delete (moved as { supplierProductId?: string | null }).supplierProductId

  const kept: CatalogueProduct = {
    ...product,
    variants: staying,
    formats: formatsFor(staying, product.formats),
    ...faceOf(staying, product),
  }

  return { kept, moved }
}

/** What to call a product made of these SKUs, before anybody renames it. */
function defaultTitleFor(product: CatalogueProduct, variants: CatalogueVariant[]): string {
  const sizes = new Set(variants.map((v) => (v.size ?? '').trim()).filter(Boolean))
  if (sizes.size === 1) return `${product.title} — ${[...sizes][0]}`
  if (variants.length === 1) return `${product.title} — ${variants[0].title}`
  return `${product.title} — ${variants.length} SKUs`
}

/** `a-b-c`, from anything. */
function slugify(s: string): string {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

/** An id nothing else has taken, from a stem. */
export function freeId(stem: string, taken: Iterable<string>): string {
  const used = new Set(taken)
  const base = slugify(stem) || 'product'
  if (!used.has(base)) return base
  for (let n = 2; n < 100; n++) if (!used.has(`${base}-${n}`)) return `${base}-${n}`
  return `${base}-${Date.now()}`
}

/**
 * One product per unit of sale, from a product that holds several.
 *
 * Used at IMPORT, where it is the difference between onboarding a catalogue
 * that is right and onboarding one somebody then has to unpick by hand. The
 * same rule the founder applies with the button, applied the moment the
 * product is built.
 *
 * The group holding the product's current master keeps the original id, title
 * and URL: it is what the product already was, and the others are the ones
 * being lifted out of it. Returns the product untouched when there is only one
 * unit of sale, which is the overwhelmingly common case.
 */
export function splitBySize(product: CatalogueProduct, taken: Iterable<string> = []): CatalogueProduct[] {
  if (!mixedSizes(product)) return [product]

  const groups = skuGroups(product)
  const home =
    groups.find((g) => g.variants.some((v) => v.id === product.defaultVariantId)) ?? groups[0]
  const used = new Set(taken)
  used.add(product.id)

  const out: CatalogueProduct[] = [
    { ...product, variants: home.variants, formats: formatsFor(home.variants, product.formats), ...faceOf(home.variants, product) },
  ]
  for (const group of groups) {
    if (group === home) continue
    const id = freeId(`${product.id}-${group.key || 'unsized'}`, used)
    used.add(id)
    const split = splitOut(product, group.variants.map((v) => v.id), { id })
    if (split) out.push(split.moved)
  }
  return out
}
