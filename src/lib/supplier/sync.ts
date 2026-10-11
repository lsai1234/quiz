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
      /*
        Per-variant cost, kept current alongside stock.

        Not a repricing — retail is a decision this job never makes (see the
        header). It is the FACT the margin figures are read off, and siblings
        under one master SKU do not all cost the same: the 454g glycine costs
        nearly twice the 100-cap bottle, so a single product-level cost makes a
        loss-making variant look profitable.
      */
      /* Only where a per-variant cost is already recorded: this job keeps facts
         current, and filling one in for the first time is a backfill — that is
         the repair pass's job (`supplier/variant-pricing`), and doing it here
         would report every product in the catalogue as "changed" on the first
         run after a deploy. */
      const cost =
        variant.cost != null && level.wholesalePrice > 0 ? round(level.wholesalePrice) : null
      const same =
        variant.available === level.inStock &&
        variant.inventory === level.stock &&
        (cost === null || variant.cost === cost)
      if (same) return variant
      return {
        ...variant,
        available: level.inStock,
        inventory: level.stock,
        ...(cost !== null ? { cost } : {}),
      }
    })

    // The product's cost and RRP are its MASTER SKU's — the one rule every
    // writer uses (a pull, an absorbed price change), so this job and a pull do
    // not flip the number back and forth. A master the feed did not return
    // falls back to the cheapest line, as before.
    const storedMaster = product.variants.find((v) => v.id === product.defaultVariantId) ?? product.variants[0]
    const masterLevel = storedMaster?.sku ? bySku.get(storedMaster.sku) : undefined
    const cost = round(masterLevel && masterLevel.wholesalePrice > 0 ? masterLevel.wholesalePrice : Math.min(...matched.map((l) => l.wholesalePrice)))
    const supplierRrp = round(masterLevel && masterLevel.rrp > 0 ? masterLevel.rrp : Math.max(...matched.map((l) => l.rrp)))

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
      /*
        `defaultVariantId` is left exactly as it is — it is the product's MASTER,
        which somebody chose in the Hub.

        This used to move it onto a buyable variant whenever the chosen one went
        out of stock, so that a product page did not open preselected on
        something nobody can add. That part is still true and is now done where
        it belongs: `masterVariant` falls back at READ time, so the page opens on
        something buyable and the stored choice is still there when the flavour
        comes back. Writing the fallback down instead spends a decision on a
        stock level, and nothing restores it.
      */
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
 * Stock and cost for SKUs their product list did not return, asked by id.
 *
 * Their list stops at about 3,000 of 8,000+ products, so every product past
 * that point used to come back "missing" from the nightly check — reported as
 * if PowerBody had delisted it — and its stock was never refreshed. A SKU whose
 * id we hold (saved on it, or in the stored index) is one detail call away, and
 * the reply carries the SKU, so it is checked rather than trusted. Bounded by a
 * clock so a slow supplier cannot hold the nightly job.
 */
