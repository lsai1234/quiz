import { setPricingOverrides, getPricingConfig, resetPricingOverrides, PRICING_CONFIG } from '@/lib/stack-blueprint/pricing'
import { setDataSourceOverride, getDataSourceMode } from '@/lib/data-source'
import {
  setProductOverride,
  clearProductOverride,
  applyProductOverrides,
  setDataSourceSetting,
  getDataSourceSetting,
} from '../store'
import { productReadiness } from '../readiness'
import type { CatalogueProduct } from '@/lib/catalogue/types'

const makeProduct = (o: Partial<CatalogueProduct> = {}): CatalogueProduct => ({
  id: 'p', title: 'P', handle: 'p', description: '', imageUrl: 'https://img/x.jpg', category: 'Protein',
  stackSlots: ['protein'], goals: ['muscle'], dietaryTags: [], formats: ['powder'],
  variants: [{ id: 'v', title: '', flavour: null, size: null, price: 30, compareAtPrice: null, available: true, shopifyVariantId: 'gid://shopify/ProductVariant/1', sellingPlanId: 'gid://shopify/SellingPlan/1' }],
  basePrice: 30, compareAtPrice: null, cost: 10, subscriptionEligible: true, daysOfSupply: 30,
  swapGroup: 'protein-whey', recommendationPriority: 8, marginPriority: 7, isCoreEligible: true,
  isBoosterEligible: false, hasStimulants: false, shortReason: 'x', warnings: [],
  shopifyProductId: 'gid://shopify/Product/1', ...o,
})

afterEach(() => {
  resetPricingOverrides()
  setDataSourceOverride(null)
})

describe('pricing config overrides', () => {
  it('getPricingConfig reflects overrides and resets to defaults', () => {
    expect(getPricingConfig().subscriptionDiscount).toBe(PRICING_CONFIG.subscriptionDiscount)
    setPricingOverrides({ subscriptionDiscount: 0.25 })
    expect(getPricingConfig().subscriptionDiscount).toBe(0.25)
    // unchanged keys keep their defaults
    expect(getPricingConfig().minSubscriptionMonths).toBe(PRICING_CONFIG.minSubscriptionMonths)
    resetPricingOverrides()
    expect(getPricingConfig().subscriptionDiscount).toBe(PRICING_CONFIG.subscriptionDiscount)
  })

  it('merges nested introOffer', () => {
    setPricingOverrides({ introOffer: { firstMonthDiscount: 0.3 } })
    expect(getPricingConfig().introOffer.firstMonthDiscount).toBe(0.3)
  })
})

describe('product overrides store', () => {
  it('merges overrides onto a catalogue', () => {
    const base = [makeProduct({ id: 'a', cost: 10 })]
    setProductOverride('a', { cost: 99 })
    expect(applyProductOverrides(base)[0].cost).toBe(99)
    clearProductOverride('a')
    expect(applyProductOverrides(base)[0].cost).toBe(10)
  })
})

describe('data-source setting', () => {
  it('flips the resolved mode via the portal override', () => {
    setDataSourceSetting('shopify')
    expect(getDataSourceMode()).toBe('shopify')
    expect(getDataSourceSetting()).toBe('shopify')
    setDataSourceSetting('mock')
    expect(getDataSourceMode()).toBe('mock')
  })
})

describe('product readiness', () => {
  it('passes a fully-configured live product', () => {
    const r = productReadiness(makeProduct(), { live: true })
    expect(r.overall).toBe('ok')
  })

  it('flags a mock product (no Shopify id) and a missing cost', () => {
    const r = productReadiness(makeProduct({ shopifyProductId: null, cost: undefined }), { live: false })
    expect(r.checks.find((c) => c.id === 'identity')?.status).not.toBe('ok')
    expect(r.checks.find((c) => c.id === 'pricing')?.status).toBe('warn')
  })

  it('fails classification when untagged', () => {
    const r = productReadiness(makeProduct({ stackSlots: [], goals: [] }), { live: false })
    expect(r.checks.find((c) => c.id === 'classification')?.status).toBe('fail')
    expect(r.overall).toBe('fail')
  })
})
