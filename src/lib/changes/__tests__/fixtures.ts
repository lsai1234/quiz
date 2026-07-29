/**
 * Minimal, explicit fixtures for the change-domain tests. Deliberately hand-built
 * rather than derived from the blueprint engine, so a pricing tweak elsewhere
 * can't silently change what these tests are asserting.
 */
import type { CatalogueProduct, DietaryTag, SwapGroup } from '@/lib/catalogue/types'
import type { MemberSubscription, MemberSubscriptionLine } from '@/lib/recharge/types'
import { flatMonthlyOf } from '@/lib/recharge/mock'

export function product(over: {
  id: string
  swapGroup?: SwapGroup
  price?: number
  cost?: number | null
  dietaryTags?: DietaryTag[]
  hasStimulants?: boolean
  isSubscriptionOnly?: boolean
  subscriptionEligible?: boolean
  title?: string
}): CatalogueProduct {
  const price = over.price ?? 30
  return {
    id: over.id,
    title: over.title ?? over.id,
    brand: 'Test',
    category: 'Protein',
    description: '',
    basePrice: price,
    cost: over.cost === undefined ? undefined : over.cost,
    images: [],
    variants: [
      {
        id: `${over.id}-v1`,
        title: 'Default',
        flavour: null,
        size: null,
        price,
        compareAtPrice: null,
        available: true,
        sku: `SKU-${over.id}`,
        shopifyVariantId: null,
      },
    ],
    stackSlots: ['protein'],
    swapGroup: over.swapGroup ?? 'protein-whey',
    goals: ['muscle'],
    dietaryTags: over.dietaryTags ?? [],
    hasStimulants: over.hasStimulants ?? false,
    formats: ['powder'],
    servings: 30,
    isCoreEligible: true,
    isBoosterEligible: false,
    subscriptionEligible: over.subscriptionEligible ?? true,
    isSubscriptionOnly: over.isSubscriptionOnly ?? false,
  } as unknown as CatalogueProduct
}

export function line(over: Partial<MemberSubscriptionLine> = {}): MemberSubscriptionLine {
  return {
    id: 'l1',
    productId: 'whey-a',
    productTitle: 'Whey A',
    variantTitle: '',
    slotTitle: 'Protein',
    stackSlot: 'protein',
    quantity: 1,
    deliveryIntervalMonths: 1,
    pricePerDelivery: 30,
    swapGroup: 'protein-whey',
    addedAt: '2026-01-15T00:00:00.000Z',
    deliveriesMade: 0,
    ...over,
  }
}

export function subscriptionWith(
  lines: MemberSubscriptionLine[],
  over: Partial<MemberSubscription> = {},
): MemberSubscription {
  return {
    id: 'sub_test',
    status: 'active',
    customerEmail: 'member@example.com',
    flatMonthly: flatMonthlyOf(lines),
    dispatchDayOfMonth: 15,
    minMonths: 1,
    monthsActive: 0,
    startedAt: '2026-01-15T00:00:00.000Z',
    paymentMethod: null,
    lines,
    ...over,
  }
}
