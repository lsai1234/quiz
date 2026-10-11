import type { CatalogueProduct } from '@/lib/catalogue/types'
import type { SupplierProduct, SupplierProvider } from './types'
import { masterVariant } from '@/lib/catalogue/master'
import { repriceVariants, type SkuFacts } from './variant-pricing'
import { indexedProductIds } from '@/lib/portal/supplier-index'
import { resolveCode, normaliseCode, type CodeResolution } from './resolve-code'
import type { ResolveStep } from './resolve-sku'

/**
 * Pull what PowerBody know about ONE product onto it.
 *
 * The one "Pull from PowerBody" — the product page's button and Review's
 * "fill from PowerBody" both run this, so a product enriched in one place and
 * pulled in the other cannot end up different.
 *
 * ── What it may write ────────────────────────────────────────────────────────
 *   per SKU     cost, servings, size, picture (only if it has none), PowerBody id;
 *               the price only by the rule, and NEVER over a price a founder set
 *               (`repriceVariants` is where that lives)
 *   product     cost, RRP and PowerBody id from the master SKU;
 *               picture, description, category, brand, weight and VAT only when
 *               the product has none, or when what it has came from PowerBody in
 *               the first place — never over something a founder wrote
 *
 * Review's old enrich overwrote the picture, description and category outright
 * and set every flavour to one price; run on a product someone had already
 * tidied, that undid their work.
 */

export interface PullResult {
  before: CatalogueProduct
  after: CatalogueProduct
  /** Product-level fields it wrote. */
  filled: string[]
  /** Per-SKU notes, keyed by SKU. */
  changed: Record<string, string>
  /** SKUs PowerBody answered for. */
  answered: number
  /** SKUs whose id could not be found, with why. */
  unresolved: Array<{ sku: string; message: string }>
  trace: ResolveStep[]
}

const DESCRIPTIVE = ['imageUrl', 'description', 'category', 'brand', 'weightGrams', 'vatRate'] as const

function isBlank(value: unknown): boolean {
  return value === null || value === undefined || (typeof value === 'string' && value.trim() === '') || value === 0
}

export async function pullProduct(
  product: CatalogueProduct,
  options: { supplier: SupplierProvider; budgetMs?: number; force?: boolean; onStep?: (step: ResolveStep) => void },
): Promise<PullResult> {
  const startedAt = Date.now()
  const budget = options.budgetMs ?? 150_000
  const trace: ResolveStep[] = []
  const note = (message: string) => {
    const step: ResolveStep = { phase: 'canary', message, probes: 0 }
    trace.push(step)
    options.onStep?.(step)
  }

  const skus = [...new Set(product.variants.map((v) => v.sku).filter((s): s is string => Boolean(s)))]
  if (skus.length === 0) {
    return { before: product, after: product, filled: [], changed: {}, answered: 0, unresolved: [], trace }
  }

  // The master first: it is the one the product-level facts come from, and if
  // time runs short it is the one that matters most.
  const master = masterVariant(product)
  const ordered = master?.sku ? [master.sku, ...skus.filter((s) => s !== master.sku)] : skus

  // ── Ids, cheapest first ──────────────────────────────────────────────────
  const ids = new Map<string, string>()
  for (const v of product.variants) {
    if (v.sku && v.supplierProductId) ids.set(v.sku, v.supplierProductId)
  }
  if (product.variants.length === 1 && product.supplierProductId && skus[0]) ids.set(skus[0], product.supplierProductId)
  const indexed = await indexedProductIds(ordered.filter((s) => !ids.has(s))).catch(() => new Map())
  for (const [sku, hit] of indexed) if (hit.productId) ids.set(sku, hit.productId)

  // ── Detail for every id we hold ───────────────────────────────────────────
  const detail = new Map<string, SupplierProduct>()
  const known = [...new Set(ordered.map((s) => ids.get(s)).filter((id): id is string => Boolean(id)))]
  if (known.length > 0) {
    note(`Asking PowerBody about ${known.length} SKU${known.length === 1 ? '' : 's'} whose ids we already hold.`)
    try {
      for (const p of await options.supplier.getProductsById(known)) {
        // Checked, never assumed: an id that now answers for another SKU has
        // moved, and its facts belong to some other product.
        const sku = normaliseCode(p.sku ?? '')
        const asked = ordered.find((s) => normaliseCode(s) === sku)
        if (asked && ids.get(asked) === String(p.productId ?? ids.get(asked))) detail.set(asked, p)
      }
    } catch (err) {
      note(`PowerBody would not answer: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  // ── Anything still unknown is looked up properly ──────────────────────────
  const unresolved: PullResult['unresolved'] = []
  for (const sku of ordered.filter((s) => !detail.has(s))) {
    const left = budget - (Date.now() - startedAt)
    if (left < 8_000) {
      unresolved.push({ sku, message: 'Not reached this time — pull again to carry on.' })
      continue
    }
    const outcome: CodeResolution = await resolveCode(sku, {
      supplier: options.supplier,
      budgetMs: Math.min(left - 2_000, 90_000),
      onStep: (s) => {
        trace.push(s)
        options.onStep?.(s)
      },
    })
    if (outcome.status === 'found' && outcome.product) detail.set(sku, outcome.product)
    else unresolved.push({ sku, message: outcome.message })
  }

  // ── Per-SKU facts, through the pricing rules ──────────────────────────────
  const facts = new Map<string, SkuFacts>()
  for (const [sku, p] of detail) {
    facts.set(sku, {
      cost: p.wholesalePrice > 0 ? p.wholesalePrice : null,
      rrp: p.rrp > 0 ? p.rrp : null,
      servings: p.servings,
      name: p.name || null,
      image: p.imageUrl || null,
      productId: p.productId ? String(p.productId) : ids.get(sku) ?? null,
    })
  }
  const repriced = repriceVariants(product, facts, options.force ?? false)
  let after = repriced?.product ?? product
  const changed = repriced?.changed ?? {}

  // ── Product-level description, picture, category… ─────────────────────────
  const face = (master?.sku && detail.get(master.sku)) || [...detail.values()][0]
  const filled: string[] = []
  if (face) {
    const sources = product.review?.sources ?? {}
    const offered: Record<(typeof DESCRIPTIVE)[number], unknown> = {
      imageUrl: face.imageUrl || null,
      description: face.description || null,
      category: face.category || null,
      brand: face.brand || null,
      weightGrams: face.weightGrams ?? null,
      vatRate: face.vatRate ?? null,
    }
    const next = { ...after } as unknown as Record<string, unknown>
    for (const key of DESCRIPTIVE) {
      const value = offered[key]
      if (isBlank(value)) continue
      const theirs = sources[key as keyof CatalogueProduct] === 'supplier'
      if (!isBlank(next[key]) && !theirs) continue
      if (JSON.stringify(next[key]) === JSON.stringify(value)) continue
      next[key] = value
      filled.push(key)
    }
    after = next as unknown as CatalogueProduct
  }
  for (const key of ['cost', 'supplierRrp', 'supplierProductId'] as const) {
    if (JSON.stringify(after[key] ?? null) !== JSON.stringify(product[key] ?? null)) filled.push(key)
  }

  note(
    detail.size > 0
      ? `PowerBody answered for ${detail.size} of ${skus.length} SKU${skus.length === 1 ? '' : 's'}.`
      : 'PowerBody answered for none of its SKUs.',
  )
  return { before: product, after, filled, changed, answered: detail.size, unresolved, trace }
}
