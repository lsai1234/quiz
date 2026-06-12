import { calculatePricing, formatGBP, formatSaving, PRICING_CONFIG } from '../pricing'
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

  it('does not apply subscription discount to ineligible products', () => {
    const product = makeProduct({ subscriptionEligible: false })
    const blueprint = makeBlueprint([{ selectedProductId: 'prod-a', selectedVariantId: 'v1' }])
    const p = calculatePricing(blueprint, [product])
    expect(p.subscriptionTotal).toBe(p.oneOffTotal)
    expect(p.subscriptionSaving).toBe(0)
  })

  it('sums correctly across multiple slots', () => {
    const prodA = makeProduct({ id: 'prod-a', basePrice: 30, subscriptionEligible: true, variants: [{ id: 'va', title: 'A', flavour: null, size: null, price: 30, compareAtPrice: 40, available: true, shopifyVariantId: null }] })
    const prodB = makeProduct({ id: 'prod-b', basePrice: 20, compareAtPrice: null, subscriptionEligible: false, variants: [{ id: 'vb', title: 'B', flavour: null, size: null, price: 20, compareAtPrice: null, available: true, shopifyVariantId: null }] })
    const blueprint = makeBlueprint([
      { selectedProductId: 'prod-a', selectedVariantId: 'va' },
      { selectedProductId: 'prod-b', selectedVariantId: 'vb', slotType: 'performance' } as never,
    ])
    const p = calculatePricing(blueprint, [prodA, prodB])
    expect(p.oneOffTotal).toBe(50)
    expect(p.rrpTotal).toBe(60)   // 40 + 20 (no compare for B)
    expect(p.bundleSaving).toBe(10)
    const subA = Math.round(30 * 0.85 * 100) / 100
    expect(p.subscriptionTotal).toBe(Math.round((subA + 20) * 100) / 100)
  })

  it('skips slots whose product is not in the catalogue', () => {
    const blueprint = makeBlueprint([{ selectedProductId: 'missing-id' }])
    const p = calculatePricing(blueprint, [])
    expect(p.oneOffTotal).toBe(0)
    expect(p.subscriptionTotal).toBe(0)
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
