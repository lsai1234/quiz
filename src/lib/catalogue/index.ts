export * from './types'
export * from './filters'
export { MOCK_CATALOGUE } from './mock-catalogue'
export { catalogueToProduct, catalogueToProducts } from './adapter'

import { MOCK_CATALOGUE } from './mock-catalogue'
import type { CatalogueProduct } from './types'

/**
 * Returns the current product catalogue.
 * Reads from the Zustand store so blueprint generation always uses the same
 * data as the stack review page (live Shopify if loaded, mock otherwise).
 * Safe to call outside React (uses getState, not a hook).
 */
export function getCatalogue(): CatalogueProduct[] {
  try {
    // Dynamic require avoids a circular module dep and works in SSR.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useQuizStore } = require('@/lib/store') as {
      useQuizStore: { getState: () => { catalogueProducts: CatalogueProduct[] } }
    }
    const products = useQuizStore.getState().catalogueProducts
    return products.length > 0 ? products : MOCK_CATALOGUE
  } catch {
    return MOCK_CATALOGUE
  }
}
