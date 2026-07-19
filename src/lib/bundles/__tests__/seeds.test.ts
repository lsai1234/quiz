import { SEED_BUNDLES } from '../seeds'
import { MOCK_CATALOGUE } from '@/lib/catalogue'
import { calculatePricing, getPricingConfig } from '@/lib/stack-blueprint/pricing'
import { validateCheckout, buildSubscriptionCheckout } from '@/lib/stack-blueprint/checkout'
import { bundleReadiness } from '../readiness'
import { isBundleSellable } from '../pricing'

// Customer-facing copy must never make an unauthorised health claim. This is a
// blunt guard, not legal review — it catches the obvious offenders across every
// shipped bundle so a new seed can't quietly introduce one.
const BANNED = [
  /cures?\b/i,
  /\bdetox/i,
  /\btreats?\b/i,
  /\bheals?\b/i,
  /prevents?\b/i,
  /\bburns? fat\b/i,
  /boosts? (your )?immun/i,
  /reduces? (stress|anxiety|cortisol)/i,
  /flush(es)? alcohol/i,
]

/**
 * Negated, self-deprecating framing ("Not a hangover cure", "won't detox you")
 * is the OPPOSITE of a claim — strip those clauses before scanning so an honest
 * disclaimer doesn't read as an offence.
 */
function scrubNegations(copy: string): string {
  return copy
    .replace(/\bnot an?\b[^.!]*/gi, '')
    .replace(/\b(won['’]t|will not|doesn['’]t|can['’]t|no)\b[^.!]*/gi, '')
}

function customerCopy(bundle: (typeof SEED_BUNDLES)[number]): string {
  return [
    bundle.name,
    bundle.tagline,
    bundle.description,
    bundle.honestyLine,
    bundle.blueprint.summary,
    bundle.disclaimer,
    ...bundle.blueprint.slots.map((s) => `${s.title} ${s.description} ${s.reason}`),
    ...bundle.addOns.map((a) => `${a.title} ${a.reason}`),
    ...bundle.howToUse.map((s) => `${s.title} ${s.detail}`),
    bundle.workout.intro,
    bundle.workout.rule,
  ].join(' ')
}

describe('launch bundles', () => {
  it('ships six bundles including Big Night, Big Morning', () => {
    expect(SEED_BUNDLES).toHaveLength(6)
    expect(SEED_BUNDLES.map((b) => b.slug)).toContain('big-night-big-morning')
  })

  it('every slug is unique', () => {
    const slugs = SEED_BUNDLES.map((b) => b.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
  })

  describe.each(SEED_BUNDLES.map((b) => [b.name, b] as const))('%s', (_name, bundle) => {
    it('every core slot resolves to a real, in-stock catalogue product', () => {
      for (const slot of bundle.blueprint.slots) {
        const product = MOCK_CATALOGUE.find((p) => p.id === slot.selectedProductId)
        expect(product).toBeDefined()
        expect(product!.swapGroup).toBe(slot.swapGroup)
        expect(product!.variants.some((v) => v.available)).toBe(true)
      }
      expect(isBundleSellable(bundle, MOCK_CATALOGUE)).toBe(true)
    })

    it('every add-on resolves to a real product with a unique slot id', () => {
      const coreIds = new Set(bundle.blueprint.slots.map((s) => s.slotId))
      for (const addOn of bundle.addOns) {
        expect(MOCK_CATALOGUE.find((p) => p.id === addOn.productId)).toBeDefined()
        expect(coreIds.has(addOn.slotId)).toBe(false)
      }
    })

    it('has three fixed core slots (required, no swap/remove)', () => {
      expect(bundle.blueprint.slots).toHaveLength(3)
      for (const slot of bundle.blueprint.slots) {
        expect(slot.required).toBe(true)
        expect(slot.canSwap).toBe(false)
        expect(slot.canRemove).toBe(false)
      }
    })

    it('has a complete workout', () => {
      expect(bundle.workout.title).toBeTruthy()
      expect(bundle.workout.exercises.length).toBeGreaterThanOrEqual(4)
      expect(bundle.workout.warmup).toBeTruthy()
      expect(bundle.workout.finisher).toBeTruthy()
    })

    it('prices with a bundle discount, and any offered subscription clears the floor', () => {
      const pricing = calculatePricing(bundle.blueprint, MOCK_CATALOGUE)
      expect(pricing.oneOffTotal).toBeGreaterThan(0)
      expect(pricing.oneOffTotal).toBeLessThan(pricing.oneOffSubtotal)
      expect(pricing.bundleDiscountPct).toBeGreaterThan(0)
      // Subscription is offered only when the flat monthly clears the minimum;
      // when it is offered, it must actually clear it.
      if (pricing.subscriptionMinOrderMet) {
        expect(pricing.subscriptionTotal).toBeGreaterThanOrEqual(getPricingConfig().minSubscriptionMonthly)
      }
    })

    it('passes checkout validation for both plans (mock mode)', () => {
      expect(validateCheckout(bundle.blueprint, MOCK_CATALOGUE, { requireShopifyIds: false }).ok).toBe(true)
      expect(
        buildSubscriptionCheckout(bundle.blueprint, MOCK_CATALOGUE, null, {
          requireShopifyIds: false,
          requireSellingPlans: false,
        }).ok,
      ).toBe(true)
    })

    it('is readiness-green against the catalogue', () => {
      expect(bundleReadiness(bundle, MOCK_CATALOGUE).overall).toBe('ok')
    })

    it('keeps customer copy claim-safe', () => {
      const copy = scrubNegations(customerCopy(bundle))
      for (const banned of BANNED) {
        expect(copy).not.toMatch(banned)
      }
    })

    it('has SEO metadata', () => {
      expect(bundle.metaTitle).toBeTruthy()
      expect(bundle.metaDescription).toBeTruthy()
    })
  })
})
