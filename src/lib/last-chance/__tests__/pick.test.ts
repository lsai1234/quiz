import { packMonthsFor, pickHeroOffer } from '../pick'
import type { StackSlotEntry } from '@/lib/stack-blueprint/types'
import type { CatalogueProduct } from '@/lib/catalogue/types'
import { CLAIMS } from '@/lib/consult/claims'

/**
 * Picking the one product, and what may be said about it.
 *
 * It has to be the stack's best fit that can be sold on its own on a real deal
 * at a profit — never a full price dressed up as an offer — and everything it says
 * has to come from a safe source: their own goal words, GB-register claim
 * wording verbatim (or nothing), and facts. docs/ORDER_CONFIRMATION_SPEC.md §5.
 */

function product(id: string, over: Partial<CatalogueProduct> = {}): CatalogueProduct {
  return {
    id,
    title: id,
    cost: 12,
    basePrice: 34.99,
    swapGroup: 'protein-whey',
    stackSlots: ['protein'],
    goals: ['muscle'],
    category: 'Protein',
    recommendationPriority: 5,
    shortReason: 'Boosts everything',
    variants: [{ id: `v-${id}`, price: 34.99, available: true, cost: 12, servings: 30 }],
    ...over,
  } as unknown as CatalogueProduct
}

function slot(productId: string, over: Partial<StackSlotEntry> = {}): StackSlotEntry {
  return {
    slotId: `slot-${productId}`,
    slotType: 'protein',
    title: productId,
    description: '',
    recommendedProductId: productId,
    selectedProductId: productId,
    selectedVariantId: null,
    required: false,
    canRemove: true,
    canSwap: true,
    swapGroup: 'protein-whey',
    reason: 'Speeds up repair between your sessions',
    confidenceScore: 60,
    displayOrder: 0,
    ...over,
  } as StackSlotEntry
}

const cheap = (id: string) =>
  product(id, { cost: 6, variants: [{ id: `v-${id}`, price: 11.99, available: true, cost: 6 }] as never })

it('takes the best-fitting product the business can sell on its own', () => {
  const hero = pickHeroOffer(
    [slot('a', { confidenceScore: 60 }), slot('b', { confidenceScore: 80 }), slot('cheap', { confidenceScore: 99, required: true })],
    [product('a'), product('b'), cheap('cheap')],
  )
  // "cheap" fits best but has no deal it can afford alone, so it is skipped rather than shown at full price.
  expect(hero?.product.id).toBe('b')
  expect(hero?.quote.viable).toBe(true)
})

it('puts a real deal on the card, delivery first', () => {
  const hero = pickHeroOffer([slot('a'), slot('b', { confidenceScore: 10 })], [product('a'), product('b')])
  expect(hero?.quote.totalSaving).toBeGreaterThan(0)
  expect(hero?.quote.deliveryCharge).toBeLessThan(hero!.quote.standardDelivery)
  // A percentage only ever comes on top of free delivery.
  if (hero!.quote.discountPct > 0) expect(hero?.quote.deliveryCharge).toBe(0)
})

it('says what it does only in register wording, verbatim — or not at all', () => {
  const whey = pickHeroOffer([slot('whey'), slot('other', { confidenceScore: 10 })], [product('whey'), product('other')], { primaryGoal: 'muscle' })
  expect(whey?.claim).toEqual({ id: 'protein-muscle-growth', wording: CLAIMS['protein-muscle-growth'].wording })

  // Pre-workouts have no authorised claim, so the card has no "what it does".
  const pre = product('pre', { swapGroup: 'pre-workout-stim', goals: ['energy'], stackSlots: ['energy'] })
  const hero = pickHeroOffer([slot('pre', { confidenceScore: 90 }), slot('x', { confidenceScore: 10 })], [pre, product('x')], { primaryGoal: 'energy' })
  expect(hero?.product.id).toBe('pre')
  expect(hero?.claim).toBeNull()
})

it('explains the pick in their own goal words, never the engine’s free text', () => {
  const hero = pickHeroOffer([slot('whey', { required: true }), slot('b', { confidenceScore: 10 })], [product('whey'), product('b')], { primaryGoal: 'muscle' })
  expect(hero?.goalLine).toBe('You told us your top goal is “Build muscle”. Of the 2 products in your stack, this is the one built around it. It’s the core of your stack.')
  expect(hero?.goalLine).not.toMatch(/boost|improv|increas|speed|faster|cure|treat|prevent|feel/i)
  expect(JSON.stringify(hero)).not.toMatch(/Speeds up repair/)
})

it('skips what cannot be bought on its own: sold out, a refill, an accessory', () => {
  const gone = product('gone', { variants: [{ id: 'v-gone', price: 34.99, available: false, cost: 12 }] as never })
  const refill = product('refill', { isSubscriptionOnly: true })
  const shaker = product('shaker', { swapGroup: 'accessory' as never, category: 'Accessories' })
  const hero = pickHeroOffer(
    [slot('gone', { confidenceScore: 99 }), slot('refill', { confidenceScore: 98 }), slot('shaker', { confidenceScore: 97 }), slot('ok')],
    [gone, refill, shaker, product('ok')],
  )
  expect(hero?.product.id).toBe('ok')
})

it('offers nothing for a stack of one, or when nothing pays on its own', () => {
  expect(pickHeroOffer([slot('a')], [product('a')])).toBeNull()
  expect(pickHeroOffer([slot('x'), slot('y')], [cheap('x'), cheap('y')])).toBeNull()
})

it('says how long a pack lasts only when the servings are known', () => {
  const daily = product('d', { consumption: { cadence: 'daily', servingsPerUnit: 30 } } as never)
  expect(packMonthsFor(daily, daily.variants[0], null)).toBe(1)
  const unknown = product('u', { variants: [{ id: 'v-u', price: 34.99, available: true, cost: 12 }] as never, servings: null } as never)
  expect(packMonthsFor(unknown, unknown.variants[0], null)).toBeNull()
})
