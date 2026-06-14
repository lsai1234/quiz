import { calculatePricing, formatGBP, formatSaving, qualifiesForSubscription, getSubscriptionProduct, buildSubscriptionPlan, PRICING_CONFIG } from '../pricing'
import type { StackBlueprint } from '../types'
import type { CatalogueProduct } from '@/lib/catalogue/types'

// ─── Minimal fixtures ─────────────────────────────────────────────────────────

const makeProduct = (overrides: Partial<CatalogueProduct> = {}): CatalogueProduct => ({
  id: 'prod-a',
  title: 'Test Product',
  handle: 'test-product',
  description: 'A test product',
  imageUrl: null,
  category: 'Protein',
  stackSlots: ['protein'],
  goals: ['muscle'],
  dietaryTags: [],
  formats: ['powder'],
  variants: [
    { id: 'v1', title: 'Chocolate', flavour: 'Chocolate', size: '500g', price: 30, compareAtPrice: 40, available: true, shopifyVariantId: null },
    { id: 'v2', title: 'Vanilla', flavour: 'Vanilla', size: '500g', price: 32, compareAtPrice: 42, available: true, shopifyVariantId: null },
  ],
  basePrice: 30,
  compareAtPrice: 40,
  subscriptionEligible: true,
  daysOfSupply: 30,
  swapGroup: 'protein-whey',
  recommendationPriority: 8,
  marginPriority: 7,
  isCoreEligible: true,
  isBoosterEligible: false,
  hasStimulants: false,
  shortReason: 'Builds muscle',
  warnings: [],
  shopifyProductId: null,
  ...overrides,
})

