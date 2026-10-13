import type { CatalogueProduct } from '@/lib/catalogue/types'
import type { SupplierProduct, SupplierProvider } from './types'
import { masterVariant } from '@/lib/catalogue/master'
import { isPowerBodyId, repriceVariants, type SkuFacts } from './variant-pricing'
import { noProductDetail } from './no-detail'
import { indexedProductIds } from '@/lib/portal/supplier-index'
import { resolveCode, normaliseCode, refusalOf, type CodeResolution, type RefusalKind } from './resolve-code'
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
  /** SKUs whose id could not be found, with why — and the refusal kind when PowerBody refused. */
  unresolved: Array<{ sku: string; message: string; refusal?: RefusalKind }>
  /**
   * PowerBody refused outright (rate limit, DEMO sandbox, login, their error),
   * in their words. A caller working through many products stops on this
   * rather than reading the wording of `unresolved`.
   */
  refused?: { kind: RefusalKind; message: string }
  trace: ResolveStep[]
}

const DESCRIPTIVE = ['imageUrl', 'description', 'category', 'brand', 'weightGrams', 'vatRate'] as const

/**
 * Blank: nothing there. A weight of 0 is "not known yet"; a VAT rate of 0 is a
 * real answer (zero-rated), so a founder's 0% is never treated as a gap to fill.
 */
function isBlank(value: unknown, key?: string): boolean {
  if (value === 0) return key !== 'vatRate'
  return value === null || value === undefined || (typeof value === 'string' && value.trim() === '')
}

/**
 * What a pull has gathered so far: PowerBody's answer per SKU as each lands,
 * and what it could not get.
 *
 * Kept OUTSIDE the pull, by whoever runs it, so that a pull which has to be
 * stopped — PowerBody stop answering and one call outlives the request — still
 * leaves what it learned behind. The route settles whatever is here and saves
 * it, instead of the platform killing the request and losing the lot.
 */
export interface PullProgress {
  detail: Map<string, SupplierProduct>
  ids: Map<string, string>
  unresolved: PullResult['unresolved']
  refused?: PullResult['refused']
  trace: ResolveStep[]
}

export function startPull(): PullProgress {
  return { detail: new Map(), ids: new Map(), unresolved: [], trace: [] }
}

/**
 * Ids asked about per detail call while working through the ones we hold.
 *
 * One call for every held id was one unbounded wait: the budget was only
 * looked at between SKUs, after it, so a PowerBody that had stopped answering
 * held the whole request past its limit. In batches the clock is looked at
 * between them, and each batch is the transport's own concurrency.
 */
const HELD_BATCH = 6

/** Below this, no new batch of held ids is started — pull again carries on. */
const HELD_MIN_LEFT_MS = 3_000

export async function pullProduct(
  product: CatalogueProduct,
  options: {
    supplier: SupplierProvider
    budgetMs?: number
    force?: boolean
    onStep?: (step: ResolveStep) => void
    /** Supplied by a caller that may need to stop the pull and keep what it found. */
    progress?: PullProgress
  },
): Promise<PullResult> {
  const progress = options.progress ?? startPull()
  await gatherPull(product, options, progress)
  return settlePull(product, progress, { force: options.force ?? false, supplierName: options.supplier.name })
}

