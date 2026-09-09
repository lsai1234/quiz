import { SEED_BUNDLES } from '../seeds'
import { MOCK_CATALOGUE } from '@/lib/catalogue'
import { calculatePricing, getPricingConfig } from '@/lib/stack-blueprint/pricing'
import { validateCheckout, buildSubscriptionCheckout } from '@/lib/stack-blueprint/checkout'
import { bundleReadiness } from '../readiness'
import { isBundleSellable } from '../pricing'
import { assembleProductBundle, emptyProductBundleDraft } from '../assemble'
import { bundleWorkouts, composeBundles, EMPTY_PERSISTED_BUNDLES } from '@/lib/bundles/resolve'
import type { ProductBundle } from '../types'

/**
 * A stack to sell, standing in for one a founder builds in the Hub.
 *
 * The seeds ship with no products: a session stack is a session plus one of
 * the pre-built bundles, and which stack each session sells is a decision made
 * in the Hub against the live range, not in this repository. So every test that
 * needs a price or a checkout resolves the seed against this one first — that
 * is the only form a customer ever meets.
 */
function stack(): ProductBundle {
  const draft = emptyProductBundleDraft()
  draft.slug = 'test-stack'
  draft.name = 'Test Stack'
  draft.description = 'Three products.'
  draft.primaryGoal = 'recovery'
  draft.cores = [
    { productId: 'chrgd-electrolytes', title: 'Hydration', reason: 'Replace what you sweat.' },
    { productId: 'chrgd-creatine', title: 'Performance', reason: 'The daily base.' },
    { productId: 'chrgd-whey-protein', title: 'Protein', reason: 'Refuel after training.' },
  ]
  return assembleProductBundle(draft, MOCK_CATALOGUE)
}

const STACK = stack()

/** The seed as it would be once a founder has pointed it at a stack. */
function sold(bundle: (typeof SEED_BUNDLES)[number]) {
  return composeBundles([{ ...bundle, productBundleSlug: STACK.slug }], EMPTY_PERSISTED_BUNDLES, [STACK])[0]
}

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
    bundle.disclaimer,
    ...bundle.howToUse.map((s) => `${s.title} ${s.detail}`),
    // Every workout, because a package can carry more than one and each one is
    // customer-facing copy that has to clear the same claim bar.
    ...bundleWorkouts(bundle).flatMap((w) => [w.intro, w.rule]),
  ].join(' ')
}

describe('launch bundles', () => {
  it('ships six bundles including Big Night, Big Morning', () => {
    expect(SEED_BUNDLES).toHaveLength(6)
    expect(SEED_BUNDLES.map((b) => b.slug)).toContain('big-night-big-morning')
  })

  it('ships them with no stack, so none can be sold before a founder chooses one', () => {
    // The products were removed when stacks became their own record. An
    // unlinked package prices at nothing, so the shop must not list it — the
    // empty stack is the case `isBundleSellable` exists to catch.
    for (const bundle of SEED_BUNDLES) {
      expect(bundle.productBundleSlug).toBeNull()
      const resolved = composeBundles([bundle], EMPTY_PERSISTED_BUNDLES, [STACK])[0]
      expect(resolved.blueprint.slots).toEqual([])
      expect(isBundleSellable(resolved, MOCK_CATALOGUE)).toBe(false)
      expect(bundleReadiness(resolved, MOCK_CATALOGUE).checks.find((c) => c.id === 'stack')?.status).toBe('fail')
    }
  })

  it('every slug is unique', () => {
    const slugs = SEED_BUNDLES.map((b) => b.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
  })

  describe.each(SEED_BUNDLES.map((b) => [b.name, b] as const))('%s', (_name, bundle) => {
    it('sells its chosen stack, under its own name, with fixed slots', () => {
      const resolved = sold(bundle)
      expect(resolved.blueprint.slots).toHaveLength(3)
      expect(resolved.blueprint.stackName).toBe(bundle.name)
      for (const slot of resolved.blueprint.slots) {
        const product = MOCK_CATALOGUE.find((p) => p.id === slot.selectedProductId)
        expect(product).toBeDefined()
        expect(product!.variants.some((v) => v.available)).toBe(true)
        expect(slot.required).toBe(true)
        expect(slot.canSwap).toBe(false)
        expect(slot.canRemove).toBe(false)
      }
      expect(isBundleSellable(resolved, MOCK_CATALOGUE)).toBe(true)
    })

    it('has at least one complete workout', () => {
      const workouts = bundleWorkouts(bundle)
      expect(workouts.length).toBeGreaterThanOrEqual(1)
      for (const workout of workouts) {
        expect(workout.title).toBeTruthy()
        expect(workout.exercises.length).toBeGreaterThanOrEqual(4)
        expect(workout.warmup).toBeTruthy()
        expect(workout.finisher).toBeTruthy()
      }
    })

    it('prices with a bundle discount, and any offered subscription clears the floor', () => {
      const pricing = calculatePricing(sold(bundle).blueprint, MOCK_CATALOGUE)
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
      expect(validateCheckout(sold(bundle).blueprint, MOCK_CATALOGUE).ok).toBe(true)
      expect(
        buildSubscriptionCheckout(sold(bundle).blueprint, MOCK_CATALOGUE, null).ok,
      ).toBe(true)
    })

    it('is readiness-green once it has a stack to sell', () => {
      expect(bundleReadiness(sold(bundle), MOCK_CATALOGUE).overall).toBe('ok')
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
