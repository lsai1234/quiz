/**
 * Live PowerBody supplier adapter.
 *
 * Implements the same `SupplierProvider` interface the mock does, over the SOAP
 * client in `./soap.ts`, so nothing outside this folder knows which one it is
 * talking to. Flip to it with `SUPPLIER_SOURCE=powerbody` (or the Founders Hub
 * Settings → Supplier toggle) once the credentials below are set.
 *
 * Two things shape the design:
 *
 *  1. **The feed is split in two.** `getProductList` is cheap, paged, and
 *     carries sku/price/qty — everything a stock-and-price refresh needs.
 *     `getProductInfo` is one call *per product* and is the only source of name,
 *     brand, image and description. So `getStockLevels()` uses the cheap call
 *     alone, and only `listProducts()` pays for detail. Getting this backwards
 *     turns a nightly stock check into thousands of API calls.
 *
 *  2. **Placing an order is not idempotent.** `createOrder` errors on a repeat,
 *     so our own order id goes in as `id` and `ALREADY_EXISTS` is read as
 *     success — see `readOrderAck` in ./wire.ts.
 *
 * Server-only.
 */
import type {
  SupplierOrder,
  SupplierOrderInput,
  SupplierOrderResult,
  SupplierProduct,
  SupplierProvider,
  SupplierStockLevel,
} from '../types'
import { createSoapClient, type PowerBodySoapClient } from './soap'
import {
  readOrderAck,
  toCreateOrderPayload,
  toStockLevel,
  toSupplierOrder,
  toSupplierProduct,
  type CreateOrderContext,
  type PbOrder,
  type PbOrderResponse,
  type PbProductInfo,
  type PbProductListItem,
} from './wire'

/** Their list feed is paged; stop when a page comes back empty. The cap is a
 *  guard against a feed that never returns an empty page, not a real limit. */
const MAX_PAGES = 200

/** Concurrent `getProductInfo` calls during a full catalogue build. Enough to
 *  make a few thousand products tolerable, low enough to stay a polite client. */
const DETAIL_CONCURRENCY = 6

/** How long a built catalogue is reused. `listProducts` is expensive; the pages
 *  that call it (the hub's "scan & add" browser) are read-repeatedly. Stock is
 *  NOT served from here — `getStockLevels` always goes to the wire. */
const CATALOGUE_TTL_MS = 10 * 60 * 1000

interface Cached {
  at: number
  products: SupplierProduct[]
}

let catalogueCache: Cached | null = null

/** Drop the cached catalogue (tests, and after an explicit resync). */
export function __resetPowerBodyCache(): void {
  catalogueCache = null
}

/** Run `worker` over `items` with a bounded number in flight. */
async function mapLimit<T, R>(items: T[], limit: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let next = 0
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const index = next++
      if (index >= items.length) return
      results[index] = await worker(items[index])
    }
  })
  await Promise.all(runners)
  return results
}

export interface PowerBodyProviderOptions {
  /** Injected by tests; otherwise built from the environment. */
  client?: PowerBodySoapClient
  /** Extra fields for `createOrder` that only the caller knows (weight, our
   *  shipping charge, per-line prices for their invoice). */
  orderContext?: (order: SupplierOrderInput) => CreateOrderContext
}

