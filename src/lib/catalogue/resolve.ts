import { getDataSource } from '@/lib/data-source'
import { MOCK_CATALOGUE } from './mock-catalogue'
import {
  applyProductOverrides,
  getImportedProducts,
  getRemovedProductIds,
} from '@/lib/portal/store'
import type { CatalogueProduct } from './types'

/**
 * Compose the catalogue founders actually see: base products with field
 * overrides merged on, bulk-imported products appended, and any products the
 * founders removed filtered out. Applied to both the live and mock branches so
 * removals/imports reflect everywhere (quiz, hub, dashboard).
 */
function composeCatalogue(base: CatalogueProduct[]): CatalogueProduct[] {
  const removed = getRemovedProductIds()
  const withImports = [...applyProductOverrides(base), ...getImportedProducts()]
  return removed.size === 0 ? withImports : withImports.filter((p) => !removed.has(p.id))
}

/**
 * The catalogue the app should serve right now: live Shopify or mock per the
 * resolved data source, with founder overrides/imports/removals applied.
 */
export async function getResolvedCatalogue(): Promise<{ products: CatalogueProduct[]; source: 'mock' | 'shopify'; error?: string }> {
  if (getDataSource() === 'shopify') {
    try {
      const { getProducts } = await import('@/lib/shopify/operations')
      const { mapShopifyToCatalogueProduct } = await import('@/lib/shopify/catalogue')
      const shopifyProducts = await getProducts(50)
      if (shopifyProducts.length === 0) {
        return { products: composeCatalogue(MOCK_CATALOGUE as CatalogueProduct[]), source: 'mock', error: 'Shopify returned 0 products. Check the store has products and the Storefront token has read access.' }
      }
      return { products: composeCatalogue(shopifyProducts.map(mapShopifyToCatalogueProduct)), source: 'shopify' }
    } catch (err) {
      return { products: composeCatalogue(MOCK_CATALOGUE as CatalogueProduct[]), source: 'mock', error: err instanceof Error ? err.message : String(err) }
    }
  }
  return { products: composeCatalogue(MOCK_CATALOGUE as CatalogueProduct[]), source: 'mock' }
}
