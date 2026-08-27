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
}

const EMPTY: SupplierIndex = { bySku: {}, pagesRead: 0, complete: false, updatedAt: null }

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
    bySku,
    pagesRead: (meta.reset ? 0 : current.pagesRead) + meta.pagesRead,
    complete: meta.complete,
    updatedAt: new Date().toISOString(),
  }
  await writeJson(INDEX_FILE, next)
  return next
}

export async function clearSupplierIndex(): Promise<void> {
  await writeJson(INDEX_FILE, EMPTY)
}
