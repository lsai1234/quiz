import type { CatalogueProduct } from '@/lib/catalogue/types'
import type { QueueEntry } from '../queue-model'

/** An imported product waiting for review, with whatever the test changes on top. */
export const pendingProduct = (o: Partial<CatalogueProduct> = {}): CatalogueProduct => ({
  id: 'p',
  title: 'P',
  handle: 'p',
  description: 'A tub of protein.',
  imageUrl: 'https://img/x.jpg',
  brand: 'Applied',
  category: 'Protein',
  stackSlots: ['protein'],
  goals: ['muscle'],
  dietaryTags: [],
  formats: ['powder'],
  variants: [{ id: 'v', title: 'Chocolate', flavour: 'Chocolate', size: null, price: 30, compareAtPrice: null, available: true, sku: 'P100', supplierProductId: '100' }],
  basePrice: 29.99,
  compareAtPrice: null,
  cost: 12.5,
  subscriptionEligible: true,
  servings: 30,
  swapGroup: 'protein-whey',
  recommendationPriority: 5,
  marginPriority: 5,
  isCoreEligible: true,
  isBoosterEligible: false,
  hasStimulants: false,
  shortReason: 'x',
  warnings: [],
  review: { status: 'pending', sources: {}, confirmed: [], importedAt: '2026-10-01T00:00:00Z' },
  ...o,
})

export const entry = (o: Partial<CatalogueProduct> = {}, remaining: string[] = []): QueueEntry => ({
  product: pendingProduct(o),
  remaining,
  complete: remaining.length === 0,
})
