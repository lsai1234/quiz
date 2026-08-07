/**
 * Supplier provider contract (PowerBody dropship).
 *
 * Every part of the app that needs catalogue / stock / price data or that places
 * a dropship order talks to this interface — never to PowerBody directly. A mock
 * implementation (`powerbody/mock.ts`) backs it today; the live adapter
 * (`powerbody/live.ts`) is swapped in when API access lands, with no change to
 * any caller. `getSupplier()` in `./index.ts` returns the right one.
 */

// ─── Products / stock ──────────────────────────────────────────────────────────

/** A product as the supplier exposes it — commerce basics only. The CHRGD-specific
 *  attributes (stack slots, goals, claims…) are added by our mapping/AI layer. */
export interface SupplierProduct {
  /** Supplier SKU — the stable key for stock lookups and order lines. */
  sku: string
  name: string
  brand: string
  /** Supplier's own category string, e.g. "Protein", "Pre-Workout". */
  category: string
  description: string
  imageUrl: string | null
  /** What we pay the supplier per unit (cost of goods). */
  wholesalePrice: number
  /** Recommended retail price — our default sell price. */
  rrp: number
  /** ISO-4217 currency, e.g. "GBP". */
  currency: string
  /** Units available at the supplier right now. */
  stock: number
  inStock: boolean
  barcode: string | null
  /** Variant flavours, when the product has them (empty for single-variant items). */
  flavours: string[]
  /** Servings per unit, when the supplier reports it (`portion_count`). */
  servings: number | null
  /**
   * Shipped weight of one unit in grams.
   *
   * PowerBody price dropship delivery by weight band and their `createOrder`
   * call takes a `weight` parameter, so this is load-bearing for both margin and
   * fulfilment — not a nice-to-have. Null when the feed doesn't carry it.
   */
  weightGrams: number | null
  /** VAT rate as a fraction (their `vat_rate`, a percentage, ÷ 100). Null = standard. */
  vatRate: number | null
  updatedAt: string
}

/** A live stock + price snapshot for one SKU (the daily-sync / recheck shape). */
export interface SupplierStockLevel {
  sku: string
  stock: number
  inStock: boolean
  wholesalePrice: number
  rrp: number
  updatedAt: string
}

// ─── Orders ────────────────────────────────────────────────────────────────────

export interface SupplierAddress {
  name: string
  line1: string
  line2?: string | null
  city: string
  postcode: string
  country: string
  phone?: string | null
}

export interface SupplierOrderLine {
  sku: string
  quantity: number
}

export interface SupplierOrderInput {
  /** Our order reference, echoed back so we can reconcile. */
  reference: string
  shippingAddress: SupplierAddress
  lines: SupplierOrderLine[]
}

export type SupplierOrderStatus =
  | 'received'
  | 'processing'
  | 'shipped'
  | 'delivered'
  | 'cancelled'

export interface SupplierOrderResult {
  supplierOrderId: string
  status: SupplierOrderStatus
}

export interface SupplierOrder extends SupplierOrderResult {
  reference: string
  lines: SupplierOrderLine[]
  trackingNumber: string | null
  updatedAt: string
}

// ─── The provider ───────────────────────────────────────────────────────────────

export interface SupplierProvider {
  readonly name: 'mock' | 'powerbody'
  /** The full supplier catalogue (for the "scan & add" page). */
  listProducts(): Promise<SupplierProduct[]>
  getProduct(sku: string): Promise<SupplierProduct | null>
  /**
   * Fully-detailed products for specific SKUs, fetched on demand.
   *
   * Distinct from `listProducts()` because the live supplier can only afford to
   * detail part of its catalogue per request (see `powerbody/live.ts`), which
   * would otherwise make "import this exact product" depend on having already
   * paged through everything. Given a handful of SKUs it fetches exactly those,
   * so a targeted import always gets a complete product. Unknown SKUs are
   * omitted rather than erroring — the caller reports which were not found.
   */
  getProductsBySku(skus: string[]): Promise<SupplierProduct[]>
  /** Live stock + price. Pass SKUs to narrow it; omit for everything. */
  getStockLevels(skus?: string[]): Promise<SupplierStockLevel[]>
  /** Place a dropship order (Phase 3 wires this to the orders domain). */
  placeOrder(order: SupplierOrderInput): Promise<SupplierOrderResult>
  getOrder(supplierOrderId: string): Promise<SupplierOrder | null>
  listOrders(): Promise<SupplierOrder[]>
}
