import { PRICING_CONFIG } from '../pricing'
import { validateCheckout, validationErrorMessage, buildSubscriptionCheckout } from '../checkout'
import type { StackBlueprint } from '../types'
import type { CatalogueProduct } from '@/lib/catalogue/types'

// ─── Fixtures ─────────────────────────────────────────────────────────────────

/** £30/month less the performance subscribe-&-save rate, read from config. */
const MONTHLY = Math.round(30 * (1 - PRICING_CONFIG.levelSubscriptionDiscount.performance) * 100) / 100

const makeVariant = (overrides: Partial<CatalogueProduct['variants'][number]> = {}): CatalogueProduct['variants'][number] => ({
  id: 'var-1',
  title: 'Chocolate / 500g',
  flavour: 'Chocolate',
  size: '500g',
  price: 30,
  compareAtPrice: 40,
  available: true,
  ...overrides,
})

const makeProduct = (overrides: Partial<CatalogueProduct> = {}): CatalogueProduct => ({
  id: 'prod-a',
  title: 'Whey Protein',
  handle: 'whey-protein',
  description: 'Good protein',
  imageUrl: null,
  category: 'Protein',
  stackSlots: ['protein'],
  goals: ['muscle'],
  dietaryTags: [],
  formats: ['powder'],
  variants: [makeVariant()],
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
  ...overrides,
})

const makeBlueprint = (
  slots: Partial<StackBlueprint['slots'][number]>[] = [],
): StackBlueprint => ({
  id: 'bp-1',
  stackName: 'Test Stack',
  summary: 'A test',
  primaryGoal: 'muscle',
  secondaryGoals: [],
  userProfileSummary: '',
  slots: slots.map((s, i) => ({
    slotId: `slot-${i}`,
    slotType: 'protein',
    title: 'Protein',
    description: '',
    recommendedProductId: 'prod-a',
    selectedProductId: 'prod-a',
    selectedVariantId: null,
    required: true,
    canRemove: false,
    canSwap: true,
    swapGroup: 'protein-whey',
    reason: 'Good choice',
    confidenceScore: 80,
    displayOrder: i,
    ...s,
  })),
  estimatedOneOffPrice: 0,
  estimatedSubscriptionPrice: 0,
  savingsSummary: '',
  createdAt: new Date().toISOString(),
  // Asserts the 15% rate → the 'performance' bundle level.
  level: 'performance',
})

// ─── validateCheckout ─────────────────────────────────────────────────────────

describe('validateCheckout', () => {
  it('returns ok with correct line items for a valid blueprint', () => {
    const product = makeProduct()
    const blueprint = makeBlueprint([{ selectedProductId: 'prod-a', selectedVariantId: 'var-1' }])
    const result = validateCheckout(blueprint, [product])
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.lines).toHaveLength(1)
    expect(result.lines[0].variantId).toBe('var-1')
    expect(result.lines[0].quantity).toBe(1)
    expect(result.lines[0].attributes).toEqual(
      expect.arrayContaining([
        { key: 'source', value: 'quiz-stack-builder' },
        { key: 'stackName', value: 'Test Stack' },
        { key: 'slotType', value: 'protein' },
      ]),
    )
  })

  it('falls back to first available variant when selectedVariantId is null', () => {
    const product = makeProduct({
      variants: [makeVariant({ id: 'v-first', available: true })],
    })
    const blueprint = makeBlueprint([{ selectedProductId: 'prod-a', selectedVariantId: null }])
    const result = validateCheckout(blueprint, [product])
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.lines[0].variantId).toBe('v-first')
  })

  it('returns unavailable error when the selected variant is sold out', () => {
    const product = makeProduct({
      variants: [makeVariant({ available: false })],
    })
    const blueprint = makeBlueprint([{ selectedProductId: 'prod-a', selectedVariantId: 'var-1' }])
    const result = validateCheckout(blueprint, [product])
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors[0].type).toBe('unavailable')
  })

  it('uses the catalogue variant id on the line', () => {
    const product = makeProduct({
      variants: [makeVariant({ })],
    })
    const blueprint = makeBlueprint([{ selectedProductId: 'prod-a', selectedVariantId: 'var-1' }])
    const result = validateCheckout(blueprint, [product])
    expect(result.ok).toBe(true)
    if (!result.ok) return
    // variantId should fall back to internal variant id
    expect(result.lines[0].variantId).toBe('var-1')
  })

  it('skips slots whose product is missing from the catalogue', () => {
    const blueprint = makeBlueprint([{ selectedProductId: 'not-in-catalogue' }])
    const result = validateCheckout(blueprint, [])
    // no errors, just 0 lines (product not in catalogue is silently skipped)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.lines).toHaveLength(0)
  })

  it('returns multiple errors for multiple invalid slots', () => {
    const prodA = makeProduct({ id: 'prod-a', variants: [makeVariant({ available: false })] })
    const prodB = makeProduct({ id: 'prod-b', variants: [makeVariant({ id: 'v2', available: false })] })
    const blueprint = makeBlueprint([
      { selectedProductId: 'prod-a', selectedVariantId: 'var-1' },
      { selectedProductId: 'prod-b', selectedVariantId: 'v2' },
    ])
    const result = validateCheckout(blueprint, [prodA, prodB])
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors).toHaveLength(2)
  })
})

