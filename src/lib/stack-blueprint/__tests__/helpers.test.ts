import {
  calculateStackPrice,
  calculateSubscriptionPrice,
  updateStackSlotProduct,
  updateStackSlotVariant,
  removeOptionalSlot,
  addBoosterSlot,
  getSwappableProductsForSlot,
} from '../helpers'
import type { StackBlueprint, StackSlotEntry } from '../types'
import type { CatalogueProduct } from '@/lib/catalogue/types'

// ─── Inline mock data ──────────────────────────────────────────────────────────

const mockProductA: CatalogueProduct = {
  id: 'product-a',
  title: 'Product A',
  handle: 'product-a',
  description: 'Test product A',
  imageUrl: null,
  category: 'Protein',
  stackSlots: ['protein'],
  goals: ['muscle'],
  dietaryTags: ['gluten-free'],
  formats: ['powder'],
  variants: [
    { id: 'variant-a1', title: 'Choc / 1kg', flavour: 'Chocolate', size: '1kg', price: 35.00, compareAtPrice: null, available: true, shopifyVariantId: null },
    { id: 'variant-a2', title: 'Vanilla / 1kg', flavour: 'Vanilla', size: '1kg', price: 36.00, compareAtPrice: null, available: true, shopifyVariantId: null },
  ],
  basePrice: 35.00,
  compareAtPrice: null,
  subscriptionEligible: true,
  swapGroup: 'protein-whey',
  recommendationPriority: 9,
  marginPriority: 8,
  isCoreEligible: true,
  isBoosterEligible: false,
  hasStimulants: false,
  shortReason: 'Great for building muscle.',
  warnings: [],
  shopifyProductId: null,
}

const mockProductB: CatalogueProduct = {
  id: 'product-b',
  title: 'Product B',
  handle: 'product-b',
  description: 'Test product B (non-subscription)',
  imageUrl: null,
  category: 'Performance',
  stackSlots: ['performance'],
  goals: ['muscle', 'performance'],
  dietaryTags: ['vegan'],
  formats: ['powder'],
  variants: [
    { id: 'variant-b1', title: 'Unflavoured / 500g', flavour: null, size: '500g', price: 20.00, compareAtPrice: null, available: true, shopifyVariantId: null },
  ],
  basePrice: 20.00,
  compareAtPrice: null,
  subscriptionEligible: false,
  swapGroup: 'creatine',
  recommendationPriority: 8,
  marginPriority: 7,
  isCoreEligible: true,
  isBoosterEligible: false,
  hasStimulants: false,
  shortReason: 'Boosts power output.',
  warnings: [],
  shopifyProductId: null,
}

const mockProductC: CatalogueProduct = {
  id: 'product-c',
  title: 'Product C',
  handle: 'product-c',
  description: 'Another protein in same swap group',
  imageUrl: null,
  category: 'Protein',
  stackSlots: ['protein'],
  goals: ['muscle'],
  dietaryTags: ['vegan'],
  formats: ['powder'],
  variants: [],
  basePrice: 37.00,
  compareAtPrice: null,
  subscriptionEligible: true,
  swapGroup: 'protein-whey',
  recommendationPriority: 7,
  marginPriority: 6,
  isCoreEligible: true,
  isBoosterEligible: false,
  hasStimulants: false,
  shortReason: 'Also great for muscle.',
  warnings: [],
  shopifyProductId: null,
}

const catalogue = [mockProductA, mockProductB, mockProductC]

const slotA: StackSlotEntry = {
  slotId: 'slot-protein',
  slotType: 'protein',
  title: 'Protein',
  description: 'Builds muscle',
  recommendedProductId: 'product-a',
  selectedProductId: 'product-a',
  selectedVariantId: null,
  required: true,
  canRemove: false,
  canSwap: true,
  swapGroup: 'protein-whey',
  reason: 'Great for building muscle.',
  confidenceScore: 90,
  displayOrder: 0,
}

const slotB: StackSlotEntry = {
  slotId: 'slot-performance',
  slotType: 'performance',
  title: 'Performance',
  description: 'Boosts power',
  recommendedProductId: 'product-b',
  selectedProductId: 'product-b',
  selectedVariantId: null,
  required: false,
  canRemove: true,
  canSwap: true,
  swapGroup: 'creatine',
  reason: 'Boosts power output.',
  confidenceScore: 80,
  displayOrder: 1,
}

