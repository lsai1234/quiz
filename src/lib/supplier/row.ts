/**
 * One browsable supplier product, as the Founders Hub sees it.
 *
 * Shared by the browse feed (`GET /api/portal/supplier`) and the SKU lookup
 * (`POST /api/portal/supplier/lookup`) so both answer with the same shape and
 * the page can drop a looked-up product straight into the list it is showing.
 *
 * The important bit is `detailed`. PowerBody split their feed: the cheap paged
 * list carries SKU, cost, stock and VAT for everything, while name, brand,
 * category, image and RRP come from a per-product call we only make for products
 * someone opens or adds. So a browse row is real on the money and blank on the
 * description, and the fields that depend on RRP are **null rather than guessed**
 * — the fallback for a missing RRP is wholesale-including-VAT, which would
 * render as a ~17% margin that looks like a fact and isn't.
 */
import type { SupplierProduct } from './types'
import { supplierProductToCatalogue } from './mapping'

export interface SupplierRow {
  sku: string
  name: string
  brand: string
  category: string
  imageUrl: string | null
  wholesalePrice: number
  /** Supplier RRP — null until the product's detail has been fetched. */
  rrp: number | null
  currency: string
  stock: number
  inStock: boolean
  /** Cash margin at the supplier's RRP. Null when the RRP is unknown. */
  margin: number | null
  /** Margin as a percentage of RRP. Null when the RRP is unknown. */
  marginPct: number | null
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
  const rrp = sp.detailed ? sp.rrp : null
  const margin = rrp === null ? null : Math.round((rrp - sp.wholesalePrice) * 100) / 100
  return {
    sku: sp.sku,
    name: sp.name,
    brand: sp.brand,
    category: sp.category,
    imageUrl: sp.imageUrl,
    wholesalePrice: sp.wholesalePrice,
    rrp,
    currency: sp.currency,
    stock: sp.stock,
    inStock: sp.inStock,
    margin,
    marginPct: rrp !== null && rrp > 0 && margin !== null ? Math.round((margin / rrp) * 100) : null,
    detailed: sp.detailed,
    mappedId: mapped.id,
    stackSlots: mapped.stackSlots,
    hasStimulants: mapped.hasStimulants,
    alreadyAdded: addedIds.has(mapped.id),
  }
}
