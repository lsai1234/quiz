/**
 * "Can PowerBody supply these, right now?" — asked live, item by item.
 *
 * The catalogue's own `available` flag is only as fresh as the last nightly
 * sync, and the nightly sync reads PowerBody's list feed, which stops at about
 * 3,000 products of a catalogue of 8,000+. A product past that ceiling never had
 * its stock refreshed at all. So an order could be taken for something that
 * sold out days ago, and the first anybody heard of it was PowerBody refusing
 * the order (which is how this file came to exist).
 *
 * This asks PowerBody about the specific products in a basket or an order, by
 * PowerBody's own product id — one detail call per product, no paging — and
 * answers in three parts: what is short, what could not be confirmed, and what
 * came back.
 *
 * ── Who uses it, and how they treat "could not confirm" ─────────────────────
 *   • Checkout: fails OPEN. PowerBody being slow is not a reason to refuse a
 *     customer's money for products the catalogue says are in stock; a rare miss
 *     is caught later by the auto-send and the order page.
 *   • Auto-send: fails CLOSED. An unconfirmed item means a person looks first.
 *
 * Read-only at PowerBody's end. Server-only.
 */
import { getSupplier, getSupplierSource } from './index'
import { productIdForSku } from './product-id-map'
import type { SupplierProduct, SupplierProductStub, SupplierProvider } from './types'

export interface StockCheckItem {
  sku: string
  quantity: number
  /** What the customer knows it as — for the message. */
  title: string
  /** PowerBody's product id, when the catalogue holds it. The fast path. */
  supplierProductId?: string | null
}

export type ShortfallReason =
  /** Nothing left. */
  | 'out-of-stock'
  /** Some left, fewer than wanted. */
  | 'not-enough'
  /** Still listed with stock, but PowerBody have stopped selling it. */
  | 'discontinued'
  /** PowerBody have no product with this code (only said after a full search). */
  | 'not-carried'

export interface StockShortfall {
  sku: string
  title: string
  wanted: number
  /** What PowerBody hold. 0 for not-carried. */
  stock: number
  reason: ShortfallReason
}

/** What PowerBody said about one SKU. */
export interface LiveStock {
  sku: string
  productId: string | null
  stock: number
  inStock: boolean
  wholesalePrice: number
}

export interface StockCheckResult {
  /** False when the check did not run at all (the sample feed, or no SKUs). */
  ran: boolean
  /** Every item's stock was confirmed by PowerBody. */
  confirmed: boolean
  shortfalls: StockShortfall[]
  /** SKUs PowerBody did not answer for in time — neither confirmed nor refused. */
  unconfirmed: string[]
  /** What came back, by SKU, for anyone who wants to remember it. */
  live: LiveStock[]
  /** Why the check stopped short, when it did. */
  error: string | null
}

export interface StockCheckOptions {
  supplier?: SupplierProvider
  /** Wall-clock budget for the whole check. */
  deadlineMs?: number
  /**
   * Also search by SKU for items with no product id. That pages PowerBody's
   * feed and can take its full budget — fine for a background send, wrong for
   * a customer waiting at checkout.
   */
  allowSkuSearch?: boolean
}

const DEFAULT_DEADLINE_MS = 6_000

/** Resolve within the budget, or null. A rejection before then still rejects. */
function withinDeadline<T>(work: Promise<T>, deadline: number): Promise<T | null> {
  const remaining = deadline - Date.now()
  if (remaining <= 0) return Promise.resolve(null)
  return new Promise<T | null>((resolve, reject) => {
    const timer = setTimeout(() => resolve(null), remaining)
    work.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (err) => {
        clearTimeout(timer)
        reject(err)
      },
    )
  })
}

function fromStub(stub: SupplierProductStub): LiveStock {
  return {
    sku: stub.sku,
    productId: stub.productId,
    stock: stub.stock,
    // A stub from a provider that does not report sellability is read on stock
    // alone — the same thing the catalogue would have said.
    inStock: stub.inStock ?? stub.stock > 0,
    wholesalePrice: stub.wholesalePrice,
  }
}

function fromProduct(product: SupplierProduct): LiveStock {
  return {
    sku: product.sku,
    productId: product.productId ?? null,
    stock: product.stock,
    inStock: product.inStock,
    wholesalePrice: product.wholesalePrice,
  }
}

