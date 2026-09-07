import { NextResponse } from 'next/server'
import { isPortalAuthed } from '@/lib/portal/guard'
import { getSupplier } from '@/lib/supplier'
import { indexedProductIds } from '@/lib/portal/supplier-index'
import {
  getImportedProducts,
  saveImportedProduct,
  getProductOverrides,
  setProductOverride,
  syncPortalRuntime,
} from '@/lib/portal/store'
import { getResolvedCatalogue } from '@/lib/catalogue/resolve'
import { repriceVariants, sliceBySkuBudget, type SkuFacts } from '@/lib/supplier/variant-pricing'
import type { CatalogueProduct } from '@/lib/catalogue/types'

/**
 * Give every variant its own price and its own serving count.
 *
 * ── The damage this repairs ─────────────────────────────────────────────────
 * Import merged a roster row's sibling SKUs into one product and priced them all
 * from the ROW's main SKU, on the reasoning that a flavour of one tub costs one
 * price. True of flavours. False of everything else that ends up under one
 * master SKU — and the sheet is written by a person, so it happens:
 *
 *   Glycine, 1000mg - 100 vcaps      £11.12 cost   33 servings
 *   Glycine, Pure Powder - 454 grams £20.04 cost  454 servings
 *
 * Both went on the shelf at £14.99 with "33 servings" under each. One is sold
 * at a loss, the other at a price nobody would pay, and the serving count — the
 * number the per-serving price is computed from — is wrong by a factor of
 * fourteen.
 *
 * The import path is fixed (see `supplier/roster-import`), which only helps
 * products imported from now on. This is the pass for everything already here.
 *
 * ── One call per SKU, and a batch small enough to finish ────────────────────
 * Everything this needs — cost, RRP, serving count and picture — is on ONE
 * call: `getProductInfo`, by product id, through the crawled index. So that is
 * the only call it makes.
 *
 * It used to also read `getStockLevels` for the prices, which sounds cheap and
 * is not: that is a walk through PowerBody's whole paged feed, 3,000+ products
 * at fifteen a page, on every run. Two hundred throttled requests to learn
 * prices the detail call was about to hand over anyway — and it ran BEFORE the
 * detail calls, so it spent the request's budget and left nothing for the work.
 *
 * What is left is still not free. The transport allows two requests in flight
 * with a minimum gap between starts (see `soap.ts`), which is the rate limiting
 * — it does not need more. What it needs is less work per request: a hundred
 * SKUs at two-at-a-time is minutes, and a serverless function has sixty
 * seconds. So the pass runs in BATCHES of SKUs, the screen drives the loop, and
 * each request stops early rather than dying if the clock runs down. Nothing is
 * lost when it stops: every batch writes what it repaired before returning.
 *
 * ── What it will not touch ──────────────────────────────────────────────────
 * By default it re-prices a variant only where the siblings' COSTS actually
 * differ and the shelf is still showing them at one shared price — the exact
 * signature of the bug. A product somebody has priced by hand has variants that
 * already differ, so it is left alone. `force` re-prices every variant of every
 * multi-SKU product from its own cost, which is the deliberate, separate action.
 *
 * Servings and cost are FACTS, not decisions, so they are written wherever the
 * supplier answered — except on accessories, which have no dose and no servings
 * to be right about.
 *
 * GET reports what it would do and changes nothing. POST does it.
 */
export const dynamic = 'force-dynamic'

/** Detail lookups are one throttled call per SKU, so this needs the room a lookup gets. */
export const maxDuration = 60

interface Repair {
  productId: string
  title: string
  /** SKU → what changed on it, in words a founder can check. */
  changed: Record<string, string>
}

/** Every product whose variants map to more than one supplier SKU. */
function isMultiSku(product: CatalogueProduct): boolean {
  const skus = new Set(product.variants.map((v) => v.sku).filter(Boolean))
  return skus.size > 1
}

/**
 * Every product with more than one supplier SKU behind it, from both places one
 * can live: still `imported` and awaiting review, or live in the catalogue with
 * its edits held as an override.
 */
