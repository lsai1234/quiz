/**
 * Mock PowerBody supplier — stands in for the real API until access lands.
 *
 * `getProduct` / `getProductsBySku` / `getStockLevels` read the fixtures; stock
 * drifts by a small, deterministic amount per day so "live stock" visibly moves
 * between days without being random inside a single request (keeps tests
 * stable). Out-of-stock fixtures stay at zero so the stock-alerts journey always
 * has a case to demo. Orders are kept in a process-local map — the durable order
 * record lives in the app database (Phase 3); this is only the supplier's echo.
 */
import type {
  SupplierOrder,
  SupplierOrderInput,
  SupplierOrderResult,
  SupplierFeed,
  SupplierProduct,
  SupplierProvider,
  SupplierStockLevel,
} from '../types'
import { POWERBODY_FIXTURES } from './fixtures'

/** Stable per-day pseudo-random offset in [-10, +10] for a SKU. */
function dailyDrift(sku: string): number {
  const day = Math.floor(Date.now() / 86_400_000)
  const key = `${sku}:${day}`
  let h = 0
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0
  return (h % 21) - 10
}

// Demo affordance: SKUs a founder has forced out of stock from the stock-alerts
// page, so the daily-check journey can be exercised on demand. Process-local.
const forcedOutOfStock = new Set<string>()

/** Force (or clear) a SKU out of stock for demos/tests. */
export function forceOutOfStock(sku: string, on = true): void {
  if (on) forcedOutOfStock.add(sku)
  else forcedOutOfStock.delete(sku)
}
export function getForcedOutOfStock(): string[] {
  return [...forcedOutOfStock]
}
export function __resetForcedOutOfStock(): void {
  forcedOutOfStock.clear()
}

// The same affordance for cost: fixture prices never move, so without this the
// price-change journey can't be exercised until a real supplier puts something
// up. Process-local, mock-only.
const forcedWholesale = new Map<string, number>()

/** Force (or clear) a SKU's wholesale cost for demos/tests. */
export function forceWholesalePrice(sku: string, price: number | null): void {
  if (price === null) forcedWholesale.delete(sku)
  else forcedWholesale.set(sku, price)
}
export function getForcedWholesalePrices(): Record<string, number> {
  return Object.fromEntries(forcedWholesale)
}
export function __resetForcedWholesale(): void {
  forcedWholesale.clear()
}

/** Cost for a SKU: the fixture price unless a demo has overridden it. */
function currentWholesale(sku: string, base: number): number {
  return forcedWholesale.get(sku) ?? base
}

/** Current stock for a SKU: the fixture level nudged by the daily drift, floored
 *  at 0. A genuinely out-of-stock fixture (0), or one force-flagged for a demo,
 *  stays out of stock. */
function currentStock(sku: string, baseStock: number): number {
  if (baseStock <= 0 || forcedOutOfStock.has(sku)) return 0
  return Math.max(0, baseStock + dailyDrift(sku))
}

function withCurrentStock(p: SupplierProduct): SupplierProduct {
  const stock = currentStock(p.sku, p.stock)
  return { ...p, stock, inStock: stock > 0, wholesalePrice: currentWholesale(p.sku, p.wholesalePrice) }
}

// Process-local order store (supplier-side echo only).
const orders = new Map<string, SupplierOrder>()

export function createMockSupplier(): SupplierProvider {
  return {
    name: 'mock',

    async getProduct(sku) {
      const found = POWERBODY_FIXTURES.find((p) => p.sku === sku)
      return found ? withCurrentStock(found) : null
    },

    async sampleSkus(limit: number) {
      return POWERBODY_FIXTURES.slice(0, Math.max(1, limit)).map((p) => p.sku)
    },

    async getProductsBySku(skus) {
      // The fixtures are always fully detailed, so this is just a lookup. Order
      // follows the request, and unknown SKUs simply drop out.
      const wanted = new Set(skus)
      return POWERBODY_FIXTURES.filter((p) => wanted.has(p.sku)).map(withCurrentStock)
    },

    async getProductsById(productIds) {
      // The live adapter skips the feed walk here; the mock has no feed to walk,
      // so this is the same lookup against the fixtures' stand-in ids. Unknown
      // ids drop out, matching the SKU path.
      const wanted = new Set(productIds.map((id) => String(id ?? '').trim()).filter(Boolean))
      return POWERBODY_FIXTURES.filter((p) => p.productId && wanted.has(p.productId)).map(withCurrentStock)
    },

    async getFeed() {
      // The fixtures are the whole feed by definition — there is no paging to
      // fall short of, so this is always complete and never resumes.
      return { levels: await this.getStockLevels(), complete: true, pages: 1, nextPage: null, stoppedBy: 'end' as const, reachedPage: 1 }
    },

    async getStockLevels(skus) {
      const wanted = skus && skus.length > 0 ? new Set(skus) : null
      return POWERBODY_FIXTURES.filter((p) => !wanted || wanted.has(p.sku)).map((p) => {
        const stock = currentStock(p.sku, p.stock)
        const level: SupplierStockLevel = {
          sku: p.sku,
          productId: p.productId,
          stock,
          inStock: stock > 0,
          wholesalePrice: currentWholesale(p.sku, p.wholesalePrice),
          rrp: p.rrp,
          updatedAt: new Date().toISOString(),
        }
        return level
      })
    },

    async placeOrder(input: SupplierOrderInput): Promise<SupplierOrderResult> {
      const supplierOrderId = `PB-${Date.now()}-${Math.floor(Math.random() * 1e4)
        .toString()
        .padStart(4, '0')}`
      const order: SupplierOrder = {
        supplierOrderId,
        reference: input.reference,
        status: 'received',
        lines: input.lines,
        trackingNumber: null,
        updatedAt: new Date().toISOString(),
      }
      orders.set(supplierOrderId, order)
      return { supplierOrderId, status: 'received' }
    },

    /**
     * Overwrite a stored order, found by OUR reference — which is how their
     * `updateOrder` is keyed, so a simulated correction resolves the order the
     * same way a real one does.
     */
    async updateOrder(input: SupplierOrderInput): Promise<SupplierOrderResult> {
      const existing = [...orders.values()].find((o) => o.reference === input.reference)
      if (!existing) throw new Error(`No supplier order for reference ${input.reference} to update.`)
      const updated: SupplierOrder = {
        ...existing,
        lines: input.lines,
        updatedAt: new Date().toISOString(),
      }
      orders.set(existing.supplierOrderId, updated)
      return { supplierOrderId: existing.supplierOrderId, status: updated.status }
    },

    async getOrder(supplierOrderId) {
      return orders.get(supplierOrderId) ?? null
    },

    async listOrders() {
      return [...orders.values()]
    },
  }
}

/** Reset the process-local order store (tests only). */
export function __resetMockOrders(): void {
  orders.clear()
}