const makeBlueprint = (slots: Partial<StackBlueprint['slots'][number]>[] = []): StackBlueprint => ({
  id: 'bp-test',
  stackName: 'Test Stack',
  summary: 'A test stack',
  primaryGoal: 'muscle',
  secondaryGoals: [],
  userProfileSummary: '25-34',
  slots: slots.map((s, i) => ({
    slotId: `slot-${i}`,
    slotType: 'protein',
    title: 'Protein',
    description: 'Builds muscle',
    recommendedProductId: 'prod-a',
    selectedProductId: 'prod-a',
    selectedVariantId: null,
    required: true,
    canRemove: false,
    canSwap: true,
    swapGroup: 'protein-whey',
    reason: 'Good protein',
    confidenceScore: 80,
    displayOrder: i,
    ...s,
  })),
  estimatedOneOffPrice: 0,
  estimatedSubscriptionPrice: 0,
  savingsSummary: '',
  createdAt: new Date().toISOString(),
})

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('calculatePricing', () => {
  it('uses basePrice when no variant selected and no available variant', () => {
    const product = makeProduct({ variants: [], basePrice: 25 })
    const blueprint = makeBlueprint([{ selectedProductId: 'prod-a', selectedVariantId: null }])
    const p = calculatePricing(blueprint, [product])
    expect(p.oneOffTotal).toBe(25)
  })

  it('uses first available variant price when selectedVariantId is null', () => {
    const product = makeProduct()
    const blueprint = makeBlueprint([{ selectedProductId: 'prod-a', selectedVariantId: null }])
    const p = calculatePricing(blueprint, [product])
    expect(p.oneOffTotal).toBe(30) // v1 price
  })

  it('uses selected variant price', () => {
    const product = makeProduct()
    const blueprint = makeBlueprint([{ selectedProductId: 'prod-a', selectedVariantId: 'v2' }])
    const p = calculatePricing(blueprint, [product])
    expect(p.oneOffTotal).toBe(32) // v2 price
  })

  it('calculates rrpTotal from variant compareAtPrice', () => {
    const product = makeProduct()
    const blueprint = makeBlueprint([{ selectedProductId: 'prod-a', selectedVariantId: 'v1' }])
    const p = calculatePricing(blueprint, [product])
    expect(p.rrpTotal).toBe(40)
    expect(p.bundleSaving).toBe(10)
    expect(p.bundleSavingPct).toBe(25)
  })

  it('bundleSaving is 0 when no compareAtPrice exists', () => {
    const product = makeProduct({
      compareAtPrice: null,
      variants: [
        { id: 'v1', title: 'Choc', flavour: 'Chocolate', size: '500g', price: 30, compareAtPrice: null, available: true, shopifyVariantId: null },
      ],
    })
    const blueprint = makeBlueprint([{ selectedProductId: 'prod-a', selectedVariantId: 'v1' }])
    const p = calculatePricing(blueprint, [product])
    expect(p.bundleSaving).toBe(0)
    expect(p.bundleSavingPct).toBe(0)
  })

  it('applies subscription discount to eligible products', () => {
    const product = makeProduct({ subscriptionEligible: true })
    const blueprint = makeBlueprint([{ selectedProductId: 'prod-a', selectedVariantId: 'v1' }])
    const p = calculatePricing(blueprint, [product])
    const expected = Math.round(30 * (1 - PRICING_CONFIG.subscriptionDiscount) * 100) / 100
    expect(p.subscriptionTotal).toBe(expected)
    expect(p.subscriptionSaving).toBe(Math.round((30 - expected) * 100) / 100)
    expect(p.subscriptionSavingPct).toBe(Math.round(((30 - expected) / 30) * 100))
  })

  it('excludes ineligible products from the subscription entirely', () => {
    const product = makeProduct({ subscriptionEligible: false })
    const blueprint = makeBlueprint([{ selectedProductId: 'prod-a', selectedVariantId: 'v1' }])
    const p = calculatePricing(blueprint, [product])
    expect(p.subscriptionTotal).toBe(0)
    expect(p.subscriptionSaving).toBe(0)
    expect(p.subscriptionItemCount).toBe(0)
    expect(p.excludedFromSubscriptionCount).toBe(1)
  })

  it('flips a long-lasting product to its mapped monthly subscription product', () => {
    const longProduct = makeProduct({
      id: 'creatine', basePrice: 20, daysOfSupply: 90, subscriptionProductId: 'creatine-monthly',
      variants: [{ id: 'cv', title: '500g', flavour: null, size: '500g', price: 20, compareAtPrice: null, available: true, shopifyVariantId: null }],
    })
    const monthly = makeProduct({
      id: 'creatine-monthly', basePrice: 9, isSubscriptionOnly: true,
      variants: [{ id: 'cmv', title: '150g', flavour: null, size: '150g', price: 9, compareAtPrice: null, available: true, shopifyVariantId: null }],
    })
    const blueprint = makeBlueprint([{ selectedProductId: 'creatine', selectedVariantId: 'cv' }])
    const p = calculatePricing(blueprint, [longProduct, monthly])
    expect(p.oneOffTotal).toBe(20)                          // one-off uses the 500g tub
    expect(p.subscriptionItemsOneOffTotal).toBe(9)          // subscription uses the monthly refill
    expect(p.subscriptionTotal).toBe(Math.round(9 * 0.85 * 100) / 100)
    expect(p.subscriptionItemCount).toBe(1)
    expect(p.subscriptionSwappedCount).toBe(1)
    expect(p.excludedFromSubscriptionCount).toBe(0)
  })

  it('deduplicates when two slots resolve to the same subscription product', () => {
    const vitD = makeProduct({
      id: 'vit-d', basePrice: 13, daysOfSupply: 60, subscriptionProductId: 'vit-d-monthly', stackSlots: ['health'],
      variants: [{ id: 'vdv', title: '', flavour: null, size: null, price: 13, compareAtPrice: null, available: true, shopifyVariantId: null }],
    })
    const bone = makeProduct({
      id: 'bone', basePrice: 18, daysOfSupply: 45, subscriptionProductId: 'vit-d-monthly', stackSlots: ['menopause'],
      variants: [{ id: 'bv', title: '', flavour: null, size: null, price: 18, compareAtPrice: null, available: true, shopifyVariantId: null }],
    })
    const monthly = makeProduct({
      id: 'vit-d-monthly', basePrice: 8, isSubscriptionOnly: true,
      variants: [{ id: 'vdm', title: '', flavour: null, size: null, price: 8, compareAtPrice: null, available: true, shopifyVariantId: null }],
    })
    const blueprint = makeBlueprint([
      { selectedProductId: 'vit-d', selectedVariantId: 'vdv' },
      { selectedProductId: 'bone', selectedVariantId: 'bv', slotType: 'menopause' } as never,
    ])
    const p = calculatePricing(blueprint, [vitD, bone, monthly])
    // Both slots map to the same monthly product → billed once.
    expect(p.subscriptionItemCount).toBe(1)
    expect(p.subscriptionItemsOneOffTotal).toBe(8)
    expect(p.subscriptionTotal).toBe(Math.round(8 * 0.85 * 100) / 100)
    expect(p.subscriptionSwappedCount).toBe(2)
  })

  it('sums correctly across multiple slots, excluding non-qualifying products from the subscription', () => {
    const prodA = makeProduct({ id: 'prod-a', basePrice: 30, subscriptionEligible: true, daysOfSupply: 30, variants: [{ id: 'va', title: 'A', flavour: null, size: null, price: 30, compareAtPrice: 40, available: true, shopifyVariantId: null }] })
    const prodB = makeProduct({ id: 'prod-b', basePrice: 20, compareAtPrice: null, subscriptionEligible: false, variants: [{ id: 'vb', title: 'B', flavour: null, size: null, price: 20, compareAtPrice: null, available: true, shopifyVariantId: null }] })
    const blueprint = makeBlueprint([
      { selectedProductId: 'prod-a', selectedVariantId: 'va' },
      { selectedProductId: 'prod-b', selectedVariantId: 'vb', slotType: 'performance' } as never,
    ])
    const p = calculatePricing(blueprint, [prodA, prodB])
    expect(p.oneOffTotal).toBe(50)
    expect(p.rrpTotal).toBe(60)   // 40 + 20 (no compare for B)
    expect(p.bundleSaving).toBe(10)
    // Only prodA qualifies for the monthly plan; prodB (ineligible) is excluded.
    const subA = Math.round(30 * 0.85 * 100) / 100
    expect(p.subscriptionTotal).toBe(subA)
    expect(p.subscriptionItemsOneOffTotal).toBe(30)
    expect(p.subscriptionItemCount).toBe(1)
    expect(p.excludedFromSubscriptionCount).toBe(1)
  })

  it('skips slots whose product is not in the catalogue', () => {
    const blueprint = makeBlueprint([{ selectedProductId: 'missing-id' }])
    const p = calculatePricing(blueprint, [])
    expect(p.oneOffTotal).toBe(0)
    expect(p.subscriptionTotal).toBe(0)
  })
})

