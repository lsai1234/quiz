export * from './types'
export * from './filters'
export { MOCK_CATALOGUE } from './mock-catalogue'
export { catalogueToProduct, catalogueToProducts } from './adapter'

import { MOCK_CATALOGUE } from './mock-catalogue'
import type { CatalogueProduct } from './types'

/** Returns the product catalogue. Placeholder — will be replaced with API fetch. */
export function getCatalogue(): CatalogueProduct[] {
  return MOCK_CATALOGUE
}
