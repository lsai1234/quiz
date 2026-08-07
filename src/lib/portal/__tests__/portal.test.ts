import { setPricingOverrides, getPricingConfig, resetPricingOverrides, PRICING_CONFIG } from '@/lib/stack-blueprint/pricing'
import { setDataSourceOverride, getDataSourceMode } from '@/lib/data-source'
import {
  setProductOverride,
  clearProductOverride,
  applyProductOverrides,
  getProductOverrides,
  setDataSourceSetting,
  getDataSourceSetting,
} from '../store'
import { productReadiness } from '../readiness'
import type { CatalogueProduct } from '@/lib/catalogue/types'

const makeProduct = (o: Partial<CatalogueProduct> = {}): CatalogueProduct => ({
  id: 'p', title: 'P', handle: 'p', description: '', imageUrl: 'https://img/x.jpg', category: 'Protein',
  stackSlots: ['protein'], goals: ['muscle'], dietaryTags: [], formats: ['powder'],
  variants: [{ id: 'v', title: '', flavour: null, size: null, price: 30, compareAtPrice: null, available: true, sku: 'PB-1' }],
  basePrice: 30, compareAtPrice: null, cost: 10, weightGrams: 1150, subscriptionEligible: true, servings: 30,
  swapGroup: 'protein-whey', recommendationPriority: 8, marginPriority: 7, isCoreEligible: true,
  isBoosterEligible: false, hasStimulants: false, shortReason: 'x', warnings: [], ...o,
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
  it('merges overrides onto a catalogue', async () => {
    const base = [makeProduct({ id: 'a', cost: 10 })]
    await setProductOverride('a', { cost: 99 })
    expect(applyProductOverrides(base, await getProductOverrides())[0].cost).toBe(99)
    await clearProductOverride('a')
    expect(applyProductOverrides(base, await getProductOverrides())[0].cost).toBe(10)
  })
})

describe('data-source setting', () => {
  it('flips the resolved mode via the portal override', async () => {
    await setDataSourceSetting('real')
    expect(getDataSourceMode()).toBe('real')
    expect(await getDataSourceSetting()).toBe('real')
    await setDataSourceSetting('mock')
    expect(getDataSourceMode()).toBe('mock')
  })
})

describe('product readiness', () => {
  it('passes a fully-configured live product', () => {
    const r = productReadiness(makeProduct(), { live: true })
    expect(r.overall).toBe('ok')
  })

  it('flags a product with no supplier SKU and a missing cost', () => {
    const noSku = makeProduct({ cost: undefined })
    noSku.variants = noSku.variants.map((v) => ({ ...v, sku: null }))
    const r = productReadiness(noSku, { live: false })
    expect(r.checks.find((c) => c.id === 'identity')?.status).not.toBe('ok')
    expect(r.checks.find((c) => c.id === 'pricing')?.status).toBe('warn')
  })

  it('fails classification when untagged', () => {
    const r = productReadiness(makeProduct({ stackSlots: [], goals: [] }), { live: false })
    expect(r.checks.find((c) => c.id === 'classification')?.status).toBe('fail')
    expect(r.overall).toBe('fail')
  })

  it('blocks a live product with no shipping weight', () => {
    // PowerBody price delivery by weight band AND require a weight to place the
    // order, so going live without one is a hard stop, not a nag.
    const live = productReadiness(makeProduct({ weightGrams: null }), { live: true })
    expect(live.checks.find((c) => c.id === 'shipping')?.status).toBe('fail')
    expect(live.overall).toBe('fail')

    // On mock data it is only a warning — the margin is estimated, nothing ships.
    const mock = productReadiness(makeProduct({ weightGrams: null }), { live: false })
    expect(mock.checks.find((c) => c.id === 'shipping')?.status).toBe('warn')
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
