/**
 * PowerBody's wire shapes, and the mapping onto ours.
 *
 * Kept apart from `live.ts` so the field-by-field translation — the part most
 * likely to be wrong, and the only part worth unit-testing without a network —
 * is pure and testable on its own.
 *
 * Field names come from the Dropshipping API guide (June 2026): `getProductList`
 * / `getProductInfo` for the catalogue, `createOrder` / `getOrders` for
 * fulfilment. Everything arrives as JSON-decoded PHP, which means numbers are
 * usually strings and absent values may be `null`, `''` or missing entirely —
 * hence the defensive coercion below rather than trusting the shapes.
 */
import type {
  SupplierAddress,
  SupplierOrder,
  SupplierOrderInput,
  SupplierOrderStatus,
  SupplierProduct,
  SupplierStockLevel,
} from '../types'

// ─── Wire types ────────────────────────────────────────────────────────────────

/** A row from `dropshipping.getProductList` — the cheap, paged feed. */
export interface PbProductListItem {
  product_id?: string | number
  sku?: string
  ean?: string | null
  /** Our wholesale (dropship) price, ex VAT. */
  price?: string | number
  price_tax?: string | number
  qty?: string | number
  vat_rate?: string | number
  is_new?: boolean | string | number
}

/** `dropshipping.getProductInfo` — everything above plus the descriptive fields. */
export interface PbProductInfo extends PbProductListItem {
  name?: string
  trade_price?: string | number
  url?: string
  image?: string
  status?: string
  detail_price?: string | number
  save?: string | number
  save_percent?: string | number
  category?: string
  manufacturer?: string
  portion_count?: string | number
  price_per_serving?: string | number
  description_en?: string
  description_pl?: string
  weight?: string | number
}

/** A row from `dropshipping.getOrders`. */
export interface PbOrder {
  order_id?: string | number
  powerbody_order_id?: string | number
  status?: string
  tracking_number?: string | null
  products?: { sku?: string; qty?: string | number }[]
  api_response?: string
}

/** What `createOrder` / `updateOrder` answer with. */
export interface PbOrderResponse extends PbOrder {
  api_response?: string
  id?: string | number
}

// ─── Coercion ──────────────────────────────────────────────────────────────────

export function num(value: unknown, fallback = 0): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : fallback
  if (typeof value === 'string') {
    const parsed = parseFloat(value.replace(/[^0-9.-]/g, ''))
    return Number.isFinite(parsed) ? parsed : fallback
  }
  return fallback
}

/** A number, or null when the supplier genuinely didn't send one. Distinct from
 *  `num` because 0 and "not reported" mean very different things for weight and
 *  VAT — see `SupplierProduct.weightGrams`. */
export function numOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const parsed = num(value, NaN)
  return Number.isFinite(parsed) ? parsed : null
}

function str(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : value == null ? fallback : String(value)
}

const round = (n: number) => Math.round(n * 100) / 100

/**
 * PowerBody express VAT as a percentage (`vat_rate: 20`); we hold a fraction.
 * Values already below 1 are passed through — a feed that switches to fractions
 * shouldn't silently divide our prices by 100.
 */
export function vatFraction(value: unknown): number | null {
  const raw = numOrNull(value)
  if (raw === null) return null
  return raw > 1 ? round(raw / 100) : raw
}

/**
 * Their `status` string → whether we can sell it.
 *
 * "out of stock" is temporary and stays in the catalogue; "disabled" and
 * "archival" mean discontinued, and the guide says a disabled product stays
 * visible for 30 days before disappearing entirely. Both must read as
 * unavailable, or the daily change detection would keep offering a product
 * PowerBody has stopped carrying.
 */
export function isSellableStatus(status: unknown): boolean {
  const s = str(status).trim().toLowerCase()
  if (s === '') return true // absent status = the product list feed, which only carries live items
  return s === 'active' || s === 'enabled'
}

export function isDiscontinuedStatus(status: unknown): boolean {
  const s = str(status).trim().toLowerCase()
  return s === 'disabled' || s === 'archival'
}

// ─── Products ──────────────────────────────────────────────────────────────────

/** Flavour variants aren't a concept in PowerBody's feed — each flavour is its
 *  own SKU — so a mapped product always has an empty flavour list. */
const NO_FLAVOURS: string[] = []

/**
 * Map a full `getProductInfo` payload (optionally merged with its list row) onto
 * a `SupplierProduct`.
 *
 * `detail_price` is PowerBody's retail price and becomes our RRP; `price` is
 * what we pay them. Note that `trade_price` is the *non-dropshipping* wholesale
 * price — deliberately unused, because paying it isn't an option available to us
 * and treating it as cost would overstate every margin in the hub.
 */
