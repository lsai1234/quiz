/**
 * Keeping imported products up to date with the supplier.
 *
 * Products added from the PowerBody feed are stored as a snapshot (see
 * `portal/store.ts` → `imported`), which is right for the descriptive fields a
 * founder has curated but wrong for the ones that move on their own: stock,
 * wholesale cost and the supplier's RRP. Without a refresh, the shop keeps
 * selling from whatever the feed said on the day the product was added.
 *
 * This is deliberately narrow. It updates ONLY the commercial fields, and never
 * touches title, description, images, stack slots, goals or any of the CHRGD
 * attributes — those are founder- and AI-curated, and a feed refresh silently
 * overwriting them would undo real work.
 *
 * Retail price is not touched either. `basePrice` is our own decision (cost ×2,
 * rounded to .99 — see `pricing/list-price.ts`) and is subject to the change
 * review flow in `lib/changes`, which exists precisely so a supplier price rise
 * reaches customers through a decision rather than automatically. This job moves
 * `cost`, so the hub's margin figures are honest; what to charge stays a choice.
 *
 * Pure core (`applyStockLevels`) + a thin I/O wrapper, so the merge rules are
 * testable without a database or a supplier.
 */
import type { CatalogueProduct } from '@/lib/catalogue/types'
import type { SupplierStockLevel } from './types'

export interface ProductSyncChange {
  productId: string
  sku: string
  /** Set when availability flipped — the change that matters most. */
  wasInStock?: boolean
  nowInStock?: boolean
  /** Set when our cost moved. */
  costWas?: number
  costNow?: number
}

export interface ProductSyncResult {
  /** Imported products examined. */
  scanned: number
  /** Products whose stored data actually changed. */
  updated: number
  /** Imported products with no matching SKU in the feed — usually delisted. */
  missing: string[]
  changes: ProductSyncChange[]
  products: CatalogueProduct[]
}

const round = (n: number) => Math.round(n * 100) / 100

/**
 * Merge live stock levels into imported products.
 *
 * A product resolves to the supplier through its variants' SKUs (that is how
 * `supplierProductToCatalogue` stamps them), so each variant is matched on its
 * own SKU and a product is in stock when any variant is.
 */
export function applyStockLevels(
  products: CatalogueProduct[],
  levels: SupplierStockLevel[],
): ProductSyncResult {
  const bySku = new Map(levels.map((l) => [l.sku, l]))
  const changes: ProductSyncChange[] = []
  const missing: string[] = []
  let updated = 0

  const next = products.map((product) => {
    const skus = product.variants.map((v) => v.sku).filter((s): s is string => Boolean(s))
    const matched = skus.map((sku) => bySku.get(sku)).filter((l): l is SupplierStockLevel => Boolean(l))

    if (matched.length === 0) {
      // No SKU at all is a mapping problem, not a delisting — only report a
      // product that HAS supplier SKUs and none of them came back in the feed.
      if (skus.length > 0) missing.push(product.id)
      return product
    }

    const variants = product.variants.map((variant) => {
      const level = variant.sku ? bySku.get(variant.sku) : undefined
      if (!level) return variant
      if (variant.available === level.inStock && variant.inventory === level.stock) return variant
      return { ...variant, available: level.inStock, inventory: level.stock }
    })

    // Cost comes from the cheapest matching line: with one SKU (the normal case)
    // that is simply its price, and it is the honest floor when a product maps
    // to several.
    const cost = round(Math.min(...matched.map((l) => l.wholesalePrice)))
    const supplierRrp = round(Math.max(...matched.map((l) => l.rrp)))

    const wasInStock = product.variants.some((v) => v.available)
    const nowInStock = variants.some((v) => v.available)
    const costChanged = cost > 0 && product.cost !== cost
    const variantsChanged = variants.some((v, i) => v !== product.variants[i])
    const rrpChanged = supplierRrp > 0 && product.supplierRrp !== supplierRrp

    if (!costChanged && !variantsChanged && !rrpChanged) return product

    updated += 1
    changes.push({
      productId: product.id,
      sku: skus[0],
      ...(wasInStock !== nowInStock ? { wasInStock, nowInStock } : {}),
      ...(costChanged ? { costWas: product.cost, costNow: cost } : {}),
    })

    return {
      ...product,
      variants,
      // `defaultVariantId` points at a variant a customer can actually buy;
      // leaving it on one that just went out of stock is how a product page
      // opens preselected on something unbuyable.
      defaultVariantId:
        variants.find((v) => v.id === product.defaultVariantId && v.available)?.id ??
        variants.find((v) => v.available)?.id ??
        product.defaultVariantId,
      ...(costChanged ? { cost } : {}),
      ...(rrpChanged ? { supplierRrp } : {}),
    }
  })

  return { scanned: products.length, updated, missing, changes, products: next }
}

/**
 * Refresh every imported product against the supplier's live stock and prices.
 *
 * Safe to run often and safe to run twice — it writes only when something moved.
 * Called by the daily cron and by the hub's "Sync now" button.
 */
export async function syncImportedProducts(): Promise<Omit<ProductSyncResult, 'products'>> {
  const { getSupplier } = await import('./index')
  const { getImportedProducts, addImportedProducts } = await import('@/lib/portal/store')

  const imported = await getImportedProducts()
  if (imported.length === 0) {
    return { scanned: 0, updated: 0, missing: [], changes: [] }
  }

  const supplier = await getSupplier()
  const skus = imported.flatMap((p) => p.variants.map((v) => v.sku).filter((s): s is string => Boolean(s)))
  // The cheap call: stock and price only, no per-product detail fetch.
  const levels = await supplier.getStockLevels(skus)

  const { products, ...summary } = applyStockLevels(imported, levels)
  if (summary.updated > 0) await addImportedProducts(products)
  return summary
}
