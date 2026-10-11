import type { CatalogueProduct } from '@/lib/catalogue/types'
import type { ReadinessCheck } from '@/lib/portal/readiness'
import type { ListEntry } from '../model'

/** A product that passes every check, with whatever the test changes on top. */
export const makeProduct = (o: Partial<CatalogueProduct> = {}): CatalogueProduct => ({
  id: 'p',
  title: 'P',
  handle: 'p',
  description: '',
  imageUrl: 'https://img/x.jpg',
  brand: 'PowerBody',
  category: 'Protein',
  stackSlots: ['protein'],
  goals: ['muscle'],
  dietaryTags: [],
  formats: ['powder'],
  variants: [{ id: 'v', title: '', flavour: null, size: null, price: 30, compareAtPrice: null, available: true, sku: 'PB-1' }],
  basePrice: 30,
  compareAtPrice: null,
  cost: 10,
  weightGrams: 1150,
  subscriptionEligible: true,
  servings: 30,
  swapGroup: 'protein-whey',
  recommendationPriority: 8,
  marginPriority: 7,
  isCoreEligible: true,
  isBoosterEligible: false,
  hasStimulants: false,
  shortReason: 'x',
  warnings: [],
  ...o,
})

/** A row of `GET /api/portal/products?all=1`. */
export const makeEntry = (
  product: Partial<CatalogueProduct>,
  o: { state?: ListEntry['state']; checks?: ReadinessCheck[]; remaining?: number } = {},
): ListEntry => {
  const p = makeProduct(product)
  const checks = o.checks ?? [{ id: 'identity', label: 'Real product & image', status: 'ok' as const }]
  const rank = { ok: 0, info: 0, warn: 1, fail: 2 }
  const overall = checks.reduce<ReadinessCheck['status']>((acc, c) => (rank[c.status] > rank[acc] ? c.status : acc), 'ok')
  return {
    product: p,
    state: o.state ?? 'live',
    storage: 'imported',
    readiness: { productId: p.id, overall, checks },
    remaining: o.remaining ?? 0,
  }
}

export const FAIL_COST: ReadinessCheck = {
  id: 'subscription',
  label: 'Subscription-ready',
  status: 'fail',
  detail: 'No servings set',
  section: 'quiz',
}
export const WARN_COST: ReadinessCheck = {
  id: 'pricing',
  label: 'Cost set for margins',
  status: 'warn',
  detail: 'What PowerBody charge us is not known, so margins are estimated',
  section: 'supplier',
}
export const INFO_WEIGHT: ReadinessCheck = {
  id: 'shipping',
  label: 'Shipping weight set',
  status: 'info',
  detail: 'No weight from PowerBody',
  section: 'supplier',
}