export async function checkLiveStock(
  items: StockCheckItem[],
  options: StockCheckOptions = {},
): Promise<StockCheckResult> {
  // One entry per SKU, quantities summed: two lines of the same tub need two.
  const wanted = new Map<string, StockCheckItem>()
  for (const item of items) {
    if (!item.sku) continue
    const seen = wanted.get(item.sku)
    wanted.set(item.sku, seen ? { ...seen, quantity: seen.quantity + item.quantity } : { ...item })
  }
  const skus = [...wanted.keys()]
  const empty: StockCheckResult = { ran: false, confirmed: false, shortfalls: [], unconfirmed: skus, live: [], error: null }
  if (skus.length === 0) return { ...empty, confirmed: true, unconfirmed: [] }
  if (!options.supplier && getSupplierSource() !== 'powerbody') return empty

  const deadline = Date.now() + (options.deadlineMs ?? DEFAULT_DEADLINE_MS)
  const found = new Map<string, LiveStock>()
  let error: string | null = null
  const note = (err: unknown) => {
    error ??= err instanceof Error ? err.message : String(err)
  }

  let supplier: SupplierProvider
  try {
    supplier = options.supplier ?? (await getSupplier())
  } catch (err) {
    note(err)
    return { ...empty, ran: true, error }
  }

  // ── By product id: one detail call each, nothing paged, nothing cached ──
  const ids = new Map<string, string>()
  for (const [sku, item] of wanted) {
    const id = item.supplierProductId ?? productIdForSku(sku)
    if (id != null && String(id) !== '') ids.set(String(id), sku)
  }
  if (ids.size > 0) {
    try {
      const reply = await withinDeadline(
        supplier.probeProductIds
          ? supplier.probeProductIds([...ids.keys()]).then((stubs) => stubs.map(fromStub))
          : supplier.getProductsById([...ids.keys()]).then((products) => products.map(fromProduct)),
        deadline,
      )
      if (reply === null) error ??= 'PowerBody did not answer in time.'
      // Accepted only when the product behind the id carries the SKU asked for:
      // a stale id must cost a wasted call, never a wrong answer.
      for (const stock of reply ?? []) if (wanted.has(stock.sku)) found.set(stock.sku, stock)
    } catch (err) {
      note(err)
    }
  }

  // ── By SKU, for what the ids did not settle — only where waiting is fine ──
  const missing = skus.filter((sku) => !found.has(sku))
  let searchedAll = false
  if (missing.length > 0 && options.allowSkuSearch) {
    try {
      const products = await withinDeadline(supplier.getProductsBySku(missing), deadline)
      if (products === null) error ??= 'PowerBody did not answer in time.'
      else searchedAll = true
      for (const product of products ?? []) if (missing.includes(product.sku)) found.set(product.sku, fromProduct(product))
    } catch (err) {
      note(err)
    }
  }

  const shortfalls: StockShortfall[] = []
  const unconfirmed: string[] = []
  for (const [sku, item] of wanted) {
    const stock = found.get(sku)
    if (!stock) {
      // "Not carried" only when a search that could have found it finished and
      // did not. An id that did not answer proves nothing either way.
      if (searchedAll && !error) {
        shortfalls.push({ sku, title: item.title, wanted: item.quantity, stock: 0, reason: 'not-carried' })
      } else {
        unconfirmed.push(sku)
      }
      continue
    }
    if (!stock.inStock && stock.stock > 0) {
      shortfalls.push({ sku, title: item.title, wanted: item.quantity, stock: stock.stock, reason: 'discontinued' })
    } else if (stock.stock < item.quantity || !stock.inStock) {
      shortfalls.push({
        sku,
        title: item.title,
        wanted: item.quantity,
        stock: Math.max(0, stock.stock),
        reason: stock.stock <= 0 ? 'out-of-stock' : 'not-enough',
      })
    }
  }

  return {
    ran: true,
    confirmed: unconfirmed.length === 0,
    shortfalls,
    unconfirmed,
    live: [...found.values()],
    error,
  }
}

/** One shortfall, as a sentence for a customer. */
export function describeShortfall(shortfall: StockShortfall): string {
  switch (shortfall.reason) {
    case 'not-enough':
      return `${shortfall.title}: only ${shortfall.stock} left`
    case 'discontinued':
      return `${shortfall.title}: no longer available`
    default:
      return `${shortfall.title}: sold out`
  }
}
