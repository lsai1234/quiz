import { impactScore, pickHeroOffer } from '../pick'
import type { StackSlotEntry } from '@/lib/stack-blueprint/types'
import type { CatalogueProduct } from '@/lib/catalogue/types'

/**
 * Picking the one product. It has to be the stack's best fit that can be sold
 * on its own at a profit — never a cheap product whose parcel costs more than
 * it makes, however well it fits.
 */

function product(id: string, over: Partial<CatalogueProduct> = {}): CatalogueProduct {
  return {
    id,
    title: id,
    cost: 12,
    basePrice: 34.99,
    swapGroup: 'creatine',
    stackSlots: ['performance'],
    recommendationPriority: 5,
    shortReason: `${id} reason`,
    variants: [{ id: `v-${id}`, price: 34.99, available: true, cost: 12 }],
    ...over,
  } as unknown as CatalogueProduct
}

function slot(productId: string, over: Partial<StackSlotEntry> = {}): StackSlotEntry {
  return {
    slotId: `slot-${productId}`,
    slotType: 'performance',
    title: productId,
    description: '',
    recommendedProductId: productId,
    selectedProductId: productId,
    selectedVariantId: null,
    required: false,
    canRemove: true,
    canSwap: true,
    swapGroup: 'creatine',
    reason: `Picked for you: ${productId}`,
    confidenceScore: 60,
    displayOrder: 0,
    ...over,
  } as StackSlotEntry
}

it('takes the best-fitting product the business can sell on its own', () => {
  const products = [product('a'), product('b'), product('cheap', { cost: 6, variants: [{ id: 'v-cheap', price: 11.99, available: true, cost: 6 }] as never })]
  const hero = pickHeroOffer(
    [slot('a', { confidenceScore: 60 }), slot('b', { confidenceScore: 80 }), slot('cheap', { confidenceScore: 99, required: true })],
    products,
  )
  // "cheap" fits best but loses money alone, so it is skipped rather than discounted.
  expect(hero?.product.id).toBe('b')
  expect(hero?.quote.viable).toBe(true)
  expect(hero?.reason).toBe('Picked for you: b')
  expect(hero?.claims.length).toBeGreaterThan(0)
})

it('leans towards something you will notice over something working quietly', () => {
  const felt = slot('felt', { confidenceScore: 70 })
  const quiet = slot('quiet', { confidenceScore: 70 })
  const feltP = product('felt', { effectOnset: 'immediate' })
  const quietP = product('quiet', { effectOnset: 'none' })
  expect(impactScore(felt, feltP)).toBeGreaterThan(impactScore(quiet, quietP))
  expect(pickHeroOffer([quiet, felt], [quietP, feltP])?.product.id).toBe('felt')
})

it('skips what cannot be bought: sold out, or a subscription-only refill', () => {
  const gone = product('gone', { variants: [{ id: 'v-gone', price: 34.99, available: false, cost: 12 }] as never })
  const refill = product('refill', { isSubscriptionOnly: true })
  const ok = product('ok')
  expect(pickHeroOffer([slot('gone', { confidenceScore: 99 }), slot('refill', { confidenceScore: 98 }), slot('ok')], [gone, refill, ok])?.product.id).toBe('ok')
})

it('offers nothing for a stack of one, or when nothing pays on its own', () => {
  expect(pickHeroOffer([slot('a')], [product('a')])).toBeNull()
  const cheap = (id: string) => product(id, { cost: 6, variants: [{ id: `v-${id}`, price: 11.99, available: true, cost: 6 }] as never })
  expect(pickHeroOffer([slot('x'), slot('y')], [cheap('x'), cheap('y')])).toBeNull()
})

it('says how long a pack lasts when the plan knows', () => {
  const hero = pickHeroOffer([slot('a'), slot('b', { confidenceScore: 10 })], [product('a'), product('b')], { packMonthsByProductId: { a: 2.04 } })
  expect(hero?.packMonths).toBe(2)
})
