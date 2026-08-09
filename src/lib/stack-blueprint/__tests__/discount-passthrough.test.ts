/**
 * Every discount reaches Stripe.
 *
 * The bug these guard against: the quiz displayed a tier-discounted total while
 * `/api/cart` billed the raw sum of variant prices, so a stack shown at £96 was
 * charged at £120 — and the shop never applied the configured tiers at all, so
 * customers who had earned a discount silently never got one.
 *
 * The fix is structural: there is now ONE function that prices a one-off order,
 * and both the screen and the Stripe line items come from it. These tests exist
 * to keep it that way, per regime.
 */
import {
  PRICING_CONFIG,
  calculatePricing,
  discountedOneOffTotal,
  getPricingConfig,
  priceOneOffLines,
  resetPricingOverrides,
  resolveTier,
  setPricingOverrides,
  unitCostOf,
} from '@/lib/stack-blueprint/pricing'
import { MOCK_CATALOGUE } from '@/lib/catalogue/mock-catalogue'
import { MOCK_BLUEPRINT } from '@/lib/stack-blueprint/mock-blueprint'
import type { CatalogueProduct } from '@/lib/catalogue/types'

afterEach(() => resetPricingOverrides())

/** A line at a given price with a cost low enough not to hit the margin floor. */
const line = (price: number, quantity = 1) => ({ price, cost: price * 0.3, quantity })

/** The tier a basket of this value earns, from config rather than typed in. */
const tierFor = (subtotal: number, items = 1) => resolveTier(PRICING_CONFIG.bundleTiers, subtotal, items).pct
const round2 = (n: number) => Math.round(n * 100) / 100

describe('regime 1 — one-off bundle tiers reach the charged price', () => {
  it('applies the qualifying tier to every unit', () => {
    const t = tierFor(120, 2)
    const priced = priceOneOffLines([line(60), line(60)])
    expect(priced.tierPct).toBe(t)
    expect(priced.subtotal).toBe(120)
    expect(priced.total).toBe(round2(120 * (1 - t)))
    expect(priced.discount).toBe(round2(120 * t))
    // Per UNIT, because that is what Stripe is handed.
    expect(priced.lines[0].discountedUnitPrice).toBe(round2(60 * (1 - t)))
  })

  it('counts quantity towards tier qualification', () => {
    // 3 × £40 = £120 on one line still qualifies on the whole subtotal.
    const t = tierFor(120, 3)
    const priced = priceOneOffLines([line(40, 3)])
    expect(priced.subtotal).toBe(120)
    expect(priced.tierPct).toBe(t)
    expect(priced.total).toBe(round2(120 * (1 - t)))
    expect(priced.lines[0].quantity).toBe(3)
    expect(priced.lines[0].discountedUnitPrice).toBe(round2(40 * (1 - t)))
  })

  it('gives no discount below the first threshold', () => {
    const priced = priceOneOffLines([line(20)])
    expect(priced.tierPct).toBe(0)
    expect(priced.total).toBe(20)
    expect(priced.discount).toBe(0)
  })

  it('picks the best qualifying tier, not the first', () => {
    // Config-driven, and deliberately non-decreasing: a bigger basket must never
    // earn LESS than a smaller one, whatever tiers are configured.
    const rates = [50, 90, 120, 500].map((v) => priceOneOffLines([line(v)]).tierPct)
    for (let i = 1; i < rates.length; i++) expect(rates[i]).toBeGreaterThanOrEqual(rates[i - 1])
    expect(rates[0]).toBe(tierFor(50))

    // And it really does pick the best rather than the first declared.
    setPricingOverrides({
      bundleTiers: [
        { id: 'lo', label: 'lo', minSubtotal: 10, discountPct: 0.05 },
        { id: 'hi', label: 'hi', minSubtotal: 20, discountPct: 0.3 },
      ],
    })
    expect(priceOneOffLines([line(100)], getPricingConfig()).tierPct).toBe(0.3)
  })

  it('honours a portal override rather than the compiled default', () => {
    setPricingOverrides({ bundleTiers: [{ id: 't', label: 'Half off', minSubtotal: 10, discountPct: 0.5 }] })
    const priced = priceOneOffLines([line(100)], getPricingConfig())
    expect(priced.total).toBe(50)
  })
})