// ─── validationErrorMessage ───────────────────────────────────────────────────

describe('validationErrorMessage', () => {
  it('returns user-friendly message for no-variant', () => {
    const msg = validationErrorMessage({ type: 'no-variant', slotId: 's1', slotTitle: 'Protein' })
    expect(msg).toMatch(/flavour or size/)
    expect(msg).toMatch(/Protein/)
  })
  it('returns user-friendly message for unavailable', () => {
    const msg = validationErrorMessage({ type: 'unavailable', slotId: 's1', slotTitle: 'Protein', variantTitle: 'Chocolate' })
    expect(msg).toMatch(/out of stock/)
    expect(msg).toMatch(/Chocolate/)
  })
})

// ─── buildSubscriptionCheckout ────────────────────────────────────────────────

describe('buildSubscriptionCheckout', () => {
  it('builds recurring lines and the flat/intro/commitment figures', () => {
    const product = makeProduct() // protein, daily, 30 servings, variant has a GID
    const blueprint = makeBlueprint([{ selectedProductId: 'prod-a', selectedVariantId: 'var-1' }])
    const result = buildSubscriptionCheckout(blueprint, [product])
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const { lines, flatMonthly, firstMonth, introDiscountPct, minMonths, minTermTotal } = result.checkout
    expect(lines).toHaveLength(1)
    expect(lines[0].variantId).toBe('var-1')
    expect(lines[0].quantity).toBe(1)                 // daily → 1 unit / month
    expect(lines[0].deliveryIntervalMonths).toBe(1)
    // Read the rate from config — the ladder is a commercial lever that gets
    // tuned, and hard-coding it makes every tuning decision a test failure.
    expect(lines[0].pricePerDelivery).toBe(
      Math.round(30 * (1 - PRICING_CONFIG.levelSubscriptionDiscount.performance) * 100) / 100,
    )
    expect(lines[0].attributes).toEqual(
      expect.arrayContaining([{ key: 'plan', value: 'subscription' }]),
    )
    expect(flatMonthly).toBe(MONTHLY)
    // Scratch-to-reveal: no intro discount is applied until the member reveals one.
    expect(introDiscountPct).toBe(0)
    expect(firstMonth).toBe(MONTHLY)
    // No minimum commitment — cancel any time.
    expect(minMonths).toBe(1)
    expect(minTermTotal).toBe(firstMonth)
  })

  it('applies a revealed scratch discount to the first month', () => {
    const product = makeProduct()
    const blueprint = makeBlueprint([{ selectedProductId: 'prod-a', selectedVariantId: 'var-1' }])
    // The middle scratch outcome, read from config rather than typed in.
    const CARD = [...PRICING_CONFIG.introOffer.scratchReveal.outcomes]
      .sort((a, b) => b.discount - a.discount)[1].discount
    const result = buildSubscriptionCheckout(blueprint, [product], null, { introDiscountOverride: CARD })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const { flatMonthly, firstMonth, introDiscountPct } = result.checkout
    expect(flatMonthly).toBe(MONTHLY)
    expect(introDiscountPct).toBe(Math.round(CARD * 100))
    expect(firstMonth).toBe(Math.round(MONTHLY * (1 - CARD) * 100) / 100)
  })

  it('ignores an invalid (non-outcome) revealed discount', () => {
    const product = makeProduct()
    const blueprint = makeBlueprint([{ selectedProductId: 'prod-a', selectedVariantId: 'var-1' }])
    const result = buildSubscriptionCheckout(blueprint, [product], null, { introDiscountOverride: 0.9 })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    // 0.9 isn't one of the configured scratch outcomes → treated as no discount.
    expect(result.checkout.introDiscountPct).toBe(0)
    expect(result.checkout.firstMonth).toBe(MONTHLY)
  })

  it('builds a subscription line from the catalogue variant id', () => {
    const product = makeProduct({ variants: [makeVariant({ })] })
    const blueprint = makeBlueprint([{ selectedProductId: 'prod-a', selectedVariantId: 'var-1' }])
    const result = buildSubscriptionCheckout(blueprint, [product], null)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.checkout.lines[0].variantId).toBe('var-1')
  })
})
