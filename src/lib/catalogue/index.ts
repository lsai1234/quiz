export * from './types'
export * from './filters'
export { MOCK_CATALOGUE } from './mock-catalogue'
export { catalogueToProduct, catalogueToProducts } from './adapter'

import { MOCK_CATALOGUE } from './mock-catalogue'

/**
 * Returns the mock catalogue. Import and call getState() directly on the
 * Zustand store at the call site when you need live data — that avoids the
 * circular-dependency risk (store → @/lib/catalogue → store).
 */
export function getCatalogue(): import('./types').CatalogueProduct[] {
  return MOCK_CATALOGUE
}