describe('regime 2 — the margin floor still caps the discount', () => {
  it('never discounts a line below cost plus the floor', () => {
    // Cost £50 against a £60 price: the tier discount would go under the floor.
    const t = tierFor(120, 2)
    const priced = priceOneOffLines([{ price: 60, cost: 50, quantity: 1 }, { price: 60, cost: 18, quantity: 1 }])
    const floored = priced.lines[0]
    expect(floored.discountedUnitPrice).toBeGreaterThan(round2(60 * (1 - t)))
    expect(floored.discountedUnitPrice).toBe(round2(50 * (1 + PRICING_CONFIG.marginFloorPct)))
    // The unconstrained line still gets the full tier.
    expect(priced.lines[1].discountedUnitPrice).toBe(round2(60 * (1 - t)))
  })

  it('never marks a line UP when cost already exceeds the floor', () => {
    const priced = priceOneOffLines([{ price: 20, cost: 100, quantity: 1 }])
    expect(priced.lines[0].discountedUnitPrice).toBeLessThanOrEqual(20)
  })
})

describe('one implementation, so the screen and the card cannot disagree', () => {
  it('calculatePricing delegates to priceOneOffLines', () => {
    // The quiz displays `oneOffTotal`; /api/cart bills `priceOneOffLines`. If
    // these ever diverge, a customer is shown one price and charged another —
    // which is exactly the bug this suite exists for.
    const pricing = calculatePricing(MOCK_BLUEPRINT, MOCK_CATALOGUE as CatalogueProduct[])

    const lines = MOCK_BLUEPRINT.slots
      .map((slot) => (MOCK_CATALOGUE as CatalogueProduct[]).find((p) => p.id === slot.selectedProductId))
      .filter((p): p is CatalogueProduct => !!p)
      .map((product) => {
        const variant = product.variants.find((v) => v.available) ?? product.variants[0]
        const price = variant?.price ?? product.basePrice
        return { price, cost: unitCostOf(product, price), quantity: 1 }
      })

    expect(priceOneOffLines(lines).total).toBe(pricing.oneOffTotal)
  })

  it('discountedOneOffTotal agrees too — the budget cap and the price shown are the same maths', () => {
    const lines = [line(45), line(45), line(45)]
    expect(discountedOneOffTotal(lines)).toBe(priceOneOffLines(lines).total)
  })

  it('rounds per unit, the way Stripe charges', () => {
    // Stripe bills `unit_amount × quantity`. Summing unrounded prices and
    // rounding once would show a total the card never matches.
    const priced = priceOneOffLines([line(33.33, 3)])
    const expected = Math.round(priced.lines[0].discountedUnitPrice * 3 * 100) / 100
    expect(priced.total).toBe(expected)
    expect(priced.lines[0].discountedUnitPrice * 100).toBeCloseTo(
      Math.round(priced.lines[0].discountedUnitPrice * 100),
      6,
    )
  })
})

describe('regime 3 — subscriptions carry subscribe-&-save into the billed amount', () => {
  it('the flat monthly is already discounted, so Stripe bills the discounted figure', () => {
    const pricing = calculatePricing(MOCK_BLUEPRINT, MOCK_CATALOGUE as CatalogueProduct[])
    // `finalizeCheckout` hands `flatMonthly` (= subscriptionTotal) straight to
    // `createSubscriptionSession`, so this being below the undiscounted baseline
    // is what makes the discount reach the card.
    expect(pricing.subscriptionTotal).toBeLessThan(pricing.subscriptionItemsOneOffTotal)
    expect(pricing.subscriptionDiscountPct).toBeGreaterThan(0)
  })

  it('a bigger bundle earns a better rate, and that rate is the billed one', () => {
    const essentials = calculatePricing(MOCK_BLUEPRINT, MOCK_CATALOGUE as CatalogueProduct[], null, undefined, {
      level: 'essentials',
    })
    const complete = calculatePricing(MOCK_BLUEPRINT, MOCK_CATALOGUE as CatalogueProduct[], null, undefined, {
      level: 'complete',
    })
    expect(complete.subscriptionDiscountPct).toBeGreaterThan(essentials.subscriptionDiscountPct)
    expect(complete.subscriptionTotal).toBeLessThan(essentials.subscriptionTotal)
  })
})