/** Ask PowerBody about every SKU, writing what lands into `progress` as it lands. */
async function gatherPull(
  product: CatalogueProduct,
  options: { supplier: SupplierProvider; budgetMs?: number; onStep?: (step: ResolveStep) => void },
  progress: PullProgress,
): Promise<void> {
  const startedAt = Date.now()
  const budget = options.budgetMs ?? 150_000
  const left = () => budget - (Date.now() - startedAt)
  const { trace, detail, ids, unresolved } = progress
  const note = (message: string) => {
    const step: ResolveStep = { phase: 'canary', message, probes: 0 }
    trace.push(step)
    options.onStep?.(step)
  }

  const skus = skusOf(product)
  if (skus.length === 0) return

  // The master first: it is the one the product-level facts come from, and if
  // time runs short it is the one that matters most.
  const master = masterVariant(product)
  const ordered = master?.sku ? [master.sku, ...skus.filter((s) => s !== master.sku)] : skus

  // ── Ids, cheapest first ──────────────────────────────────────────────────
  // Only real PowerBody ids, which are numeric. A "P89490" left by a pull in
  // Sample mode is not one, and asking PowerBody for it can only fail.
  for (const v of product.variants) {
    if (v.sku && isPowerBodyId(v.supplierProductId)) ids.set(v.sku, v.supplierProductId)
  }
  if (product.variants.length === 1 && isPowerBodyId(product.supplierProductId) && skus[0]) ids.set(skus[0], product.supplierProductId)
  const indexed = await indexedProductIds(ordered.filter((s) => !ids.has(s))).catch(() => new Map())
  for (const [sku, hit] of indexed) if (isPowerBodyId(hit.productId)) ids.set(sku, hit.productId)

  // ── Detail for every id we hold ───────────────────────────────────────────
  /** Refusals that will refuse the next call too — asking again only digs deeper. */
  const blocks = (kind: RefusalKind) => kind !== 'supplier-error'
  const known = [...new Set(ordered.map((s) => ids.get(s)).filter((id): id is string => Boolean(id)))]
  if (known.length > 0) {
    note(`Asking PowerBody about ${known.length} SKU${known.length === 1 ? '' : 's'} whose ids we already hold.`)
    for (let i = 0; i < known.length; i += HELD_BATCH) {
      if (i > 0 && left() < HELD_MIN_LEFT_MS) {
        note('Out of time before asking about the rest of the ids we hold — pull again to carry on.')
        break
      }
      const batch = known.slice(i, i + HELD_BATCH)
      try {
        for (const p of await options.supplier.getProductsById(batch)) {
          // Checked, never assumed: an id that now answers for another SKU has
          // moved, and its facts belong to some other product.
          const sku = normaliseCode(p.sku ?? '')
          const asked = ordered.find((s) => normaliseCode(s) === sku)
          if (asked && ids.get(asked) === String(p.productId ?? ids.get(asked))) detail.set(asked, p)
        }
      } catch (err) {
        const refusal = refusalOf(err)
        if (noProductDetail(err) && refusal.kind === 'supplier-error') {
          /*
            No product at these ids any more — a delisted product, a mistyped id
            in the per-SKU box. That is about these SKUs, not the account: they
            are looked up properly below, exactly like SKUs with no id at all.
            It used to be read as the account refusing ("DEMO sandbox"), which
            skipped the lookup and stopped Pull all on the first such product.
          */
          note(`PowerBody have no product at ${batch.length === 1 ? `id ${batch[0]}` : `ids ${batch.join(', ')}`} any more, so ${batch.length === 1 ? 'that SKU is' : 'those SKUs are'} being looked up again.`)
          continue
        }
        note(`PowerBody would not answer: ${err instanceof Error ? err.message : String(err)}`)
        progress.refused = { kind: refusal.kind, message: refusal.message }
        if (blocks(refusal.kind)) break
      }
    }
  }

  // ── Anything still unknown is looked up properly ──────────────────────────
  for (const sku of ordered.filter((s) => !detail.has(s))) {
    const refused = progress.refused
    if (refused && blocks(refused.kind)) {
      unresolved.push({ sku, message: refused.message, refusal: refused.kind })
      continue
    }
    if (left() < 8_000) {
      unresolved.push({ sku, message: 'Not reached this time — pull again to carry on.' })
      continue
    }
    const outcome: CodeResolution = await resolveCode(sku, {
      supplier: options.supplier,
      budgetMs: Math.min(left() - 2_000, 90_000),
      onStep: (s) => {
        trace.push(s)
        options.onStep?.(s)
      },
    })
    if (outcome.status === 'found' && outcome.product) {
      // The answer must be THIS SKU. An all-digit SKU is tried as a product id
      // first, and the product at that id can be anything at all; only its own
      // SKU (or the same with its P back on) is this one.
      const landed = normaliseCode(outcome.product.sku ?? '')
      const mine = normaliseCode(sku)
      if (landed === mine || landed === `P${mine}`) detail.set(sku, outcome.product)
      else unresolved.push({ sku, message: `${sku} found product ${outcome.productId ?? ''} (${outcome.product.sku}), which is a different SKU — nothing was taken from it. Paste its PowerBody product id on the SKU instead.` })
    } else if (outcome.status === 'refused' && outcome.refusal) {
      unresolved.push({ sku, message: outcome.message, refusal: outcome.refusal })
      progress.refused ??= { kind: outcome.refusal, message: outcome.message }
      if (blocks(outcome.refusal)) progress.refused = { kind: outcome.refusal, message: outcome.message }
    } else unresolved.push({ sku, message: outcome.message })
  }

  note(
    detail.size > 0
      ? `PowerBody answered for ${detail.size} of ${skus.length} SKU${skus.length === 1 ? '' : 's'}.`
      : 'PowerBody answered for none of its SKUs.',
  )
}