export function toSupplierProduct(info: PbProductInfo, updatedAt = new Date().toISOString()): SupplierProduct {
  const qty = num(info.qty)
  const wholesale = round(num(info.price))
  const rrp = round(num(info.detail_price, num(info.price_tax)))
  const sellable = isSellableStatus(info.status)
  // `name` is the tell: only `getProductInfo` carries one, so its presence is
  // what separates a fully-fetched product from a bare list-feed row. Everything
  // descriptive below falls back when it is absent, and `detailed` is how a
  // caller knows those are placeholders rather than what PowerBody say.
  const detailed = str(info.name).trim() !== ''

  return {
    sku: str(info.sku),
    // Carried so a looked-up product can be re-fetched (or added) without
    // paging the feed again to rediscover the mapping — see `productId` on
    // SupplierProduct.
    productId: str(info.product_id) || null,
    name: str(info.name) || str(info.sku),
    brand: str(info.manufacturer),
    category: str(info.category),
    description: str(info.description_en),
    imageUrl: str(info.image) || null,
    wholesalePrice: wholesale,
    rrp: rrp > 0 ? rrp : wholesale,
    currency: 'GBP',
    stock: qty,
    // Both have to hold: a product can be in stock and still be one PowerBody
    // has disabled, and selling that is how you take an order nobody can fill.
    inStock: qty > 0 && sellable,
    barcode: str(info.ean) || null,
    flavours: NO_FLAVOURS,
    servings: numOrNull(info.portion_count),
    weightGrams: weightToGrams(info.weight),
    vatRate: vatFraction(info.vat_rate),
    detailed,
    updatedAt,
  }
}

/**
 * PowerBody report weight in kilograms; we hold grams.
 *
 * Anything at or above 100 is already grams (a 500 g tub sent as `500`), which
 * keeps a feed that changes units from turning every parcel into half a tonne
 * and repricing delivery off the back of it.
 */
export function weightToGrams(value: unknown): number | null {
  const raw = numOrNull(value)
  if (raw === null || raw <= 0) return null
  return raw >= 100 ? Math.round(raw) : Math.round(raw * 1000)
}

/** The cheap path: stock + price from a `getProductList` row, no detail fetch. */
export function toStockLevel(item: PbProductListItem, updatedAt = new Date().toISOString()): SupplierStockLevel {
  const qty = num(item.qty)
  const wholesale = round(num(item.price))
  return {
    sku: str(item.sku),
    productId: str(item.product_id) || null,
    stock: qty,
    inStock: qty > 0,
    wholesalePrice: wholesale,
    // The list feed has no retail price; `price_tax` (wholesale incl. VAT) is the
    // closest thing it carries. Callers that need a true RRP use getProductInfo.
    rrp: round(num(item.price_tax, wholesale)),
    updatedAt,
  }
}

// ─── Orders ────────────────────────────────────────────────────────────────────

/**
 * PowerBody's order statuses → ours.
 *
 * Their vocabulary is Magento's, and the guide adds two of their own: an order
 * sits at `holded` until it is paid for (the API creates orders unpaid — see
 * "Order Payments" in the guide), and an order removed from their system comes
 * back from `getOrders` as `canceled`.
 */
export function toSupplierOrderStatus(status: unknown): SupplierOrderStatus {
  const s = str(status).trim().toLowerCase().replace(/[\s-]+/g, '_')
  switch (s) {
    case 'complete':
    case 'completed':
    case 'shipped':
      return 'shipped'
    case 'delivered':
      return 'delivered'
    case 'canceled':
    case 'cancelled':
    case 'closed':
      return 'cancelled'
    case 'processing':
    case 'paid':
      return 'processing'
    // `holded`/`pending` is the normal resting state for a freshly created order:
    // received by them, waiting on payment. Anything unrecognised lands here too
    // — "we have it, nothing has happened yet" is the safe reading.
    default:
      return 'received'
  }
}

/** A PowerBody order row → our `SupplierOrder`. */
export function toSupplierOrder(order: PbOrder, updatedAt = new Date().toISOString()): SupplierOrder {
  return {
    supplierOrderId: str(order.powerbody_order_id) || str(order.order_id),
    reference: str(order.order_id),
    status: toSupplierOrderStatus(order.status),
    lines: (order.products ?? []).map((p) => ({ sku: str(p.sku), quantity: num(p.qty) })),
    trackingNumber: str(order.tracking_number) || null,
    updatedAt,
  }
}

/**
 * ISO country codes → the name PowerBody print on the shipping document.
 *
 * Their block carries `country_name` AND `country_code` as separate fields, so
 * sending "GB" for both puts a code where a courier label wants a country. Only
 * the countries a UK dropshipping account can actually reach are listed; an
 * unrecognised code falls back to itself, which is no worse than before.
 */