describe('regime 4 — the first-month intro discount', () => {
  it('is a real reduction on the first month, passed to Stripe as a coupon', () => {
    const TOP = Math.max(...PRICING_CONFIG.introOffer.scratchReveal.outcomes.map((o) => o.discount))
    // The card is off in the live config now — a partner's code is the only
    // extra discount. The reveal path still has to pass a rate through to
    // Stripe, so switch it on for this test (afterEach resets).
    setPricingOverrides({
      introOffer: { ...PRICING_CONFIG.introOffer, scratchReveal: { ...PRICING_CONFIG.introOffer.scratchReveal, enabled: true } },
    })
    const pricing = calculatePricing(MOCK_BLUEPRINT, MOCK_CATALOGUE as CatalogueProduct[], null, undefined, {
      introDiscountOverride: TOP,
    })
    // `createSubscriptionSession` turns this rate into a one-cycle coupon, so
    // the recurring price stays whole and only month one is discounted.
    expect(pricing.subscriptionIntroDiscountPct).toBe(Math.round(TOP * 100))
    expect(pricing.subscriptionFirstMonth).toBeLessThan(pricing.subscriptionTotal)
    // A real reduction, but never below the margin floor — the intro is floored
    // per line like every other discount.
    expect(pricing.subscriptionFirstMonth).toBeGreaterThanOrEqual(pricing.subscriptionTotal * (1 - TOP) - 0.01)
  })

  it('is not applied until the member has revealed a valid rate', () => {
    const pricing = calculatePricing(MOCK_BLUEPRINT, MOCK_CATALOGUE as CatalogueProduct[])
    expect(pricing.subscriptionIntroDiscountPct).toBe(0)
    expect(pricing.subscriptionFirstMonth).toBe(pricing.subscriptionTotal)
  })

  it('ignores a rate that is not one of the configured outcomes', () => {
    // A tampered payload claims 90% off; only the configured outcomes count.
    const pricing = calculatePricing(MOCK_BLUEPRINT, MOCK_CATALOGUE as CatalogueProduct[], null, undefined, {
      introDiscountOverride: 0.9,
    })
    expect(pricing.subscriptionIntroDiscountPct).toBe(0)
  })
})

describe('regime 5 — a partner’s code, on the same displayed figures', () => {
  const CODE = PRICING_CONFIG.partners.codeDiscountPct
  const priceWith = (partnerDiscountPct: number | null) =>
    calculatePricing(MOCK_BLUEPRINT, MOCK_CATALOGUE as CatalogueProduct[], null, undefined, {
      level: 'complete',
      partnerDiscountPct,
    })

  it('replaces the bundle tier on the one-off total rather than compounding', () => {
    const plain = priceWith(null)
    const coded = priceWith(CODE)

    expect(plain.bundleDiscountPct).toBeGreaterThan(0)
    expect(coded.partnerDiscountPct).toBe(Math.round(CODE * 1000) / 10)
    // Exactly the code's rate off the subtotal — not the tier and the code
    // compounded, which would have been strictly cheaper than this.
    expect(coded.oneOffTotal).toBeCloseTo(round2(plain.oneOffSubtotal * (1 - CODE)), 1)
    expect(coded.oneOffTotal).toBeGreaterThan(round2(plain.oneOffSubtotal * (1 - plain.bundleDiscountPct / 100) * (1 - CODE)))
  })

  it('charges the code’s rate off the LIST price for the first month', () => {
    const coded = priceWith(CODE)
    // The subscribe-&-save rung is replaced for month one, so the first month is
    // the code's rate off the undiscounted monthly — NOT off the rung price.
    expect(coded.subscriptionDiscountPct).toBeGreaterThan(0)
    expect(coded.subscriptionFirstMonth).toBeCloseTo(coded.subscriptionItemsOneOffTotal * (1 - CODE), 1)
    // And month two onwards is untouched.
    expect(coded.subscriptionTotal).toBe(priceWith(null).subscriptionTotal)
  })

  it('leaves both totals exactly as they were when no code is used', () => {
    const plain = priceWith(null)
    expect(priceWith(0).oneOffTotal).toBe(plain.oneOffTotal)
    expect(priceWith(0).subscriptionFirstMonth).toBe(plain.subscriptionFirstMonth)
  })
})

describe('an empty or single-line order still prices sanely', () => {
  it('handles no lines', () => {
    const priced = priceOneOffLines([])
    expect(priced.total).toBe(0)
    expect(priced.discount).toBe(0)
    expect(priced.lines).toEqual([])
  })

  it('treats a missing quantity as one', () => {
    const priced = priceOneOffLines([{ price: 10, cost: 3 }])
    expect(priced.lines[0].quantity).toBe(1)
    expect(priced.total).toBe(10)
  })

  it('the shipped tiers still start at the free-delivery threshold', () => {
    // The discount must not start ABOVE the free-delivery line — that would
    // leave a band where postage is free but the basket has earned nothing,
    // which reads as the offer going backwards. Starting BELOW is fine and is
    // what we do now: 8% at £50, free delivery at £60, so growing the basket
    // pays twice rather than once.
    expect(PRICING_CONFIG.bundleTiers[0].minSubtotal).toBeLessThanOrEqual(PRICING_CONFIG.freeDeliveryThreshold)
  })
})
