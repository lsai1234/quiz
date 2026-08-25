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
  /**
   * PowerBody's own numeric product id — the key `getProductInfo` takes.
   *
   * The SKU is what a person has; the product id is what the detail call wants,
   * and the only way to get from one to the other is to page the list feed. So
   * once a lookup has paid for that walk, the id it found is worth carrying:
   * adding the product afterwards can then go straight to the detail call
   * instead of paging the feed a second time for a mapping we already have.
   *
   * Null when the record came from somewhere with no id in it (the mock, or a
   * list row PowerBody sent without one).
   */
  productId: string | null
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
  /**
   * Whether the descriptive half of this product has actually been fetched.
   *
   * PowerBody split their feed in two: the cheap paged list carries SKU, price
   * and stock, and `getProductInfo` — one call per product — is the only source
   * of name, brand, category, image and RRP. A lookup fetches both, so this is
   * normally true; false means the detail call could not be answered for this
   * one, its descriptive fields are placeholders and its RRP is a fallback, so
   * nothing downstream should present them as the supplier's own figures.
   * Always true on the mock, whose fixtures are whole.
   */
  detailed: boolean
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
  /**
   * The recipient's email.
   *
   * PowerBody's guide is explicit that an order needs a valid email OR phone
   * number, because couriers send verification codes to the recipient. We hold
   * both where we have them: Stripe collects a phone at checkout, but a member
   * who subscribed before phone collection was switched on has only an email,
   * and an order with neither is one the courier may not be able to deliver.
   */
  email?: string | null
}

export interface SupplierOrderLine {
  sku: string
  quantity: number
  /**
   * What the customer knows this as, and what they paid for one of them.
   *
   * Both are printed by PowerBody on the picking list and invoice that go IN
   * THE PARCEL, showing us as the seller — their guide marks the price
   * "required to print your invoice". Sending neither is what produces a
   * customer-facing document listing blank names at £0.00, so these are part of
   * placing an order correctly rather than decoration.
   */
  name?: string
  unitPrice?: number
  /** VAT rate as a PERCENTAGE (their `tax` field is a percentage, not a fraction). */
  taxPercent?: number
}

export interface SupplierOrderInput {
  /** Our order reference, echoed back so we can reconcile. */
  reference: string
  shippingAddress: SupplierAddress
  lines: SupplierOrderLine[]
  /** What we charged the customer for delivery — also printed on their invoice. */
  shippingPrice?: number | null
  /**
   * Total shipped weight in kilograms, or null when we don't know it.
   *
   * Null is the normal case and not a defect: PowerBody's API does not publish a
   * weight on either `getProductList` or `getProductInfo`, so unless someone has
   * typed one in at import review we genuinely have no figure. Null is sent as
   * an absent weight rather than a zero-that-looks-like-a-measurement, and they
   * weigh the parcel their end. See `orderWeightKg`.
   */
  weightKg?: number | null
  /** Free-text note on the order, visible to PowerBody. */
  comment?: string | null
}

/** A delivery service the supplier will accept on `createOrder`. */
export interface SupplierShippingMethod {
  /** Their `transport_code` — what `createOrder` takes. */
  code: string
  /** Their label for it, when they send one. */
  name: string
  /** What they charge for it, when the reply carries a price. */
  price: number | null
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
  getProduct(sku: string): Promise<SupplierProduct | null>
  /**
   * Fully-detailed products for specific SKUs.
   *
   * The only way products enter our catalogue. There is deliberately no "list
   * the whole supplier catalogue" call: PowerBody's cheap feed carries no names,
   * and the one that does is a throttled request per product, so pulling a
   * browsable catalogue through means either a list of bare supplier codes or
   * thousands of requests. Importing by SKU costs exactly the products asked
   * for, and every one of them arrives complete. Unknown SKUs are omitted rather
   * than erroring — the caller reports which were not found.
   */
  getProductsBySku(skus: string[]): Promise<SupplierProduct[]>
  /**
   * Fully-detailed products for specific PowerBody PRODUCT IDs.
   *
   * The same destination as `getProductsBySku`, reached without the search.
   * Resolving a SKU means paging the cheap list feed to find the row that
   * carries its `product_id`, and that walk is the expensive, fragile half: a
   * SKU that IS in the feed stops it early, but one that ISN'T can never
   * satisfy the stop condition, so it reads the whole catalogue and usually
   * runs out of the build budget — reporting a timeout for what is really "no
   * such SKU".
   *
   * A product id skips all of it and calls `getProductInfo` directly, which is
   * one throttled request with no paging and no deadline exposure. Ids are
   * visible on PowerBody's own site and travel with a looked-up row, so this is
   * the reliable path for a known product and the escape hatch when the feed is
   * slow or a SKU cannot be found in it.
   *
   * An id that resolves to nothing is omitted so the caller can report which
   * did not answer — but only while others succeeded. When NOTHING resolved,
   * the supplier's own reason is thrown instead: with no feed to cross-check
   * against, "no such product" and "getProductInfo is not enabled on this
   * account" arrive identically, and answering both with an empty list is how a
   * disabled detail call comes to look like a screen that will not fill in.
   */
  getProductsById(productIds: string[]): Promise<SupplierProduct[]>
  /**
   * A few SKUs that exist, for when you haven't got a code to hand.
   *
   * Codes only — no names, no detail, capped. Not a catalogue and not meant to
   * become one: it is there so "import by SKU" is usable against a feed you
   * cannot otherwise see, such as a sandbox account whose products exist only
   * in the API.
   */
  sampleSkus(limit: number): Promise<string[]>
  /** Live stock + price. Pass SKUs to narrow it; omit for everything. */
  getStockLevels(skus?: string[]): Promise<SupplierStockLevel[]>
  /**
   * The delivery services this account can ask for, if any.
   *
   * `createOrder` takes a `transport_code` and we send it empty, letting
   * PowerBody choose — which is fine, and is why nothing depended on this. It
   * exists to answer a question their guide does not: whether the account has
   * more than one service to offer at all. Their rate card reads as one service
   * per zone, so until this returns two, "delivery options" can only mean
   * prices we set, not speeds we buy.
   *
   * Optional on the interface because the answer is diagnostic, not something
   * the order path needs.
   */
  shippingMethods?(): Promise<SupplierShippingMethod[]>
  /** Place a dropship order (Phase 3 wires this to the orders domain). */
  placeOrder(order: SupplierOrderInput): Promise<SupplierOrderResult>
  getOrder(supplierOrderId: string): Promise<SupplierOrder | null>
  listOrders(): Promise<SupplierOrder[]>
}
