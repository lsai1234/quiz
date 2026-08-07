import type { CatalogueProduct, CatalogueVariant } from './types'
import type { Product, ProductVariant, StackLevel } from '@/lib/types'

function catalogueVariantToProductVariant(cv: CatalogueVariant): ProductVariant {
  return {
    id: cv.id,
    title: cv.title,
    price: cv.price,
    compareAtPrice: cv.compareAtPrice,
    availableForSale: cv.available,
    image: null,
  }
}

function deriveStackLevels(cp: CatalogueProduct): StackLevel[] {
  const levels: StackLevel[] = []
  if (cp.isCoreEligible) {
    levels.push('essentials', 'performance')
  }
  if (cp.isBoosterEligible) {
    levels.push('complete')
  }
  return levels
}

export function catalogueToProduct(cp: CatalogueProduct): Product {
  return {
    id: cp.id,
    handle: cp.handle,
    name: cp.title,
    category: cp.category,
    subcategory: cp.swapGroup,
    price: cp.basePrice,
    description: cp.description,
    safeWording: cp.shortReason,
    goalTags: cp.goals,
    stimulant: cp.hasStimulants,
    vegan: cp.dietaryTags.includes('vegan'),
    beginner: cp.recommendationPriority >= 7,
    stackPriority: cp.recommendationPriority,
    stackLevels: deriveStackLevels(cp),
    variantId: cp.variants[0]?.id ?? '',
    accentColor: '#00E5FF',
    image: cp.imageUrl,
    variants: cp.variants.map(catalogueVariantToProductVariant),
  }
}

export function catalogueToProducts(cps: CatalogueProduct[]): Product[] {
  return cps.map(catalogueToProduct)
}
