/**
 * A stored copy of everything PowerBody's cheap list feed will tell us.
 *
 * WHY KEEP ONE
 * ────────────
 * `getProductInfo` — the only source of a picture, a name or a description — is
 * keyed on PowerBody's `product_id`. Nothing we hold maps a SKU to one, and the
 * only bulk source of that mapping is `getProductList`, which is paged and
 * throttled. Resolving a SKU therefore costs a walk through their feed EVERY
 * TIME, and for a SKU their feed cannot reach it costs a binary search of tens
 * of throttled requests.
 *
 * The feed is the same for everybody and changes slowly. So it is read once,
 * across as many passes as it takes, and kept. After that a SKU resolves out of
 * a lookup table: no paging, no searching, no rate limit, no deadline.
 *
 * WHAT IT IS NOT
 * ──────────────
 * Not a source of truth for anything a customer sees. `product_id` is the one
 * field here that does not change, and it is the one this exists for. Stock and
 * price are stored alongside it because the same rows carry them for free and
 * they are genuinely useful for a per-variant availability check at import
 * time — but anything going on sale re-reads them live. A stale entry can cost
 * a wasted call; it must never cost a wrong price.
 *
 * WHAT IT CANNOT DO
 * ─────────────────
 * It holds what the feed hands over, which on this account has been 3,000
 * products against a catalogue of 8,000+. `complete` says whether the feed
 * actually ended or merely stopped, so a SKU that is absent is only evidence of
 * absence when the crawl finished. Everything else still needs the search.
 */
import { readJson, writeJson } from './persist'
import type { SupplierStockLevel } from '@/lib/supplier/types'

const INDEX_FILE = 'supplier-index'

export interface IndexedProduct {
  productId: string
  /** Units PowerBody held when this row was read. Indicative, never sold from. */
  qty: number
  /** Their wholesale price at that moment, for the same reason. */
  price: number
  /** Product name, when a sweep found it. The list feed carries no name. */
  name?: string
  /** True when this came from sweeping ids rather than from the list feed —
   *  which is to say, it is one of the products the feed cannot reach. */
  swept?: boolean
}

export interface SupplierIndex {
  bySku: Record<string, IndexedProduct>
  /** Pages read across every pass so far. */
  pagesRead: number
  /**
   * True only when the feed itself ended.
   *
   * The distinction the whole thing turns on. A crawl that stopped because it
   * ran out of budget looks identical to one that reached the end, and reading
   * absence from the first is how a real product gets struck off a roster.
   */
  complete: boolean
  /** When the last pass finished. */
  updatedAt: string | null
  /**
   * How far the id sweep has got.
   *
   * The list feed stops at a server-side ceiling; `getProductInfo` does not, so
   * sweeping ids past that ceiling is the only route to the rest of the
   * catalogue. It takes thousands of throttled requests, so it runs in passes
   * and has to remember where it was — a sweep that restarted from the
   * beginning each time would never finish.
   */
  sweptTo: number | null
  /** Ids visited by the sweep, including the empty ones. The cost measure. */
  sweptIds: number
  /** Products the sweep found that the feed never could. */
  sweptFound: number
  /**
   * Consecutive empty ids at the point the last pass handed back.
   *
   * Carried across passes deliberately. The sweep ends when it has seen a long
   * enough run of nothing, and a run that resets to zero at every pass boundary
   * can never reach the threshold — the sweep would then walk to infinity, one
   * request every 150ms, and never conclude.
   */
  sweptEmptyRun: number
  /**
   * True once the sweep has seen enough consecutive empty ids to conclude the
   * catalogue has ended. Reported, never assumed — the same rule as `complete`.
   */
  sweepComplete: boolean
}

const EMPTY: SupplierIndex = {
  bySku: {},
  pagesRead: 0,
  complete: false,
  updatedAt: null,
  sweptTo: null,
  sweptIds: 0,
  sweptFound: 0,
  sweptEmptyRun: 0,
  sweepComplete: false,
}

export async function readSupplierIndex(): Promise<SupplierIndex> {
  return readJson<SupplierIndex>(INDEX_FILE, EMPTY)
}

