import { getDataSource } from '@/lib/data-source'
import { MOCK_CATALOGUE } from './mock-catalogue'
import { applyProductOverrides } from '@/lib/portal/store'
import type { CatalogueProduct } from './types'

/**
 * The catalogue the app should serve right now: live Shopify or mock per the
 * resolved data source, with any portal product-field overrides merged on top.
 */
export async function getResolvedCatalogue(): Promise<{ products: CatalogueProduct[]; source: 'mock' | 'shopify' }> {
  if (getDataSource() === 'shopify') {
    try {
      const { getProducts } = await import('@/lib/shopify/operations')
      const { mapShopifyToCatalogueProduct } = await import('@/lib/shopify/catalogue')
      const shopifyProducts = await getProducts(50)
      return { products: applyProductOverrides(shopifyProducts.map(mapShopifyToCatalogueProduct)), source: 'shopify' }
    } catch {
      return { products: applyProductOverrides(MOCK_CATALOGUE as CatalogueProduct[]), source: 'mock' }
    }
  }
  return { products: applyProductOverrides(MOCK_CATALOGUE as CatalogueProduct[]), source: 'mock' }
}