async function levelsById(
  supplier: import('./types').SupplierProvider,
  products: CatalogueProduct[],
  seen: Set<string>,
  budgetMs = 60_000,
): Promise<SupplierStockLevel[]> {
  const { indexedProductIds } = await import('@/lib/portal/supplier-index')
  const wanted = new Map<string, string>()
  for (const p of products) {
    for (const v of p.variants) {
      if (!v.sku || seen.has(v.sku)) continue
      const id = v.supplierProductId ?? (p.variants.length === 1 ? p.supplierProductId : null)
      if (id) wanted.set(v.sku, String(id))
    }
  }
  const unknown = products.flatMap((p) => p.variants.map((v) => v.sku)).filter((s): s is string => Boolean(s && !seen.has(s) && !wanted.has(s)))
  if (unknown.length > 0) {
    for (const [sku, hit] of await indexedProductIds(unknown).catch(() => new Map())) if (hit.productId) wanted.set(sku, hit.productId)
  }
  const out: SupplierStockLevel[] = []
  const startedAt = Date.now()
  const ids = [...new Set(wanted.values())]
  for (let i = 0; i < ids.length && Date.now() - startedAt < budgetMs; i += 10) {
    try {
      for (const p of await supplier.getProductsById(ids.slice(i, i + 10))) {
        if (!p.sku || wanted.get(p.sku) !== String(p.productId ?? wanted.get(p.sku))) continue
        out.push({
          sku: p.sku,
          productId: p.productId,
          stock: p.stock,
          inStock: p.inStock,
          wholesalePrice: p.wholesalePrice,
          rrp: p.rrp,
          updatedAt: new Date().toISOString(),
        })
      }
    } catch {
      // A refused batch leaves those SKUs as they were — and reported as not
      // reached, which is the truth.
    }
  }
  return out
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
  const { getImportedProducts, updateImportedProducts } = await import('@/lib/portal/store')
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
  const listed = await supplier.getStockLevels(skus)
  // …and, for whatever their list could not reach, ask by id.
  const levels = [...listed, ...(await levelsById(supplier, imported, new Set(listed.map((l) => l.sku))))]

  const options = { marginFloorPct: getPricingConfig().marginFloorPct }
  const { products: _preview, ...preview } = applyStockLevels(imported, levels, options)
  void _preview
  // Applied again inside the write, to the products as they are THEN: the call
  // above can take a minute, and writing back what was read before it would
  // undo every edit a founder made in that minute.
  const summary =
    preview.updated > 0
      ? await updateImportedProducts((current) => {
          const { products, ...applied } = applyStockLevels(current, levels, options)
          const before = new Map(current.map((p) => [p.id, JSON.stringify(p)]))
          return { products: products.filter((p) => before.get(p.id) !== JSON.stringify(p)), result: applied }
        })
      : preview

  const report: SupplierSyncReport = { at, source, ...summary }
  await saveReport(report)
  return report
}

/**
 * Write what a live stock check saw back onto the catalogue.
 *
 * The nightly sync is the only other thing that moves `available`, and it reads
 * a feed that stops short of the whole catalogue — so a product past that point
 * could sell out and stay on sale indefinitely. Whenever a checkout or a send
 * asks PowerBody directly, the answer is kept, and the shop stops offering what
 * just sold out rather than waiting for a sync that may never reach it.
 *
 * Narrow on purpose: availability and the stock count, nothing else. Cost and
 * RRP stay the nightly sync's business. Only products that actually moved are
 * written, so the common case — everything as expected — writes nothing.
 * Never throws: forgetting a stock level is not a reason to fail a checkout.
 */
export async function rememberLiveStock(
  live: { sku: string; stock: number; inStock: boolean }[],
): Promise<number> {
  if (live.length === 0) return 0
  try {
    const { getImportedProducts, updateImportedProducts } = await import('@/lib/portal/store')
    const bySku = new Map(live.map((l) => [l.sku, l]))
    const movedIn = (products: CatalogueProduct[]): CatalogueProduct[] => {
      const moved: CatalogueProduct[] = []
      for (const product of products) {
        let touched = false
        const variants = product.variants.map((variant) => {
          const level = variant.sku ? bySku.get(variant.sku) : undefined
          if (!level || (variant.available === level.inStock && variant.inventory === level.stock)) return variant
          touched = true
          return { ...variant, available: level.inStock, inventory: level.stock }
        })
        if (touched) moved.push({ ...product, variants })
      }
      return moved
    }
    // Checked against a cached read first, so the common case — nothing moved —
    // costs no write at all.
    if (movedIn(await getImportedProducts()).length === 0) return 0
    return await updateImportedProducts((current) => {
      const moved = movedIn(current)
      return { products: moved, result: moved.length }
    })
  } catch (err) {
    console.error('[supplier] could not remember live stock:', err)
    return 0
  }
}
