/**
 * Mock PowerBody supplier — stands in for the real API until access lands.
 *
 * `listProducts` / `getProduct` / `getStockLevels` read the fixtures; stock
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

/** Current stock for a SKU: the fixture level nudged by the daily drift, floored
 *  at 0. A genuinely out-of-stock fixture (0) stays out of stock. */
function currentStock(sku: string, baseStock: number): number {
  if (baseStock <= 0) return 0
  return Math.max(0, baseStock + dailyDrift(sku))
}

function withCurrentStock(p: SupplierProduct): SupplierProduct {
  const stock = currentStock(p.sku, p.stock)
  return { ...p, stock, inStock: stock > 0 }
}

// Process-local order store (supplier-side echo only).
const orders = new Map<string, SupplierOrder>()

export function createMockSupplier(): SupplierProvider {
  return {
    name: 'mock',

    async listProducts() {
      return POWERBODY_FIXTURES.map(withCurrentStock)
    },

    async getProduct(sku) {
      const found = POWERBODY_FIXTURES.find((p) => p.sku === sku)
      return found ? withCurrentStock(found) : null
    },

    async getStockLevels(skus) {
      const wanted = skus && skus.length > 0 ? new Set(skus) : null
      return POWERBODY_FIXTURES.filter((p) => !wanted || wanted.has(p.sku)).map((p) => {
        const stock = currentStock(p.sku, p.stock)
        const level: SupplierStockLevel = {
          sku: p.sku,
          stock,
          inStock: stock > 0,
          wholesalePrice: p.wholesalePrice,
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
