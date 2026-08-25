/**
 * One supplier product, as the Founders Hub sees it — what
 * `POST /api/portal/supplier/lookup` answers a SKU with.
 *
 * THE MONEY COLUMN DOES NOT DEPEND ON THE SUPPLIER'S RRP
 * ─────────────────────────────────────────────────────
 * We price from cost (× 2, rounded to .99 — see `pricing/list-price.ts`, which
 * is explicit that RRP plays no part), so what a founder is deciding on is:
 *
 *     what we pay  →  what we would charge  →  what we would keep
 *
 * — a better question answered than "how does this compare to PowerBody's
 * suggestion", and one their RRP is not needed for.
 *
 * Margin is the real one — `unitEconomics`, net of VAT, dropship delivery, card
 * fees and returns — not price minus cost, which flatters every line. When the
 * shipping weight is missing the delivery band is assumed, so the figure is
 * marked `marginEstimated` and the UI says so rather than pretending.
 *
 * The supplier's RRP is carried as the was-price it is, and is null on the rare
 * row whose detail could not be fetched.
 */
import type { SupplierProduct } from './types'
import { supplierProductToCatalogue } from './mapping'
import { unitEconomics } from '@/lib/pricing/unit-economics'

export interface SupplierRow {
  sku: string
  /**
   * PowerBody's product id, when the lookup resolved one.
   *
   * Sent back when the row is added so the add can go straight to the detail
   * call instead of paging the feed a second time to rediscover a mapping this
   * lookup already paid for. Null on a supplier that has no ids.
   */
  productId: string | null
  name: string
  brand: string
  category: string
  imageUrl: string | null
  /** What we pay PowerBody, ex VAT. */
  wholesalePrice: number
  /** What we would put it on the shelf at (cost × 2 → .99). Always known. */
  sellPrice: number
  /** What we would keep per unit at that price, after VAT, delivery, card fees
   *  and returns. Always known. */
  contribution: number
  /** `contribution` as a percentage of net revenue (0–100). Always known. */
  marginPct: number
  /** True when the margin rests on an assumed shipping weight, because the
   *  supplier did not send one. */
  marginEstimated: boolean
  /** PowerBody's own recommended retail price. Informational — nothing prices
   *  off it — and null when their detail call could not be answered. */
  rrp: number | null
  currency: string
  stock: number
  inStock: boolean
  /** False when the supplier's detail call could not be answered for this one,
   *  so its name and RRP are placeholders. */
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
    productId: sp.productId,
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
