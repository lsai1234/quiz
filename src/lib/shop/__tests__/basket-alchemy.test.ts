import type { CatalogueProduct, CatalogueVariant } from '@/lib/catalogue/types'
import type { ResolvedBasketLine } from '@/lib/basket/types'
import { getPricingConfig } from '@/lib/stack-blueprint/pricing'
import {
  bundleEdge,
  bundleNudges,
  deliveryNudge,
  bestNudge,
  bundleProductIds,
  MAX_MISSING_FOR_NUDGE,
  type NudgeBundle,
} from '../basket-alchemy'

function variant(over: Partial<CatalogueVariant> = {}): CatalogueVariant {
  return { id: 'v', title: 'V', flavour: null, size: null, price: 30, compareAtPrice: null, available: true, ...over }
}

function makeProduct(over: Partial<CatalogueProduct> = {}): CatalogueProduct {
  return {
    id: 'p', title: 'P', handle: 'p', description: '', imageUrl: null, category: 'Protein',
    stackSlots: ['protein'], goals: ['muscle'], dietaryTags: [], formats: ['powder'],
    variants: [variant()], basePrice: 30, compareAtPrice: null, subscriptionEligible: true,
    servings: 30, swapGroup: 'protein-whey', recommendationPriority: 5, marginPriority: 5,
    isCoreEligible: true, isBoosterEligible: false, hasStimulants: false, shortReason: '',
    warnings: [], ...over,
  }
}

const WHEY = makeProduct({ id: 'whey', title: 'CHRGD Whey Protein' })
const CREATINE = makeProduct({ id: 'creatine', title: 'CHRGD Creatine' })
const MAGNESIUM = makeProduct({ id: 'magnesium', title: 'CHRGD Magnesium' })
const SALTS = makeProduct({ id: 'salts', title: 'CHRGD Hydration Salts' })
const SOLD_OUT = makeProduct({ id: 'sold-out', title: 'CHRGD Sold Out', variants: [variant({ available: false })] })
/** In no bundle at all — the basket that has nothing to be nearly-a-bundle. */
const SHAKER = makeProduct({ id: 'shaker', title: 'CHRGD Shaker', swapGroup: 'accessory' })

const PRODUCTS = [WHEY, CREATINE, MAGNESIUM, SALTS, SOLD_OUT, SHAKER]

/** A bundle of the given product ids, at the given bundle price. */
function makeBundle(slug: string, name: string, ids: string[], price = 60): NudgeBundle {
  return {
    bundle: {
      slug,
      name,
      blueprint: {
        slots: ids.map((id, i) => ({
          slotId: `slot-${i}`, slotType: 'protein', title: 'T', description: '',
          recommendedProductId: id, selectedProductId: id, selectedVariantId: null,
          required: true, canRemove: false, canSwap: false, swapGroup: 'general',
          reason: '', confidenceScore: 80, displayOrder: i,
        })),
      },
    },
    price: { saving: 0, price },
  }
}

/*
 * Every fixture product is £30. Through the basket, three of them are £90 less
 * the £50+ tier (8%) = £82.80, and two are £60 less the tier = £55.20 — so a
 * bundle priced AT those numbers has no edge at all, which is the case that
 * matters most.
 */
const ALA_CARTE_3 = 82.8
const ALA_CARTE_2 = 55.2

const RECOVERY = makeBundle('recovery-stack', 'Recovery Stack', ['whey', 'creatine', 'magnesium'], ALA_CARTE_3 - 6.4)
const HYDRATION = makeBundle('hydration-stack', 'Hydration Stack', ['salts', 'magnesium'], ALA_CARTE_2 - 3.1)

function line(product: CatalogueProduct, quantity = 1): ResolvedBasketLine {
  const v = product.variants[0]
  return { product, variant: v, quantity, lineTotal: v.price * quantity }
}

/**
 * The regression that gave this function its reason to exist: the shop's own
 * `BundlePriceSummary.saving` measures a bundle against the UNDISCOUNTED sum of
 * its parts, which in this pricing model is precisely the £50+ tier the basket
 * already earns on the same products. Quoting it would advertise a saving the
 * shopper has either way.
 */