async function candidates(): Promise<CatalogueProduct[]> {
  await syncPortalRuntime()
  const [imported, resolved, overrides] = await Promise.all([
    getImportedProducts(),
    getResolvedCatalogue(),
    getProductOverrides(),
  ])
  const byId = new Map<string, CatalogueProduct>()
  for (const p of resolved.products) byId.set(p.id, p)
  for (const p of imported) byId.set(p.id, { ...p, ...(overrides[p.id] ?? {}) } as CatalogueProduct)
  return [...byId.values()].filter(isMultiSku)
}

/** A product whose variants are all at one price is the one worth flagging. */
function looksMispriced(product: CatalogueProduct): boolean {
  return new Set(product.variants.map((v) => v.price)).size === 1
}

export async function GET() {
  if (!(await isPortalAuthed())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const affected = await candidates()
  return NextResponse.json({
    products: affected.map((p) => ({
      productId: p.id,
      title: p.title,
      variants: p.variants.length,
      // Whether every variant is showing one price. It is a suspicion, not a
      // fault: most products genuinely are one price in six flavours, and only
      // the supplier's costs can tell the two apart.
      onePrice: looksMispriced(p),
      // Whether anything knows this variant's own serving count yet.
      servingsKnown: p.variants.filter((v) => v.servings != null).length,
      // …and its own picture. A product showing one photograph across six
      // flavours is the visible half of the same gap.
      picturesKnown: p.variants.filter((v) => v.imageUrl).length,
    })),
    total: affected.length,
  })
}

/** What one run managed, in the terms a founder would ask about. */
interface RunReport {
  /** SKUs this batch tried to read. */
  asked: number
  /** …of those, how many PowerBody answered for. */
  answered: number
  /** …and how many the crawled index has no product id for, so nothing could ask. */
  unindexed: string[]
  pricesFound: number
  servingsFound: number
  picturesFound: number
  /** True when the batch took longer than its budget — the supplier is slow. */
  slow: boolean
  /** How long the supplier calls took, in ms. */
  elapsedMs: number
  /** The supplier's own words, when it refused. */
  error: string | null
}

/**
 * How many SKUs one request asks PowerBody about.
 *
 * Each is one throttled `getProductInfo`. At two in flight with a minimum gap
 * and a real round trip apiece, a dozen is a handful of seconds — comfortably
 * inside the function's ceiling even if a couple of them are retried through a
 * rate-limit backoff. The screen sends slices and stitches the results, the
 * same way the roster import does.
 */
const SKUS_PER_BATCH = 12

/**
 * How long a batch is expected to take.
 *
 * Not a timeout — the platform's `maxDuration` is that. This is the line past
 * which the batch says it was slow, so the screen can tell "PowerBody is
 * throttling us" from "PowerBody is not answering", which look identical from a
 * button that has been spinning for a minute.
 */
const RUN_BUDGET_MS = 20_000

/** Ask PowerBody about these SKUs — one detail call each, through the index. */
async function fetchFacts(skus: string[]): Promise<{ facts: Map<string, SkuFacts>; report: RunReport }> {
  const startedAt = Date.now()
  const facts = new Map<string, SkuFacts>()
  const report: RunReport = {
    asked: skus.length,
    answered: 0,
    unindexed: [],
    pricesFound: 0,
    servingsFound: 0,
    picturesFound: 0,
    slow: false,
    elapsedMs: 0,
    error: null,
  }
  if (skus.length === 0) return { facts, report }

  const indexed = await indexedProductIds(skus)
  // A SKU with no id is not a failure to report as an outage: nothing can be
  // asked about it until the feed index has been crawled far enough to hold it.
  report.unindexed = skus.filter((sku) => !indexed.get(sku)?.productId)
  const ids = skus.map((s) => indexed.get(s)?.productId).filter((id): id is string => Boolean(id))

  if (ids.length > 0) {
    try {
      const detailed = await supplierDetail(ids)
      // Verified against the SKU we asked about: an index entry that has moved
      // would otherwise put another product's price on our variant.
      for (const p of detailed.filter((p) => skus.includes(p.sku))) {
        facts.set(p.sku, {
          cost: p.wholesalePrice > 0 ? p.wholesalePrice : null,
          rrp: p.rrp > 0 ? p.rrp : null,
          servings: p.servings,
          name: p.name || null,
          // The detail call is the only place a picture lives, and it is per
          // product id — which at PowerBody means per SKU, so this is a
          // per-flavour photograph rather than the product's.
          image: p.imageUrl || null,
        })
      }
    } catch (err) {
      report.error = err instanceof Error ? err.message : 'PowerBody could not be reached.'
    }
  }

  /*
    No fallback to the crawled index's stored price, deliberately.

    The index holds a price because the same rows carried it for free, and its
    own header states the rule it lives by: a stale entry may cost a wasted
    call, and must never cost a wrong price. Pricing a shelf off a figure read
    on some earlier day is exactly that. A SKU the live call could not answer
    for is left alone and counted as unanswered, which the screen reports —
    a gap that is visible beats a price that is quietly old.
  */

  for (const fact of facts.values()) {
    report.answered += 1
    if (fact.cost != null) report.pricesFound += 1
    if (fact.servings != null) report.servingsFound += 1
    if (fact.image) report.picturesFound += 1
  }
  report.elapsedMs = Date.now() - startedAt
  return { facts, report }
}

/** The detail call, isolated so the route reads as one step per source. */
async function supplierDetail(ids: string[]) {
  const supplier = await getSupplier()
  return supplier.getProductsById(ids)
}

export async function POST(request: Request) {
  if (!(await isPortalAuthed())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let force = false
  let offset = 0
  const raw = await request.text().catch(() => '')
  if (raw.trim()) {
    try {
      const body = JSON.parse(raw) as { force?: boolean; offset?: number }
      force = body.force === true
      const asked = Number(body.offset)
      offset = Number.isFinite(asked) && asked > 0 ? Math.floor(asked) : 0
    } catch {
      return NextResponse.json({ error: 'Malformed request.' }, { status: 400 })
    }
  }

  const affected = await candidates()
  if (affected.length === 0) {
    return NextResponse.json({
      ok: true, repaired: [], total: 0, totalProducts: 0, nextOffset: null,
      message: 'No product has more than one supplier SKU behind it.',
    })
  }

  // Measured in SKUs, not products — see `sliceBySkuBudget`.
  const slice = sliceBySkuBudget(affected.slice(offset), SKUS_PER_BATCH)

  const skus = [
    ...new Set(slice.flatMap((p) => p.variants.map((v) => v.sku).filter((s): s is string => Boolean(s)))),
  ]
  const { facts, report } = await fetchFacts(skus)
  // Informational, not a retry: this batch's slice HAS been processed with
  // whatever landed, so the run moves on either way. It is the signal the
  // screen uses to say the supplier is being slow rather than silent.
  report.slow = report.elapsedMs > RUN_BUDGET_MS

  const imported = new Set((await getImportedProducts()).map((p) => p.id))
  const repaired: Repair[] = []

  for (const product of slice) {
    const result = repriceVariants(product, facts, force)
    if (!result) continue

    /*
      Written back the way that product is stored. An imported product is ours
      to rewrite whole; a live one is edited through an override, because the
      base product is regenerated from the feed and a direct write would be
      lost on the next sync.
    */
    if (imported.has(product.id)) {
      await saveImportedProduct(result.product)
    } else {
      await setProductOverride(product.id, {
        variants: result.product.variants,
        basePrice: result.product.basePrice,
        compareAtPrice: result.product.compareAtPrice,
      })
    }

    repaired.push({ productId: product.id, title: product.title, changed: result.changed })
  }

  const done = offset + slice.length
  return NextResponse.json({
    ok: true,
    // This batch.
    offset,
    products: slice.length,
    totalProducts: affected.length,
    // Where the screen picks up, or null when there is nothing left. It always
    // advances: this batch's products were processed with whatever the supplier
    // gave, and re-reading them would leave everything after them unreachable.
    // A batch that learned nothing is the screen's cue to stop, not to retry.
    nextOffset: done < affected.length ? done : null,
    total: repaired.length,
    variants: repaired.reduce((n, r) => n + Object.keys(r.changed).length, 0),
    report,
    repaired,
  })
}
