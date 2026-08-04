import { getDataSource } from '@/lib/data-source'
import { MOCK_CATALOGUE } from './mock-catalogue'
import {
  applyProductOverrides,
  getPersistedProducts,
  syncPortalRuntime,
} from '@/lib/portal/store'
import { applyTopRanks } from '@/lib/portal/top-products'
import type { CatalogueProduct } from './types'

/**
 * Compose the catalogue founders actually see: base products with field
 * overrides merged on, products added from the supplier feed appended, and any
 * products the founders removed filtered out. Applied to both the live and mock
 * branches so removals/imports reflect everywhere (quiz, hub, dashboard).
 */
async function composeCatalogue(base: CatalogueProduct[]): Promise<CatalogueProduct[]> {
  const { overrides, removedIds, imported, topProductIds } = await getPersistedProducts()
  const removed = new Set(removedIds)
  const withImports = [...applyProductOverrides(base, overrides), ...imported]
  const visible = removed.size === 0 ? withImports : withImports.filter((p) => !removed.has(p.id))
  // Last, so the Top 25 is stamped only onto products that actually survived —
  // a roster entry for a removed product simply doesn't apply.
  return applyTopRanks(visible, topProductIds ?? [])
}

/**
 * The catalogue the app should serve right now: live Shopify or mock per the
 * resolved data source, with founder overrides/imports/removals applied.
 */
export async function getResolvedCatalogue(): Promise<{ products: CatalogueProduct[]; source: 'mock' | 'shopify'; error?: string }> {
  // Hydrate the data-source override + pricing overrides from the database
  // first — on serverless this instance may not have seen a portal edit yet.
  await syncPortalRuntime()
  if (getDataSource() === 'shopify') {
    try {
      const { getProducts } = await import('@/lib/shopify/operations')
      const { mapShopifyToCatalogueProduct } = await import('@/lib/shopify/catalogue')
      const shopifyProducts = await getProducts(50)
      if (shopifyProducts.length === 0) {
        return { products: await composeCatalogue(MOCK_CATALOGUE as CatalogueProduct[]), source: 'mock', error: 'Shopify returned 0 products. Check the store has products and the Storefront token has read access.' }
      }
      return { products: await composeCatalogue(shopifyProducts.map(mapShopifyToCatalogueProduct)), source: 'shopify' }
    } catch (err) {
      return { products: await composeCatalogue(MOCK_CATALOGUE as CatalogueProduct[]), source: 'mock', error: err instanceof Error ? err.message : String(err) }
    }
  }
  return { products: await composeCatalogue(MOCK_CATALOGUE as CatalogueProduct[]), source: 'mock' }
}