describe('bundleEdge', () => {
  const THREE = [WHEY, CREATINE, MAGNESIUM]

  it('is zero when the bundle costs what the parts cost through the basket', () => {
    expect(bundleEdge(ALA_CARTE_3, THREE)).toBe(0)
  })

  it('reports only what a bundle genuinely takes off that price', () => {
    expect(bundleEdge(ALA_CARTE_3 - 5, THREE)).toBe(5)
  })

  it('is floored at zero for a bundle that costs more than its parts', () => {
    expect(bundleEdge(ALA_CARTE_3 + 20, THREE)).toBe(0)
  })

  it('prices both sides through the basket, so the tier discount cancels', () => {
    // £90 of parts becomes £82.80 in the basket. A bundle at the RAW £90 is
    // therefore £7.20 WORSE, not "£7.20 saved" — which is the trap.
    expect(bundleEdge(90, THREE)).toBe(0)
  })

  it('is zero for an empty set', () => {
    expect(bundleEdge(50, [])).toBe(0)
  })
})

describe('bundleProductIds', () => {
  it('de-duplicates, so a bundle with one product in two slots counts once', () => {
    const b = makeBundle('x', 'X', ['whey', 'whey', 'creatine'])
    expect(bundleProductIds(b.bundle.blueprint)).toEqual(['whey', 'creatine'])
  })
})

describe('bundleNudges', () => {
  it('spots a bundle the basket is one product short of', () => {
    const nudges = bundleNudges([line(WHEY), line(CREATINE)], [RECOVERY], PRODUCTS)
    expect(nudges).toHaveLength(1)
    expect(nudges[0]).toMatchObject({ slug: 'recovery-stack', name: 'Recovery Stack', have: 2 })
    // Computed against the basket, not taken from the bundle's own brochure figure.
    expect(nudges[0].saving).toBeCloseTo(6.4, 2)
    expect(nudges[0].missing.map((p) => p.id)).toEqual(['magnesium'])
  })

  it('spots one it is two short of, when the basket holds as many again', () => {
    const four = makeBundle('four', 'Four', ['whey', 'creatine', 'magnesium', 'salts'])
    const nudges = bundleNudges([line(WHEY), line(CREATINE)], [four], PRODUCTS)
    expect(nudges[0].missing.map((p) => p.id)).toEqual(['magnesium', 'salts'])
  })

  it('will not pitch a bundle the basket holds only one of — that is an advert', () => {
    // One of three is not "nearly": without this, every basket of a single
    // product gets a three-product bundle pitched at it.
    expect(bundleNudges([line(WHEY)], [RECOVERY], PRODUCTS)).toEqual([])
  })

  it('says nothing about a bundle the basket has none of', () => {
    expect(bundleNudges([line(SALTS)], [RECOVERY], PRODUCTS)).toEqual([])
  })

  it('says nothing about a bundle the basket already holds in full', () => {
    const full = [line(WHEY), line(CREATINE), line(MAGNESIUM)]
    expect(bundleNudges(full, [RECOVERY], PRODUCTS)).toEqual([])
  })

  it('says nothing about an empty basket', () => {
    expect(bundleNudges([], [RECOVERY], PRODUCTS)).toEqual([])
  })

  it('counts one of a two-product bundle as a near-miss', () => {
    const nudges = bundleNudges([line(SALTS)], [HYDRATION], PRODUCTS)
    expect(nudges[0]).toMatchObject({ slug: 'hydration-stack', have: 1 })
    expect(nudges[0].missing.map((p) => p.id)).toEqual(['magnesium'])
  })

  it('will not suggest a bundle that cannot be completed today', () => {
    const withSoldOut = makeBundle('s', 'Sold Out Stack', ['whey', 'sold-out'])
    expect(bundleNudges([line(WHEY)], [withSoldOut], PRODUCTS)).toEqual([])
  })

  it('will not suggest a bundle whose missing product has left the catalogue', () => {
    const ghost = makeBundle('g', 'Ghost Stack', ['whey', 'no-such-product'])
    expect(bundleNudges([line(WHEY)], [ghost], PRODUCTS)).toEqual([])
  })

  it('still suggests a bundle with no price edge, reporting a saving of zero', () => {
    // A curated stack the shopper is one product from completing is worth
    // naming even when it costs exactly what the parts cost — the component
    // then leads on what it IS rather than what it saves.
    const flat = makeBundle('f', 'Flat Stack', ['whey', 'creatine'], ALA_CARTE_2)
    const nudges = bundleNudges([line(WHEY)], [flat], PRODUCTS)
    expect(nudges).toHaveLength(1)
    expect(nudges[0].saving).toBe(0)
  })

  it('gives up beyond a couple of missing products', () => {
    const big = makeBundle('b', 'Big Stack', ['whey', 'creatine', 'magnesium', 'salts', 'shaker'])
    expect(bundleNudges([line(WHEY), line(CREATINE)], [big], PRODUCTS)).toEqual([])
    expect(MAX_MISSING_FOR_NUDGE).toBe(2)
  })

  it('ranks one-away above two-away, whatever the money says', () => {
    // Two-away but a bigger saving must still lose to the one-away bundle.
    const twoAway = makeBundle('two', 'Two Away', ['whey', 'creatine', 'salts', 'magnesium'], 20)
    const nudges = bundleNudges([line(WHEY), line(CREATINE)], [twoAway, RECOVERY], PRODUCTS)
    // Recovery is one away; Two Away is two away with eight times the saving.
    expect(nudges.map((n) => n.slug)).toEqual(['recovery-stack', 'two'])
  })

  it('breaks a tie on the real saving', () => {
    const small = makeBundle('small', 'Small', ['whey', 'salts'], ALA_CARTE_2 - 1)
    const big = makeBundle('big', 'Big', ['whey', 'magnesium'], ALA_CARTE_2 - 9)
    const nudges = bundleNudges([line(WHEY)], [small, big], PRODUCTS)
    expect(nudges.map((n) => n.slug)).toEqual(['big', 'small'])
  })
})

