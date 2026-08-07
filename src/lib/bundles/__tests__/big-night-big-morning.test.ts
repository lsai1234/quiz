import { BIG_NIGHT_BIG_MORNING, PREBUILT_BUNDLES, getBundleBySlug } from '..'
import { MOCK_CATALOGUE } from '@/lib/catalogue'
import { calculatePricing, getPricingConfig } from '@/lib/stack-blueprint/pricing'
import { validateCheckout, buildSubscriptionCheckout } from '@/lib/stack-blueprint/checkout'

describe('Big Night, Big Morning bundle', () => {
  const bundle = BIG_NIGHT_BIG_MORNING

  it('is registered under its slug', () => {
    expect(getBundleBySlug('big-night-big-morning')).toBe(bundle)
    expect(PREBUILT_BUNDLES).toContain(bundle)
  })

  it('every core slot resolves to a real catalogue product', () => {
    for (const slot of bundle.blueprint.slots) {
      const product = MOCK_CATALOGUE.find((p) => p.id === slot.selectedProductId)
      expect(product).toBeDefined()
      expect(product!.swapGroup).toBe(slot.swapGroup)
    }
  })

  it('contains the MVP stack: electrolytes, creatine, protein', () => {
    const ids = bundle.blueprint.slots.map((s) => s.selectedProductId)
    expect(ids).toEqual(['chrgd-electrolytes', 'chrgd-creatine', 'chrgd-whey-protein'])
  })

  it('core slots are fixed — no swapping or removing the curated stack', () => {
    for (const slot of bundle.blueprint.slots) {
      expect(slot.required).toBe(true)
      expect(slot.canSwap).toBe(false)
      expect(slot.canRemove).toBe(false)
    }
  })

  it('every add-on resolves to a real catalogue product with a unique slot id', () => {
    const coreIds = new Set(bundle.blueprint.slots.map((s) => s.slotId))
    for (const addOn of bundle.addOns) {
      expect(MOCK_CATALOGUE.find((p) => p.id === addOn.productId)).toBeDefined()
      expect(coreIds.has(addOn.slotId)).toBe(false)
    }
  })

  it('prices as a one-off bundle with the tier discount applied', () => {
    const pricing = calculatePricing(bundle.blueprint, MOCK_CATALOGUE)
    expect(pricing.oneOffTotal).toBeGreaterThan(0)
    expect(pricing.oneOffTotal).toBeLessThan(pricing.oneOffSubtotal)
    expect(pricing.bundleDiscountPct).toBeGreaterThan(0)
  })

  it('meets the minimum order for a monthly subscription', () => {
    const pricing = calculatePricing(bundle.blueprint, MOCK_CATALOGUE)
    expect(pricing.subscriptionMinOrderMet).toBe(true)
    expect(pricing.subscriptionTotal).toBeGreaterThanOrEqual(getPricingConfig().minSubscriptionMonthly)
  })

  it('passes checkout validation for both plans (mock mode)', () => {
    const oneOff = validateCheckout(bundle.blueprint, MOCK_CATALOGUE)
    expect(oneOff.ok).toBe(true)

    const sub = buildSubscriptionCheckout(bundle.blueprint, MOCK_CATALOGUE, null)
    expect(sub.ok).toBe(true)
  })

  it('keeps the customer copy claim-safe (no cure/detox/prevention language)', () => {
    const copy = [
      bundle.description,
      bundle.honestyLine.replace(/^Not a hangover cure\./i, ''),
      bundle.blueprint.summary,
      ...bundle.blueprint.slots.map((s) => s.reason),
      ...bundle.addOns.map((a) => a.reason),
      ...bundle.howToUse.map((s) => `${s.title} ${s.detail}`),
    ].join(' ')
    for (const banned of [/cures?\b/i, /detox/i, /flush(es)? alcohol/i, /stops? you (being|feeling) hungover/i, /prevents? hangover/i]) {
      expect(copy).not.toMatch(banned)
    }
  })
})
