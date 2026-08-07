/**
 * One browsable supplier product, as the Founders Hub sees it.
 *
 * Shared by the browse feed (`GET /api/portal/supplier`) and the SKU lookup
 * (`POST /api/portal/supplier/lookup`) so both answer with the same shape and
 * the page can drop a looked-up product straight into the list it is showing.
 *
 * THE MONEY COLUMN DOES NOT DEPEND ON THE SUPPLIER'S RRP
 * ─────────────────────────────────────────────────────
 * PowerBody split their feed: the cheap paged list carries SKU, cost, stock and
 * VAT for everything, while name, brand, image and RRP come from a per-product
 * call we only make for products someone opens or adds. So a browse row has no
 * RRP — and it does not need one. We price from cost (× 2, rounded to .99 — see
 * `pricing/list-price.ts`, which is explicit that RRP plays no part), so what a
 * founder is deciding on is:
 *
 *     what we pay  →  what we would charge  →  what we would keep
 *
 * All three come from the list feed alone. That is a better question answered
 * than "how does this compare to PowerBody's suggestion", and it is answered for
 * every row rather than for the handful that have been detailed.
 *
 * Margin is the real one — `unitEconomics`, net of VAT, dropship delivery, card
 * fees and returns — not price minus cost, which flatters every line. On a row
 * whose weight has not been fetched the delivery band is assumed, so the figure
 * is marked `marginEstimated` and the UI says so rather than pretending.
 *
 * The supplier's RRP is still carried when it is known, as the was-price it is,
 * and is null until then.
 */
import type { SupplierProduct } from './types'
import { supplierProductToCatalogue } from './mapping'
import { unitEconomics } from '@/lib/pricing/unit-economics'

export interface SupplierRow {
  sku: string
  name: string
  brand: string
  category: string
  imageUrl: string | null
  /** What we pay PowerBody, ex VAT. Always known — it is in the list feed. */
  wholesalePrice: number
  /** What we would put it on the shelf at (cost × 2 → .99). Always known. */
  sellPrice: number
  /** What we would keep per unit at that price, after VAT, delivery, card fees
   *  and returns. Always known. */
  contribution: number
  /** `contribution` as a percentage of net revenue (0–100). Always known. */
  marginPct: number
  /** True when the margin rests on an assumed shipping weight, which is the
   *  case until the product's detail has been fetched. */
  marginEstimated: boolean
  /** PowerBody's own recommended retail price. Informational — nothing prices
   *  off it — and null until the product's detail has been fetched. */
  rrp: number | null
  currency: string
  stock: number
  inStock: boolean
  /** False when only the list-feed half of this product has been fetched. */
  detailed: boolean
  mappedId: string
  stackSlots: string[]
  hasStimulants: boolean
  alreadyAdded: boolean
}

/** Map a supplier product to a row, flagging whether it is already in our
 *  curated catalogue. */
export function toSupplierRow(sp: SupplierProduct, addedIds: Set<string>): SupplierRow {
  const mapped = supplierProductToCatalogue(sp)
  // `basePrice` is our list-price rule applied to today's cost — the price this
  // product would actually go on sale at, so the margin below is the margin we
  // would actually make.
  const sellPrice = mapped.basePrice
  const economics = unitEconomics({
    shelfPrice: sellPrice,
    supplierCost: sp.wholesalePrice,
    grams: sp.weightGrams,
    vatRate: sp.vatRate,
  })

  return {
    sku: sp.sku,
    name: sp.name,
    brand: sp.brand,
    category: sp.category,
    imageUrl: sp.imageUrl,
    wholesalePrice: sp.wholesalePrice,
    sellPrice,
    contribution: economics.contribution,
    marginPct: Math.round(economics.marginPct * 100),
    marginEstimated: !economics.assumptions.weightKnown,
    rrp: sp.detailed ? sp.rrp : null,
    currency: sp.currency,
    stock: sp.stock,
    inStock: sp.inStock,
    detailed: sp.detailed,
    mappedId: mapped.id,
    stackSlots: mapped.stackSlots,
    hasStimulants: mapped.hasStimulants,
    alreadyAdded: addedIds.has(mapped.id),
  }
}
