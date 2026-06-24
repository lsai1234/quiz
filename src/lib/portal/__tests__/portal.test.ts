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

import { heuristicClassify, gapPatch } from '../ai-classify'

describe('AI auto-sort (heuristic fallback)', () => {
  it('classifies a product from its title/description', () => {
    const p = makeProduct({ id: 'x', title: 'CHRGD Creatine Monohydrate', description: '5g micronised creatine', stackSlots: [], goals: [], swapGroup: 'general' as any, cost: undefined })
    const s = heuristicClassify(p)
    expect(s.stackSlots).toContain('performance')
    expect(s.swapGroup).toBe('creatine')
    expect(s.recommendationBasis).toBe('objective')
    expect(s.cost).toBeGreaterThan(0)
  })

  it('marks pre-workout as per-workout + subjective', () => {
    const s = heuristicClassify(makeProduct({ title: 'CHRGD Pre-Workout', description: 'caffeine and beta-alanine', stackSlots: [], goals: [] }))
    expect(s.consumption?.cadence).toBe('per-workout')
    expect(s.recommendationBasis).toBe('subjective')
  })

  it('gapPatch only fills missing fields', () => {
    const p = makeProduct({ stackSlots: [], goals: ['muscle'], swapGroup: 'protein-whey' as any, cost: 12 })
    const patch = gapPatch(p, { stackSlots: ['protein'], goals: ['recovery'], swapGroup: 'creatine' as any, cost: 99 })
    expect(patch.stackSlots).toEqual(['protein']) // was empty → filled
    expect(patch.goals).toBeUndefined()            // already set → untouched
    expect(patch.swapGroup).toBeUndefined()        // already set → untouched
    expect(patch.cost).toBeUndefined()             // already set → untouched
  })
})

import { catalogueCoverage } from '../coverage'

describe('catalogue coverage', () => {
  it('flags a goal with no products as a gap, one as thin, two as covered', () => {
    const cat = [
      makeProduct({ id: 'a', goals: ['muscle'] }),
      makeProduct({ id: 'b', goals: ['muscle'] }),
      makeProduct({ id: 'c', goals: ['menopause'], stackSlots: ['menopause'] }),
    ]
    const cov = catalogueCoverage(cat)
    expect(cov.goals.find((g) => g.key === 'goal:muscle')!.status).toBe('ok')        // 2 products
    expect(cov.goals.find((g) => g.key === 'goal:menopause')!.status).toBe('warn')   // 1 product
    expect(cov.goals.find((g) => g.key === 'goal:focus')!.status).toBe('fail')       // 0 products
    expect(cov.gaps).toBeGreaterThan(0)
  })

  it('warns when a covered area has no subscription option', () => {
    const cat = [
      makeProduct({ id: 'a', goals: ['immune'], subscriptionEligible: false }),
      makeProduct({ id: 'b', goals: ['immune'], subscriptionEligible: false }),
    ]
    const immune = catalogueCoverage(cat).goals.find((g) => g.key === 'goal:immune')!
    expect(immune.status).toBe('warn')
    expect(immune.subscriptionCount).toBe(0)
  })

  it('ignores subscription-only refills', () => {
    const cat = [makeProduct({ id: 'r', goals: ['muscle'], isSubscriptionOnly: true })]
    expect(catalogueCoverage(cat).goals.find((g) => g.key === 'goal:muscle')!.productCount).toBe(0)
  })
})