export function createPowerBodyProvider(options: PowerBodyProviderOptions = {}): SupplierProvider {
  const client = options.client ?? clientFromEnv()

  /** Page through `getProductList` until a page comes back empty. */
  async function fetchAllListItems(): Promise<PbProductListItem[]> {
    const all: PbProductListItem[] = []
    for (let page = 1; page <= MAX_PAGES; page++) {
      const rows = await client.call<PbProductListItem[] | null>('dropshipping.getProductList', { page })
      if (!Array.isArray(rows) || rows.length === 0) break
      all.push(...rows)
    }
    return all
  }

  async function fetchDetail(item: PbProductListItem): Promise<PbProductInfo | null> {
    const id = item.product_id
    if (id === undefined || id === null || id === '') return null
    try {
      const info = await client.call<PbProductInfo | null>('dropshipping.getProductInfo', id)
      // getProductInfo omits the list-only fields (qty is the one that matters),
      // so the list row stays underneath rather than being replaced by it.
      return info ? { ...item, ...info } : null
    } catch {
      // One unreadable product must not sink a whole catalogue sync. It simply
      // maps from its list row, which is enough to keep stock accurate.
      return null
    }
  }

  /** The full catalogue, detail included. Named rather than reached through
   *  `this`, so the provider survives being destructured. */
  async function listProducts(): Promise<SupplierProduct[]> {
    if (catalogueCache && Date.now() - catalogueCache.at < CATALOGUE_TTL_MS) {
      return catalogueCache.products
    }
    const items = await fetchAllListItems()
    const detailed = await mapLimit(items, DETAIL_CONCURRENCY, fetchDetail)
    const updatedAt = new Date().toISOString()
    const products = items
      .map((item, i) => toSupplierProduct(detailed[i] ?? item, updatedAt))
      .filter((p) => p.sku !== '')
    catalogueCache = { at: Date.now(), products }
    return products
  }

  return {
    name: 'powerbody',

    listProducts,

    async getProduct(sku: string): Promise<SupplierProduct | null> {
      // getProductInfo is keyed by their numeric product id, not by SKU, so the
      // list feed is what resolves one to the other. The cached catalogue makes
      // this a single call in the common case.
      const products = await listProducts()
      return products.find((p) => p.sku === sku) ?? null
    },

    async getStockLevels(skus?: string[]): Promise<SupplierStockLevel[]> {
      // Always live — this is the call the daily check exists to make.
      const items = await fetchAllListItems()
      const updatedAt = new Date().toISOString()
      const wanted = skus && skus.length > 0 ? new Set(skus) : null
      return items
        .map((item) => toStockLevel(item, updatedAt))
        .filter((level) => level.sku !== '' && (!wanted || wanted.has(level.sku)))
    },

    async placeOrder(order: SupplierOrderInput): Promise<SupplierOrderResult> {
      const payload = toCreateOrderPayload(order, options.orderContext?.(order) ?? {})
      const response = await client.call<PbOrderResponse | null>('dropshipping.createOrder', payload)
      const ack = readOrderAck(response)
      if (!ack.ok) {
        throw new Error(
          `PowerBody rejected order ${order.reference}: ${ack.response}. ` +
            'Nothing has shipped — fix the order and send it again.',
        )
      }
      // They answer with a status but not always their own order id; our
      // reference is the durable handle either way, and `getOrder` resolves the
      // rest on the next status sync.
      const supplierOrderId =
        response?.powerbody_order_id != null && String(response.powerbody_order_id) !== ''
          ? String(response.powerbody_order_id)
          : order.reference
      return { supplierOrderId, status: toSupplierOrder({ ...response, status: response?.status }).status }
    },

    async getOrder(supplierOrderId: string): Promise<SupplierOrder | null> {
      // `ids` matches on our reference, which is what we sent as `id`. An order
      // we only know by their increment id is found by scanning the same reply.
      const rows = await client.call<PbOrder[] | null>('dropshipping.getOrders', { ids: [supplierOrderId] })
      const found = Array.isArray(rows)
        ? rows.find(
            (r) => String(r.order_id) === supplierOrderId || String(r.powerbody_order_id) === supplierOrderId,
          )
        : null
      return found ? toSupplierOrder(found) : null
    },

    async listOrders(): Promise<SupplierOrder[]> {
      // No parameters = the current day's orders plus anything they removed,
      // which is exactly the window a status sync cares about.
      const rows = await client.call<PbOrder[] | null>('dropshipping.getOrders', {})
      return Array.isArray(rows) ? rows.map((r) => toSupplierOrder(r)) : []
    },
  }
}

function clientFromEnv(): PowerBodySoapClient {
  const url = process.env.POWERBODY_API_URL
  const username = process.env.POWERBODY_API_USER
  const apiKey = process.env.POWERBODY_API_KEY
  if (!url || !username || !apiKey) {
    throw new Error(
      'POWERBODY_API_URL, POWERBODY_API_USER and POWERBODY_API_KEY must all be set to use the live PowerBody adapter.',
    )
  }
  return createSoapClient({ url, username, apiKey })
}