function skusOf(product: CatalogueProduct): string[] {
  return [...new Set(product.variants.map((v) => v.sku).filter((s): s is string => Boolean(s)))]
}

/**
 * Turn what a pull gathered into the product it should become. Pure.
 *
 * Run at the end of every pull — and by the route on what a pull had gathered
 * when it had to be stopped (`stopped`), so what PowerBody DID answer is saved
 * and the SKUs it never got to are reported as not reached.
 */
export function settlePull(
  product: CatalogueProduct,
  progress: PullProgress,
  options: { force: boolean; supplierName?: string; stopped?: boolean },
): PullResult {
  const { detail, ids, trace } = progress
  const unresolved = [...progress.unresolved]
  const refused = progress.refused
  const skus = skusOf(product)
  if (skus.length === 0) {
    return { before: product, after: product, filled: [], changed: {}, answered: 0, unresolved: [], trace }
  }
  for (const sku of skus) {
    if (detail.has(sku) || unresolved.some((u) => u.sku === sku)) continue
    unresolved.push({
      sku,
      message: options.stopped
        ? 'Not reached — PowerBody stopped answering before this SKU’s turn. Pull again to carry on.'
        : 'Not reached this time — pull again to carry on.',
    })
  }
  const master = masterVariant(product)

  // ── Per-SKU facts, through the pricing rules ──────────────────────────────
  // No id is written back from the Sample supplier at all: its ids are its own
  // invention ("P89490"), and once stored they would be sent to PowerBody by
  // the next pull, the nightly sync and the checkout's stock check.
  const writeIds = options.supplierName !== 'mock'
  const facts = new Map<string, SkuFacts>()
  for (const [sku, p] of detail) {
    const id = p.productId ? String(p.productId) : ids.get(sku) ?? null
    facts.set(sku, {
      cost: p.wholesalePrice > 0 ? p.wholesalePrice : null,
      rrp: p.rrp > 0 ? p.rrp : null,
      servings: p.servings,
      name: p.name || null,
      image: p.imageUrl || null,
      productId: writeIds && isPowerBodyId(id) ? id : null,
    })
  }
  const repriced = repriceVariants(product, facts, options.force)
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
      if (!isBlank(next[key], key) && !theirs) continue
      if (JSON.stringify(next[key]) === JSON.stringify(value)) continue
      next[key] = value
      filled.push(key)
    }
    after = next as unknown as CatalogueProduct
  }
  for (const key of ['cost', 'supplierRrp', 'supplierProductId'] as const) {
    if (JSON.stringify(after[key] ?? null) !== JSON.stringify(product[key] ?? null)) filled.push(key)
  }

  return { before: product, after, filled, changed, answered: detail.size, unresolved, trace, ...(refused ? { refused } : {}) }
}