describe('qualifiesForSubscription', () => {
  it('is true for an eligible product that lasts about a month', () => {
    expect(qualifiesForSubscription({ subscriptionEligible: true, daysOfSupply: 30 })).toBe(true)
    expect(qualifiesForSubscription({ subscriptionEligible: true, daysOfSupply: 35 })).toBe(true)
  })

  it('is false for a product that lasts longer than a month', () => {
    expect(qualifiesForSubscription({ subscriptionEligible: true, daysOfSupply: 36 })).toBe(false)
    expect(qualifiesForSubscription({ subscriptionEligible: true, daysOfSupply: 90 })).toBe(false)
  })

  it('is false for an ineligible product regardless of supply', () => {
    expect(qualifiesForSubscription({ subscriptionEligible: false, daysOfSupply: 30 })).toBe(false)
  })
})

describe('getSubscriptionProduct', () => {
  it('returns the product itself when no mapping is set', () => {
    const self = makeProduct({ id: 'self' })
    expect(getSubscriptionProduct(self, [self]).id).toBe('self')
  })

  it('returns the mapped monthly product when set', () => {
    const parent = makeProduct({ id: 'parent', subscriptionProductId: 'monthly' })
    const monthly = makeProduct({ id: 'monthly', isSubscriptionOnly: true })
    expect(getSubscriptionProduct(parent, [parent, monthly]).id).toBe('monthly')
  })

  it('falls back to self when the mapped product is missing from the catalogue', () => {
    const parent = makeProduct({ id: 'parent', subscriptionProductId: 'gone' })
    expect(getSubscriptionProduct(parent, [parent]).id).toBe('parent')
  })
})

describe('buildSubscriptionPlan', () => {
  it('merges slots that share a subscription product into one line', () => {
    const a = makeProduct({ id: 'a', subscriptionProductId: 'shared', stackSlots: ['health'] })
    const b = makeProduct({ id: 'b', subscriptionProductId: 'shared', stackSlots: ['menopause'] })
    const shared = makeProduct({ id: 'shared', basePrice: 8, isSubscriptionOnly: true, variants: [{ id: 'sv', title: '', flavour: null, size: null, price: 8, compareAtPrice: null, available: true, shopifyVariantId: null }] })
    const blueprint = makeBlueprint([
      { selectedProductId: 'a', selectedVariantId: 'sv' },
      { selectedProductId: 'b', selectedVariantId: 'sv', slotType: 'menopause' } as never,
    ])
    const plan = buildSubscriptionPlan(blueprint, [a, b, shared])
    expect(plan).toHaveLength(1)
    expect(plan[0].product.id).toBe('shared')
    expect(plan[0].coversSlotIds).toHaveLength(2)
  })
})

describe('formatGBP', () => {
  it('formats whole numbers with 2 decimal places', () => {
    expect(formatGBP(30)).toBe('£30.00')
  })
  it('formats decimals correctly', () => {
    expect(formatGBP(12.5)).toBe('£12.50')
    expect(formatGBP(99.99)).toBe('£99.99')
  })
})

describe('formatSaving', () => {
  it('returns empty string when saving is 0', () => {
    expect(formatSaving(0, 0)).toBe('')
  })
  it('returns empty string when saving is negative', () => {
    expect(formatSaving(-1, 0)).toBe('')
  })
  it('formats positive saving with pct', () => {
    expect(formatSaving(10, 25)).toBe('Save £10.00 (25% off)')
  })
})
