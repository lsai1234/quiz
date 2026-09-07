import { BIG_NIGHT_BIG_MORNING, PREBUILT_BUNDLES, getBundleBySlug } from '..'
import { MOCK_CATALOGUE } from '@/lib/catalogue'
import { calculatePricing, getPricingConfig } from '@/lib/stack-blueprint/pricing'
import { validateCheckout, buildSubscriptionCheckout } from '@/lib/stack-blueprint/checkout'
import { assembleProductBundle, emptyProductBundleDraft } from '../assemble'
import { composeBundles, EMPTY_PERSISTED_BUNDLES, bundleWorkouts } from '../resolve'
import { isBundleSellable } from '../pricing'
import type { ProductBundle } from '../types'

/**
 * The weekend-reset package.
 *
 * It is a workout bundle: a session, a story and a photograph. Its products
 * come from whichever pre-built bundle it is pointed at in the Hub — the stack
 * that used to be written into this file is now a record of its own, shared by
 * every package that sells it. So the checkout and pricing tests here run
 * against the package RESOLVED against a stack, which is the only form a
 * customer ever meets.
 */
function weekendStack(): ProductBundle {
  const draft = emptyProductBundleDraft()
  draft.slug = 'weekend-reset'
  draft.name = 'Weekend Reset'
  draft.description = 'Electrolytes, creatine and protein.'
  draft.primaryGoal = 'recovery'
  draft.cores = [
    { productId: 'chrgd-electrolytes', title: 'Hydration', reason: 'Fluids first — the start of the morning reset.' },
    { productId: 'chrgd-creatine', title: 'Performance', reason: 'The daily training non-negotiable.' },
    { productId: 'chrgd-whey-protein', title: 'Protein', reason: 'Refuel after the session.' },
  ]
  return assembleProductBundle(draft, MOCK_CATALOGUE)
}

const stack = weekendStack()
const sold = composeBundles(
  [{ ...BIG_NIGHT_BIG_MORNING, productBundleSlug: stack.slug }],
  EMPTY_PERSISTED_BUNDLES,
  [stack],
)[0]

describe('Big Night, Big Morning bundle', () => {
  const bundle = BIG_NIGHT_BIG_MORNING

  it('is registered under its slug', () => {
    expect(getBundleBySlug('big-night-big-morning')).toBe(bundle)
    expect(PREBUILT_BUNDLES).toContain(bundle)
  })

  it('ships with a session and a story, and no products of its own', () => {
    expect(bundleWorkouts(bundle)[0].exercises.length).toBeGreaterThanOrEqual(4)
    expect(bundle.howToUse.length).toBeGreaterThan(0)
    expect(bundle).not.toHaveProperty('blueprint')
    expect(bundle.productBundleSlug).toBeNull()
  })

  it('cannot be sold until it points at a pre-built bundle', () => {
    const unlinked = composeBundles([bundle], EMPTY_PERSISTED_BUNDLES, [stack])[0]
    expect(isBundleSellable(unlinked, MOCK_CATALOGUE)).toBe(false)
  })

  it('sells the stack it points at, under its own name', () => {
    expect(sold.blueprint.slots.map((s) => s.selectedProductId)).toEqual([
      'chrgd-electrolytes', 'chrgd-creatine', 'chrgd-whey-protein',
    ])
    expect(sold.blueprint.stackName).toBe('Big Night, Big Morning')
    expect(isBundleSellable(sold, MOCK_CATALOGUE)).toBe(true)
  })

  it('core slots are fixed — no swapping or removing the curated stack', () => {
    for (const slot of sold.blueprint.slots) {
      expect(slot.required).toBe(true)
      expect(slot.canSwap).toBe(false)
      expect(slot.canRemove).toBe(false)
    }
  })

  it('prices as a one-off bundle with the tier discount applied', () => {
    const pricing = calculatePricing(sold.blueprint, MOCK_CATALOGUE)
    expect(pricing.oneOffTotal).toBeGreaterThan(0)
    expect(pricing.oneOffTotal).toBeLessThan(pricing.oneOffSubtotal)
    expect(pricing.bundleDiscountPct).toBeGreaterThan(0)
  })

  it('meets the minimum order for a monthly subscription', () => {
    const pricing = calculatePricing(sold.blueprint, MOCK_CATALOGUE)
    expect(pricing.subscriptionMinOrderMet).toBe(true)
    expect(pricing.subscriptionTotal).toBeGreaterThanOrEqual(getPricingConfig().minSubscriptionMonthly)
  })

  it('passes checkout validation for both plans (mock mode)', () => {
    const oneOff = validateCheckout(sold.blueprint, MOCK_CATALOGUE)
    expect(oneOff.ok).toBe(true)

    const sub = buildSubscriptionCheckout(sold.blueprint, MOCK_CATALOGUE, null)
    expect(sub.ok).toBe(true)
  })

  it('keeps the customer copy claim-safe (no cure/detox/prevention language)', () => {
    const copy = [
      bundle.description,
      bundle.honestyLine.replace(/^Not a hangover cure\./i, ''),
      ...bundleWorkouts(bundle).map((w) => `${w.intro} ${w.rule}`),
      ...bundle.howToUse.map((s) => `${s.title} ${s.detail}`),
    ].join(' ')
    for (const banned of [/cures?\b/i, /detox/i, /flush(es)? alcohol/i, /stops? you (being|feeling) hungover/i, /prevents? hangover/i]) {
      expect(copy).not.toMatch(banned)
    }
  })
})