/** The id we hold for a SKU, or null. */
export async function indexedProductId(sku: string): Promise<string | null> {
  const index = await readSupplierIndex()
  return index.bySku[sku]?.productId ?? null
}

/**
 * Look several SKUs up at once.
 *
 * One read of the stored document rather than one per SKU: importing a hundred
 * products asks about a hundred codes, and the document is measured in hundreds
 * of kilobytes.
 */
export async function indexedProductIds(skus: string[]): Promise<Map<string, IndexedProduct>> {
  const index = await readSupplierIndex()
  const found = new Map<string, IndexedProduct>()
  for (const sku of skus) {
    const hit = index.bySku[sku]
    if (hit) found.set(sku, hit)
  }
  return found
}

/**
 * Fold one pass of the feed into the stored index.
 *
 * Merges rather than replaces, because a crawl arrives in passes — each request
 * can only read so many pages before it runs out of platform budget — and a
 * pass that replaced the document would leave the index holding only the last
 * few pages read.
 *
 * A row with no `product_id` is skipped: that field is the entire point, and an
 * entry without one would occupy a SKU's slot while answering nothing.
 */
export async function mergeIntoIndex(
  levels: SupplierStockLevel[],
  meta: { pagesRead: number; complete: boolean; reset?: boolean },
): Promise<SupplierIndex> {
  const current = meta.reset ? { ...EMPTY } : await readSupplierIndex()
  const bySku = { ...current.bySku }
  for (const level of levels) {
    if (!level.sku || !level.productId) continue
    bySku[level.sku] = { productId: String(level.productId), qty: level.stock, price: level.wholesalePrice }
  }
  const next: SupplierIndex = {
    ...current,
    bySku,
    pagesRead: (meta.reset ? 0 : current.pagesRead) + meta.pagesRead,
    complete: meta.complete,
    updatedAt: new Date().toISOString(),
  }
  await writeJson(INDEX_FILE, next)
  return next
}

/**
 * The highest product id the index holds.
 *
 * Where a sweep starts. Everything at or below it is already known from the
 * feed, and the products the feed cannot reach sit above it — ids run
 * near-monotone in SKU number, and the feed is ordered by ascending id, so its
 * ceiling is an id ceiling as much as a count.
 */
export async function highestIndexedId(): Promise<number> {
  const index = await readSupplierIndex()
  let top = 0
  for (const entry of Object.values(index.bySku)) {
    const id = Number(entry.productId)
    if (Number.isFinite(id) && id > top) top = id
  }
  return top
}

/**
 * Fold one pass of the id sweep into the index.
 *
 * Separate from `mergeIntoIndex` because the two carry different evidence: a
 * feed pass knows how many PAGES it read, a sweep knows how many IDS it
 * visited, and conflating them would make "we have read 40 pages" and "we have
 * tried 40 ids" the same sentence.
 */
export async function mergeSweep(
  found: Array<{ productId: string; sku: string; name: string; wholesalePrice: number; stock: number }>,
  meta: { sweptTo: number; idsVisited: number; sweepComplete: boolean; emptyRun: number },
): Promise<SupplierIndex> {
  const current = await readSupplierIndex()
  const bySku = { ...current.bySku }
  let added = 0
  for (const p of found) {
    if (!p.sku || !p.productId) continue
    if (!bySku[p.sku]) added += 1
    bySku[p.sku] = {
      productId: String(p.productId),
      qty: p.stock,
      price: p.wholesalePrice,
      ...(p.name ? { name: p.name } : {}),
      swept: true,
    }
  }
  const next: SupplierIndex = {
    ...current,
    bySku,
    sweptTo: meta.sweptTo,
    sweptIds: current.sweptIds + meta.idsVisited,
    sweptFound: current.sweptFound + added,
    sweptEmptyRun: meta.emptyRun,
    sweepComplete: meta.sweepComplete,
    updatedAt: new Date().toISOString(),
  }
  await writeJson(INDEX_FILE, next)
  return next
}

export async function clearSupplierIndex(): Promise<void> {
  await writeJson(INDEX_FILE, EMPTY)
}