describe('deliveryNudge', () => {
  const config = getPricingConfig()

  it('says how far off free delivery the basket is', () => {
    const nudge = deliveryNudge(config.freeDeliveryThreshold - 12.5, config)
    expect(nudge).toMatchObject({ kind: 'delivery', remaining: 12.5, threshold: config.freeDeliveryThreshold })
  })

  it('says nothing once free delivery is earned', () => {
    expect(deliveryNudge(config.freeDeliveryThreshold, config)).toBeNull()
    expect(deliveryNudge(config.freeDeliveryThreshold + 1, config)).toBeNull()
  })

  it('says nothing about an empty basket', () => {
    expect(deliveryNudge(0, config)).toBeNull()
  })

  it('rounds to the penny rather than showing floating-point change', () => {
    expect(deliveryNudge(33.33, config)?.remaining).toBe(config.freeDeliveryThreshold - 33.33)
  })
})

describe('bestNudge', () => {
  const base = { bundles: [RECOVERY, HYDRATION], products: PRODUCTS }

  it('prefers a bundle to the delivery bar', () => {
    const nudge = bestNudge({ ...base, resolved: [line(WHEY), line(CREATINE)], subtotal: 60 })
    expect(nudge?.kind).toBe('bundle')
  })

  it('falls back to the delivery bar for a basket holding one of a three-product bundle', () => {
    const nudge = bestNudge({ ...base, resolved: [line(WHEY)], subtotal: 34.99 })
    expect(nudge?.kind).toBe('delivery')
  })

  it('falls back to the delivery bar when no bundle is close', () => {
    // A shaker is in no bundle, so nothing is nearly complete.
    const nudge = bestNudge({ ...base, resolved: [line(SHAKER)], subtotal: 18.99 })
    expect(nudge?.kind).toBe('delivery')
  })

  it('says nothing when there is nothing to say', () => {
    const config = getPricingConfig()
    expect(bestNudge({ ...base, resolved: [line(SHAKER)], subtotal: config.freeDeliveryThreshold })).toBeNull()
    expect(bestNudge({ ...base, resolved: [], subtotal: 0 })).toBeNull()
  })

  it('respects a dismissal, and moves on to the next thing worth saying', () => {
    const resolved = [line(WHEY), line(CREATINE)]
    const first = bestNudge({ ...base, resolved, subtotal: 60 })
    expect(first?.key).toBe('bundle:recovery-stack')

    const next = bestNudge({ ...base, resolved, subtotal: 60, dismissed: new Set([first!.key]) })
    // The recovery bundle is out; the delivery bar is what is left.
    expect(next?.kind).toBe('delivery')

    const nothing = bestNudge({
      ...base, resolved, subtotal: 60, dismissed: new Set([first!.key, 'delivery']),
    })
    expect(nothing).toBeNull()
  })

  it('holds the delivery bar back for a caller that already shows one', () => {
    // The basket drawer runs its own free-delivery ladder; saying it twice in
    // one view is noise.
    const nudge = bestNudge({ ...base, resolved: [line(SHAKER)], subtotal: 18.99, skipDelivery: true })
    expect(nudge).toBeNull()
  })

  it('still offers a bundle to a caller that skips delivery', () => {
    const nudge = bestNudge({
      ...base, resolved: [line(WHEY), line(CREATINE)], subtotal: 60, skipDelivery: true,
    })
    expect(nudge?.kind).toBe('bundle')
  })
})