const mockBlueprint: StackBlueprint = {
  id: 'test-blueprint',
  stackName: 'Test Stack',
  summary: 'A test stack',
  primaryGoal: 'muscle',
  secondaryGoals: [],
  userProfileSummary: '25-34, male, strength',
  slots: [slotA, slotB],
  estimatedOneOffPrice: 55.00,
  estimatedSubscriptionPrice: 49.75,
  savingsSummary: 'Save £5.25/month',
  createdAt: '2026-06-12T00:00:00.000Z',
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('calculateStackPrice', () => {
  it('returns sum of base prices when no variant selected', () => {
    const price = calculateStackPrice(mockBlueprint, catalogue)
    // product-a basePrice=35.00 + product-b basePrice=20.00
    expect(price).toBe(55.00)
  })

  it('uses variant price when a variant is selected', () => {
    const blueprintWithVariant: StackBlueprint = {
      ...mockBlueprint,
      slots: [
        { ...slotA, selectedVariantId: 'variant-a2' }, // variant price = 36.00
        slotB,
      ],
    }
    const price = calculateStackPrice(blueprintWithVariant, catalogue)
    expect(price).toBe(56.00) // 36 + 20
  })
})

describe('calculateSubscriptionPrice', () => {
  it('returns discounted price for subscription-eligible products and full price for non-eligible', () => {
    const price = calculateSubscriptionPrice(mockBlueprint, catalogue)
    // product-a: 35 * 0.85 = 29.75
    // product-b: 20 (not subscription eligible)
    expect(price).toBe(49.75)
  })
})

describe('updateStackSlotProduct', () => {
  it('returns new blueprint with updated selectedProductId and reset variantId', () => {
    const updated = updateStackSlotProduct(mockBlueprint, 'slot-protein', 'product-c')
    expect(updated.slots[0].selectedProductId).toBe('product-c')
    expect(updated.slots[0].selectedVariantId).toBeNull()
  })

  it('does not mutate the original blueprint', () => {
    updateStackSlotProduct(mockBlueprint, 'slot-protein', 'product-c')
    expect(mockBlueprint.slots[0].selectedProductId).toBe('product-a')
  })

  it('throws if slotId not found', () => {
    expect(() => updateStackSlotProduct(mockBlueprint, 'slot-nonexistent', 'product-c')).toThrow()
  })
})

describe('updateStackSlotVariant', () => {
  it('updates correct slot selectedVariantId', () => {
    const updated = updateStackSlotVariant(mockBlueprint, 'slot-protein', 'variant-a2')
    expect(updated.slots[0].selectedVariantId).toBe('variant-a2')
    expect(updated.slots[1].selectedVariantId).toBeNull()
  })

  it('does not mutate original blueprint', () => {
    updateStackSlotVariant(mockBlueprint, 'slot-protein', 'variant-a2')
    expect(mockBlueprint.slots[0].selectedVariantId).toBeNull()
  })

  it('throws if slotId not found', () => {
    expect(() => updateStackSlotVariant(mockBlueprint, 'slot-nonexistent', 'v1')).toThrow()
  })
})

describe('removeOptionalSlot', () => {
  it('removes a non-required slot', () => {
    const updated = removeOptionalSlot(mockBlueprint, 'slot-performance')
    expect(updated.slots).toHaveLength(1)
    expect(updated.slots[0].slotId).toBe('slot-protein')
  })

  it('throws when trying to remove a required slot', () => {
    expect(() => removeOptionalSlot(mockBlueprint, 'slot-protein')).toThrow()
  })

  it('does not mutate original blueprint', () => {
    removeOptionalSlot(mockBlueprint, 'slot-performance')
    expect(mockBlueprint.slots).toHaveLength(2)
  })
})

describe('addBoosterSlot', () => {
  it('appends slot with correct displayOrder', () => {
    const newSlot: Omit<StackSlotEntry, 'displayOrder' | 'canRemove'> = {
      slotId: 'slot-sleep',
      slotType: 'sleep',
      title: 'Sleep',
      description: 'Better sleep',
      recommendedProductId: 'product-d',
      selectedProductId: 'product-d',
      selectedVariantId: null,
      required: false,
      canSwap: true,
      swapGroup: 'magnesium',
      reason: 'Improves sleep quality.',
      confidenceScore: 70,
    }
    const updated = addBoosterSlot(mockBlueprint, newSlot)
    expect(updated.slots).toHaveLength(3)
    const added = updated.slots[2]
    expect(added.slotId).toBe('slot-sleep')
    expect(added.displayOrder).toBe(2) // max(0, 1) + 1 = 2
    expect(added.canRemove).toBe(true)
    expect(added.required).toBe(false)
  })

  it('does not mutate original blueprint', () => {
    const newSlot: Omit<StackSlotEntry, 'displayOrder' | 'canRemove'> = {
      slotId: 'slot-health',
      slotType: 'health',
      title: 'Health',
      description: 'General health',
      recommendedProductId: 'product-e',
      selectedProductId: 'product-e',
      selectedVariantId: null,
      required: false,
      canSwap: true,
      swapGroup: 'omega-3',
      reason: 'Good for health.',
      confidenceScore: 60,
    }
    addBoosterSlot(mockBlueprint, newSlot)
    expect(mockBlueprint.slots).toHaveLength(2)
  })
})

describe('getSwappableProductsForSlot', () => {
  it('returns products in same swapGroup excluding current', () => {
    // slotA has swapGroup='protein-whey', selectedProductId='product-a'
    // product-a and product-c are in protein-whey
    const swappable = getSwappableProductsForSlot(slotA, catalogue)
    expect(swappable).toHaveLength(1)
    expect(swappable[0].id).toBe('product-c')
  })

  it('returns empty array when no alternatives exist', () => {
    const swappable = getSwappableProductsForSlot(slotB, catalogue)
    // slotB is in 'creatine' group, only product-b is in that group
    expect(swappable).toHaveLength(0)
  })
})
