import { calculatePricing, formatGBP, formatSaving, qualifiesForSubscription, getSubscriptionProduct, buildSubscriptionPlan, workoutsPerMonth, resolveConsumption, resolveTier, discountWithFloor, unitCostOf, levelForStackPreference, levelSubscriptionRate, qualifiesForFreeDelivery, PRICING_CONFIG } from '../pricing'
import type { StackBlueprint } from '../types'
import type { CatalogueProduct } from '@/lib/catalogue/types'
import type { QuizAnswers } from '@/lib/types'

const answersWith = (trainingFrequency: QuizAnswers['trainingFrequency']) =>
  ({ trainingFrequency } as unknown as QuizAnswers)

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
  servings: 30,
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
  // These tests assert the 15% rate, which is the 'performance' bundle level.
  level: 'performance',
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
    // makeBlueprint is a 'performance' bundle, so the level rate applies.
    const expected = Math.round(30 * (1 - PRICING_CONFIG.levelSubscriptionDiscount.performance) * 100) / 100
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
      id: 'creatine', basePrice: 20, servings: 90, subscriptionProductId: 'creatine-monthly',
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
    expect(p.subscriptionTotal).toBe(Math.round(9 * 0.8 * 100) / 100)
    expect(p.subscriptionItemCount).toBe(1)
    expect(p.subscriptionSwappedCount).toBe(1)
    expect(p.excludedFromSubscriptionCount).toBe(0)
  })

  it('deduplicates when two slots resolve to the same subscription product', () => {
    const vitD = makeProduct({
      id: 'vit-d', basePrice: 13, servings: 60, subscriptionProductId: 'vit-d-monthly', stackSlots: ['health'],
      variants: [{ id: 'vdv', title: '', flavour: null, size: null, price: 13, compareAtPrice: null, available: true, shopifyVariantId: null }],
    })
    const bone = makeProduct({
      id: 'bone', basePrice: 18, servings: 45, subscriptionProductId: 'vit-d-monthly', stackSlots: ['menopause'],
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
    expect(p.subscriptionTotal).toBe(Math.round(8 * 0.8 * 100) / 100)
    expect(p.subscriptionSwappedCount).toBe(2)
  })

  it('sums correctly across multiple slots, excluding non-qualifying products from the subscription', () => {
    const prodA = makeProduct({ id: 'prod-a', basePrice: 30, subscriptionEligible: true, servings: 30, variants: [{ id: 'va', title: 'A', flavour: null, size: null, price: 30, compareAtPrice: 40, available: true, shopifyVariantId: null }] })
    const prodB = makeProduct({ id: 'prod-b', basePrice: 20, compareAtPrice: null, subscriptionEligible: false, variants: [{ id: 'vb', title: 'B', flavour: null, size: null, price: 20, compareAtPrice: null, available: true, shopifyVariantId: null }] })
    const blueprint = makeBlueprint([
      { selectedProductId: 'prod-a', selectedVariantId: 'va' },
      { selectedProductId: 'prod-b', selectedVariantId: 'vb', slotType: 'performance' } as never,
    ])
    const p = calculatePricing(blueprint, [prodA, prodB])
    // £50 subtotal qualifies for the £50+ bundle tier (10% off): 27 + 18 = 45.
    expect(p.oneOffTotal).toBe(45)
    expect(p.rrpTotal).toBe(60)   // 40 + 20 (no compare for B)
    expect(p.bundleSaving).toBe(15)
    // Only prodA qualifies for the monthly plan; prodB (ineligible) is excluded.
    const subA = Math.round(30 * 0.8 * 100) / 100
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
    expect(qualifiesForSubscription({ subscriptionEligible: true, servings: 30 })).toBe(true)
    expect(qualifiesForSubscription({ subscriptionEligible: true, servings: 35 })).toBe(true)
  })

  it('is false for a product that lasts longer than a month', () => {
    expect(qualifiesForSubscription({ subscriptionEligible: true, servings: 36 })).toBe(false)
    expect(qualifiesForSubscription({ subscriptionEligible: true, servings: 90 })).toBe(false)
  })

  it('is false for an ineligible product regardless of supply', () => {
    expect(qualifiesForSubscription({ subscriptionEligible: false, servings: 30 })).toBe(false)
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

describe('consumption protocol & monthly quantities', () => {
  it('maps training frequency to workouts per month', () => {
    expect(workoutsPerMonth(answersWith('1-2x'))).toBe(6)
    expect(workoutsPerMonth(answersWith('3-4x'))).toBe(15)
    expect(workoutsPerMonth(answersWith('daily'))).toBe(30)
    expect(workoutsPerMonth(null)).toBe(12)
  })

  it('derives cadence from the stack slot and doses from servings', () => {
    expect(resolveConsumption(makeProduct({ stackSlots: ['protein'], servings: 30 })))
      .toEqual({ cadence: 'daily', servingsPerUnit: 30 })
    expect(resolveConsumption(makeProduct({ stackSlots: ['energy'], servings: 30 })).cadence)
      .toBe('per-workout')
    expect(resolveConsumption(makeProduct({ stackSlots: ['hydration'], servings: 30 })).cadence)
      .toBe('per-workout')
  })

  it('uses an explicit consumption override when present', () => {
    const p = makeProduct({ stackSlots: ['protein'], consumption: { cadence: 'per-workout', servingsPerUnit: 20 } })
    expect(resolveConsumption(p)).toEqual({ cadence: 'per-workout', servingsPerUnit: 20 })
  })

  it('keeps a daily product at one unit per month', () => {
    const daily = makeProduct({ id: 'd', stackSlots: ['health'], servings: 30, basePrice: 20,
      variants: [{ id: 'dv', title: '', flavour: null, size: null, price: 20, compareAtPrice: null, available: true, shopifyVariantId: null }] })
    const bp = makeBlueprint([{ selectedProductId: 'd', selectedVariantId: 'dv', slotType: 'health' } as never])
    const [line] = buildSubscriptionPlan(bp, [daily], answersWith('1-2x'))
    expect(line.cadence).toBe('daily')
    expect(line.shipEveryMonths).toBe(1)
    expect(line.monthlyPrice).toBe(Math.round(20 * 0.8 * 100) / 100)
  })

  it('scales a per-workout product to training frequency', () => {
    const pre = makeProduct({ id: 'pre', stackSlots: ['energy'], servings: 30, basePrice: 30,
      variants: [{ id: 'pv', title: '', flavour: null, size: null, price: 30, compareAtPrice: null, available: true, shopifyVariantId: null }] })
    const bp = makeBlueprint([{ selectedProductId: 'pre', selectedVariantId: 'pv', slotType: 'energy' } as never])

    // 3-4×/week → 15 workouts/month, 30 doses → a tub lasts ~2 months
    const [light] = buildSubscriptionPlan(bp, [pre], answersWith('3-4x'))
    expect(light.cadence).toBe('per-workout')
    expect(light.occasionsPerMonth).toBe(15)
    expect(light.shipEveryMonths).toBe(2)
    expect(light.monthlyPrice).toBe(Math.round((30 / 2) * 0.8 * 100) / 100)

    // Daily training → 30/month → ships every month at full quantity
    const [heavy] = buildSubscriptionPlan(bp, [pre], answersWith('daily'))
    expect(heavy.shipEveryMonths).toBe(1)
    expect(heavy.monthlyPrice).toBe(Math.round(30 * 0.8 * 100) / 100)

    // The quantity flows through to the headline subscription total
    expect(calculatePricing(bp, [pre], answersWith('3-4x')).subscriptionTotal).toBe(light.monthlyPrice)
  })

  it('keeps a long-lasting daily product as itself and ships it every few months', () => {
    const creatine = makeProduct({ id: 'cr', stackSlots: ['performance'], servings: 100, basePrice: 19.99,
      variants: [{ id: 'cv', title: '', flavour: null, size: null, price: 19.99, compareAtPrice: null, available: true, shopifyVariantId: null }] })
    const bp = makeBlueprint([{ selectedProductId: 'cr', selectedVariantId: 'cv', slotType: 'performance' } as never])
    const [line] = buildSubscriptionPlan(bp, [creatine], answersWith('3-4x'))
    expect(line.product.id).toBe('cr')        // not swapped to a refill
    expect(line.cadence).toBe('daily')
    expect(line.shipEveryMonths).toBe(3)      // 100 servings ÷ 30/mo ≈ 3.3 → 3
    expect(line.unitsPerShipment).toBe(1)
    expect(line.pricePerDelivery).toBe(Math.round(19.99 * 0.8 * 100) / 100)         // per delivery
    expect(line.monthlyPrice).toBe(Math.round((19.99 / 3) * 0.8 * 100) / 100)       // / mo
    // The monthly figure and the per-delivery figure stay consistent.
    expect(Math.abs(line.monthlyPrice - line.pricePerDelivery / line.shipEveryMonths)).toBeLessThan(0.01)
  })

  it('caps the delivery interval at maxDeliveryMonths', () => {
    const longLife = makeProduct({ id: 'x', stackSlots: ['health'], servings: 300, basePrice: 30,
      variants: [{ id: 'xv', title: '', flavour: null, size: null, price: 30, compareAtPrice: null, available: true, shopifyVariantId: null }] })
    const bp = makeBlueprint([{ selectedProductId: 'x', selectedVariantId: 'xv', slotType: 'health' } as never])
    const [line] = buildSubscriptionPlan(bp, [longLife])
    expect(line.shipEveryMonths).toBe(PRICING_CONFIG.maxDeliveryMonths)  // 300/30 = 10 → capped to 6
  })

  it('reports the minimum subscription term from config and product overrides', () => {
    const a = makeProduct({ id: 'a', stackSlots: ['protein'] })
    const b = makeProduct({ id: 'b', stackSlots: ['health'], minSubscriptionMonths: 6 })
    const bp = makeBlueprint([
      { selectedProductId: 'a' },
      { selectedProductId: 'b', slotType: 'health' } as never,
    ])
    // Config floor is 4; a product can only raise it.
    expect(calculatePricing(bp, [a, b]).subscriptionMinMonths).toBe(6)
    expect(calculatePricing(makeBlueprint([{ selectedProductId: 'a' }]), [a]).subscriptionMinMonths).toBe(PRICING_CONFIG.minSubscriptionMonths)
  })

  it('applies the first-month intro discount and reports the commitment total', () => {
    const a = makeProduct({ id: 'prod-a', stackSlots: ['protein'], servings: 30 })
    const bp = makeBlueprint([{ selectedProductId: 'prod-a', selectedVariantId: 'v1' }])
    const p = calculatePricing(bp, [a])
    const monthly = Math.round(30 * 0.8 * 100) / 100   // daily, 1/month
    expect(p.subscriptionTotal).toBe(monthly)
    expect(p.subscriptionIntroDiscountPct).toBe(Math.round(PRICING_CONFIG.introOffer.firstMonthDiscount * 100))
    expect(p.subscriptionFirstMonth).toBe(Math.round(monthly * (1 - PRICING_CONFIG.introOffer.firstMonthDiscount) * 100) / 100)
    // Commitment = discounted first month + the remaining months at the flat rate.
    const expectedTerm = Math.round((p.subscriptionFirstMonth + (p.subscriptionMinMonths - 1) * monthly) * 100) / 100
    expect(p.subscriptionMinTermTotal).toBe(expectedTerm)
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

// ─── Pricing rules: tiers, margin floor, profit guardrails ────────────────────

const round2 = (n: number) => Math.round(n * 100) / 100
const oneVariant = (price: number) => [{ id: 'v', title: '', flavour: null, size: null, price, compareAtPrice: null, available: true, shopifyVariantId: null }]

describe('pricing rules — discount tiers', () => {
  it('resolveTier picks the highest qualifying tier', () => {
    const tiers = [
      { id: 'a', label: 'A', minSubtotal: 50, discountPct: 0.05 },
      { id: 'b', label: 'B', minSubtotal: 100, discountPct: 0.1 },
    ]
    expect(resolveTier(tiers, 40, 1).pct).toBe(0)
    expect(resolveTier(tiers, 60, 1).pct).toBe(0.05)
    expect(resolveTier(tiers, 120, 1).tier?.id).toBe('b')
  })

  it('applies the one-off bundle tier to a qualifying stack', () => {
    const a = makeProduct({ id: 'a', basePrice: 70, compareAtPrice: null, variants: oneVariant(70) })
    const b = makeProduct({ id: 'b', basePrice: 70, compareAtPrice: null, variants: [{ id: 'v2', title: '', flavour: null, size: null, price: 70, compareAtPrice: null, available: true, shopifyVariantId: null }] })
    const bp = makeBlueprint([
      { selectedProductId: 'a', selectedVariantId: 'v' },
      { selectedProductId: 'b', selectedVariantId: 'v2', slotType: 'performance' } as never,
    ])
    const p = calculatePricing(bp, [a, b]) // subtotal 140 → £120+ tier (20%)
    expect(p.bundleDiscountPct).toBe(20)
    expect(p.bundleTierLabel).toBe('£120+ bundle')
    expect(p.oneOffTotal).toBe(round2(140 * 0.8))
    // The pre-discount selling subtotal drives the customer-facing saving line.
    expect(p.oneOffSubtotal).toBe(140)
    expect(round2(p.oneOffSubtotal - p.oneOffTotal)).toBe(round2(140 * 0.2))
  })

  it('gives no bundle discount below the first tier threshold', () => {
    const a = makeProduct({ id: 'a', basePrice: 30, compareAtPrice: null, variants: oneVariant(30) })
    const p = calculatePricing(makeBlueprint([{ selectedProductId: 'a', selectedVariantId: 'v' }]), [a])
    expect(p.bundleDiscountPct).toBe(0)
    expect(p.oneOffTotal).toBe(30)
  })
})

describe('bundle save-rate consistency (budget step ↔ final screen)', () => {
  it('maps each stack preference to the right bundle tier', () => {
    expect(levelForStackPreference('simple')).toBe('essentials')
    expect(levelForStackPreference('balanced')).toBe('performance')
    expect(levelForStackPreference('complete')).toBe('complete')
    expect(levelForStackPreference(null)).toBe('performance')
  })

  it('the save % the budget card advertises equals the rate the final screen applies', () => {
    // The budget card shows levelSubscriptionRate(levelForStackPreference(pref)).
    // The final screen prices the chosen stack at that same level. For every
    // preference the two must produce an identical headline percentage.
    for (const pref of ['simple', 'balanced', 'complete'] as const) {
      const level = levelForStackPreference(pref)
      const advertised = Math.round(levelSubscriptionRate(level) * 1000) / 10
      const product = makeProduct({ id: 'a', basePrice: 40, variants: oneVariant(40) })
      const bp = makeBlueprint([{ selectedProductId: 'a', selectedVariantId: 'v' }])
      const pricing = calculatePricing(bp, [product], null, undefined, { level })
      expect(pricing.subscriptionDiscountPct).toBe(advertised)
    }
  })

  it('advertises the expected default rates: 15 / 20 / 25', () => {
    expect(Math.round(levelSubscriptionRate(levelForStackPreference('simple')) * 100)).toBe(15)
    expect(Math.round(levelSubscriptionRate(levelForStackPreference('balanced')) * 100)).toBe(20)
    expect(Math.round(levelSubscriptionRate(levelForStackPreference('complete')) * 100)).toBe(25)
  })
})

describe('free delivery threshold', () => {
  it('qualifies at or above the threshold, not below', () => {
    const t = PRICING_CONFIG.freeDeliveryThreshold
    expect(qualifiesForFreeDelivery(t)).toBe(true)
    expect(qualifiesForFreeDelivery(t + 5)).toBe(true)
    expect(qualifiesForFreeDelivery(t - 0.01)).toBe(false)
  })

  it('is disabled when the threshold is 0', () => {
    expect(qualifiesForFreeDelivery(100, { ...PRICING_CONFIG, freeDeliveryThreshold: 0 })).toBe(false)
  })
})

describe('pricing rules — margin floor & cost', () => {
  it('estimates unit cost from price when not set', () => {
    expect(unitCostOf({ cost: undefined, basePrice: 100 }, 100)).toBe(round2(100 * PRICING_CONFIG.defaultCostRatio))
    expect(unitCostOf({ cost: 12, basePrice: 100 }, 100)).toBe(12)
  })

  it('never discounts below the margin floor, never above list price', () => {
    expect(discountWithFloor(100, 0.15, 35)).toBe(85)        // floor 40.25 doesn't bind
    expect(discountWithFloor(20, 0.5, 18)).toBe(20)          // floor 20.7 capped to list price → no discount
    expect(discountWithFloor(20, 0.15, 15)).toBe(20 * 0.85 < 15 * 1.15 ? 17.25 : 17)
  })
})

describe('pricing rules — subscription profit guardrails', () => {
  it('reports monthly margin and is profitable on cancel under the default config', () => {
    const a = makeProduct({ id: 'a', stackSlots: ['protein'], servings: 30, basePrice: 40, cost: 10, compareAtPrice: null, variants: oneVariant(40) })
    const p = calculatePricing(makeBlueprint([{ selectedProductId: 'a', selectedVariantId: 'v' }]), [a])
    expect(p.subscriptionMonthlyMargin).toBe(round2(40 * 0.8 - 10))  // 32 - 10 = 22
    expect(p.subscriptionProfitableOnCancel).toBe(true)
    expect(p.subscriptionCommittedMargin).toBe(round2(p.subscriptionMinTermTotal - 4 * 10)) // monthly delivery → 4 deliveries
  })

  it('flags a config that loses money if cancelled early', () => {
    const a = makeProduct({ id: 'a', stackSlots: ['protein'], servings: 30, basePrice: 20, cost: 18, compareAtPrice: null, variants: oneVariant(20) })
    const badConfig = { ...PRICING_CONFIG, marginFloorPct: 0, minSubscriptionMonths: 1, introOffer: { firstMonthDiscount: 0.9 } }
    const p = calculatePricing(makeBlueprint([{ selectedProductId: 'a', selectedVariantId: 'v' }]), [a], null, badConfig)
    expect(p.subscriptionProfitableOnCancel).toBe(false)
  })

  it('gates subscription on the minimum monthly order value', () => {
    const cheap = makeProduct({ id: 'a', stackSlots: ['protein'], servings: 30, basePrice: 10, compareAtPrice: null, variants: oneVariant(10) })
    expect(calculatePricing(makeBlueprint([{ selectedProductId: 'a', selectedVariantId: 'v' }]), [cheap]).subscriptionMinOrderMet).toBe(false)
  })
})