const COUNTRY_NAMES: Record<string, string> = {
  GB: 'United Kingdom',
  UK: 'United Kingdom',
}

/** Their address block. `name`/`surname` are separate fields, ours is one string. */
function toPbAddress(address: SupplierAddress) {
  const trimmed = address.name.trim()
  const space = trimmed.indexOf(' ')
  const code = address.country.trim().toUpperCase()
  return {
    name: space === -1 ? trimmed : trimmed.slice(0, space),
    // Their form requires a surname; a single-word name repeats rather than
    // sending an empty field their validation would reject.
    surname: space === -1 ? trimmed : trimmed.slice(space + 1).trim(),
    address1: address.line1,
    address2: address.line2 ?? '',
    address3: '',
    postcode: address.postcode,
    city: address.city,
    county: '',
    country_name: COUNTRY_NAMES[code] ?? address.country,
    country_code: code,
    phone: address.phone ?? '',
    // Their guide: a valid email OR phone is needed so couriers can send
    // verification codes to the recipient. This used to be hard-coded empty,
    // which left phone as the only channel and nothing at all for an order
    // without one.
    email: address.email ?? '',
  }
}

export interface CreateOrderContext {
  /** Total shipped weight in kilograms — PowerBody price delivery by weight band. */
  weightKg?: number | null
  /** What we charged the customer for delivery (they print it on our invoice). */
  shippingPrice?: number | null
  /** The delivery service, from `dropshipping.getShippingMethod`. */
  transportCode?: string | null
  comment?: string | null
  /** Per-SKU detail so their invoice shows our prices, not theirs. */
  lineDetail?: Record<string, { name?: string; price?: number; taxPercent?: number }>
  /** Overridable so tests don't depend on today's date. */
  dateAdd?: string
}

/**
 * Our order → the array `dropshipping.createOrder` expects.
 *
 * `id` is our own reference echoed back on every `getOrders` row, which is what
 * makes reconciliation possible at all — PowerBody's own increment id isn't
 * known until after the call returns.
 */
export function toCreateOrderPayload(order: SupplierOrderInput, context: CreateOrderContext = {}) {
  const detail = context.lineDetail ?? {}
  // The order carries its own invoice fields now; `context` stays as the
  // override for the things only a caller can know (a transport code, a fixed
  // date in a test). Order first, context second, empty last.
  const weightKg = order.weightKg ?? context.weightKg ?? null
  return {
    id: order.reference,
    status: 'pending',
    currency_rate: 1,
    transport_code: context.transportCode ?? '',
    // Empty rather than 0 when we don't know it. Their API publishes no weight
    // on either product call, so for most orders we genuinely have none — and a
    // zero is a measurement that reads as "this parcel weighs nothing", which
    // lands it in the wrong delivery band rather than in no band at all.
    weight: weightKg ?? '',
    date_add: context.dateAdd ?? new Date().toISOString().slice(0, 19).replace('T', ' '),
    comment: order.comment ?? context.comment ?? '',
    shipping_price: order.shippingPrice ?? context.shippingPrice ?? 0,
    address: toPbAddress(order.shippingAddress),
    products: order.lines.map((line) => {
      const extra = detail[line.sku] ?? {}
      return {
        product_id: '',
        sku: line.sku,
        name: line.name ?? extra.name ?? '',
        qty: line.quantity,
        price: line.unitPrice ?? extra.price ?? 0,
        currency: 'GBP',
        tax: line.taxPercent ?? extra.taxPercent ?? 0,
      }
    }),
  }
}

/** `api_response` values that mean the call did what we asked. */
const OK_RESPONSES = new Set(['SUCCESS', 'UPDATE_SUCCESS'])

export interface OrderAck {
  ok: boolean
  /** Their raw `api_response`, for the audit trail. */
  response: string
  /** True when the order was already there — safe to treat as success. */
  alreadyExists: boolean
}

/**
 * Read the `api_response` field every order call answers with.
 *
 * `ALREADY_EXISTS` is deliberately not a failure: it means a previous attempt
 * got through and the retry is a duplicate, so treating it as success is what
 * makes re-sending a timed-out order safe instead of double-shipping it.
 */
export function readOrderAck(response: PbOrderResponse | null | undefined): OrderAck {
  const raw = str(response?.api_response).trim().toUpperCase()
  const alreadyExists = raw === 'ALREADY_EXISTS'
  return { ok: OK_RESPONSES.has(raw) || alreadyExists, response: raw || 'UNKNOWN', alreadyExists }
}
