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
  title: string
  sku: string
  /** Set when availability flipped — the change that matters most. */
  wasInStock?: boolean
  nowInStock?: boolean
  /** Set when our cost moved. */
  costWas?: number
  costNow?: number
  /** Cost movement as a fraction (+0.08 = 8% dearer). */
  costDeltaPct?: number
  /**
   * What the cost move did to the margin on our CURRENT retail price.
   *
   * This is the number that matters and the reason a cost rise can't just be
   * absorbed silently: we hold `basePrice` steady (repricing is a decision, not
   * a sync), so every penny the supplier adds comes straight out of margin.
   */
  marginPctWas?: number
  marginPctNow?: number
  /** True when the new margin sits under the configured floor. */
  belowFloor?: boolean
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

/** A run, as stored for the hub to show. `products` is deliberately absent —
 *  this is the summary, not a second copy of the catalogue. */
export interface SupplierSyncReport extends Omit<ProductSyncResult, 'products'> {
  at: string
  /** Which supplier answered — a mock run shouldn't be mistaken for a real one. */
  source: string
}

const round = (n: number) => Math.round(n * 100) / 100
const round4 = (n: number) => Math.round(n * 10000) / 10000

/** Margin on our own retail price, as a fraction. Null when we don't sell it at
 *  a price yet (nothing to measure against). */
function marginPct(retail: number | undefined, cost: number): number | null {
  if (!retail || retail <= 0) return null
  return round4((retail - cost) / retail)
}

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
  opts: { marginFloorPct?: number } = {},
): ProductSyncResult {
  const marginFloor = opts.marginFloorPct ?? 0.15
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

    // Margin is measured against OUR retail price, which this job never moves —
    // so a cost rise shows up here as exactly the margin it just cost us.
    const wasMargin = costChanged ? marginPct(product.basePrice, product.cost ?? 0) : null
    const nowMargin = costChanged ? marginPct(product.basePrice, cost) : null

    changes.push({
      productId: product.id,
      title: product.title,
      sku: skus[0],
      ...(wasInStock !== nowInStock ? { wasInStock, nowInStock } : {}),
      ...(costChanged
        ? {
            costWas: product.cost,
            costNow: cost,
            ...(product.cost && product.cost > 0
              ? { costDeltaPct: round4((cost - product.cost) / product.cost) }
              : {}),
            ...(wasMargin !== null ? { marginPctWas: wasMargin } : {}),
            ...(nowMargin !== null ? { marginPctNow: nowMargin, belowFloor: nowMargin < marginFloor } : {}),
          }
        : {}),
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

const REPORT_KEY = 'powerbody:last-sync'

/** The most recent run, for the hub. Null before the first one. */
export async function getLastSyncReport(): Promise<SupplierSyncReport | null> {
  try {
    const { kvGet } = await import('@/lib/db/kv')
    return (await kvGet<SupplierSyncReport>(REPORT_KEY)) ?? null
  } catch {
    return null
  }
}

async function saveReport(report: SupplierSyncReport): Promise<void> {
  try {
    const { kvSet } = await import('@/lib/db/kv')
    await kvSet(REPORT_KEY, report)
  } catch {
    /* unreachable database — the refresh itself still counted */
  }
}

/**
 * Check every imported product against the supplier and refresh what moved.
 *
 * This is the daily "did anything change under us?" pass over the products we
 * actually sell. It is deliberately separate from the change detection in
 * `lib/changes`, which walks SUBSCRIPTIONS: that only raises an event when a
 * moved SKU is in somebody's plan, so a cost rise on a shop product nobody
 * subscribes to would otherwise go unnoticed until someone read a margin report.
 *
 * The result is stored so the hub can show what happened without re-running it.
 * Safe to run often and safe to run twice — it writes only when something moved.
 */
export async function syncImportedProducts(): Promise<SupplierSyncReport> {
  const { getSupplier, getSupplierSource } = await import('./index')
  const { getImportedProducts, addImportedProducts } = await import('@/lib/portal/store')
  const { getPricingConfig } = await import('@/lib/stack-blueprint/pricing')

  const at = new Date().toISOString()
  const source = getSupplierSource()
  const imported = await getImportedProducts()
  if (imported.length === 0) {
    const empty: SupplierSyncReport = { at, source, scanned: 0, updated: 0, missing: [], changes: [] }
    await saveReport(empty)
    return empty
  }

  const supplier = await getSupplier()
  const skus = imported.flatMap((p) => p.variants.map((v) => v.sku).filter((s): s is string => Boolean(s)))
  // The cheap call: stock and price only, no per-product detail fetch.
  const levels = await supplier.getStockLevels(skus)

  const { products, ...summary } = applyStockLevels(imported, levels, {
    marginFloorPct: getPricingConfig().marginFloorPct,
  })
  if (summary.updated > 0) await addImportedProducts(products)

  const report: SupplierSyncReport = { at, source, ...summary }
  await saveReport(report)
  return report
}
