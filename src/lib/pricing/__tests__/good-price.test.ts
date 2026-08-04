import {
  goodPriceFor,
  landedMonthlyCost,
  worstCaseSubscriptionRate,
  pricingHorizonMonths,
  auditProductPrice,
} from '../good-price'
import { parcelsFor, quoteDelivery, supplierDeliveryCost, monthlyDeliveryCost } from '../delivery'
import { PRICING_CONFIG, type PricingConfig } from '@/lib/stack-blueprint/pricing'

/** A config built from the defaults with a few rules overridden. */
function cfg(over: Partial<PricingConfig> = {}): PricingConfig {
  return { ...PRICING_CONFIG, ...over }
}

describe('delivery economics', () => {
  it('splits a shipment into parcels and charges per parcel plus per unit', () => {
    const c = cfg()
    expect(parcelsFor(0, c)).toBe(0)
    expect(parcelsFor(1, c)).toBe(1)
    expect(parcelsFor(6, c)).toBe(1)
    expect(parcelsFor(7, c)).toBe(2)
    // 1 parcel × £3.50 + 2 units × £0.40
    expect(supplierDeliveryCost({ units: 2, goodsValue: 20 }, c)).toBeCloseTo(4.3, 2)
    // 2 parcels × £3.50 + 7 units × £0.40
    expect(supplierDeliveryCost({ units: 7, goodsValue: 70 }, c)).toBeCloseTo(9.8, 2)
  })

  it('ships free once the supplier free-shipping threshold is met', () => {
    const c = cfg({ delivery: { ...PRICING_CONFIG.delivery, supplierFreeParcelThreshold: 50 } })
    expect(supplierDeliveryCost({ units: 2, goodsValue: 49.99 }, c)).toBeGreaterThan(0)
    expect(supplierDeliveryCost({ units: 2, goodsValue: 50 }, c)).toBe(0)
  })

  it('charges the member nothing above the free-delivery threshold, and shows what we absorb', () => {
    const c = cfg()
    const small = quoteDelivery({ units: 1, goodsValue: 8, orderValue: 20 }, c)
    expect(small.customerCharge).toBeCloseTo(3.95, 2)
    expect(small.freeForCustomer).toBe(false)
    // £3.90 supplier cost against £3.95 collected — we are not out of pocket.
    expect(small.absorbed).toBe(0)

    const big = quoteDelivery({ units: 1, goodsValue: 8, orderValue: 60 }, c)
    expect(big.customerCharge).toBe(0)
    expect(big.freeForCustomer).toBe(true)
    expect(big.absorbed).toBeCloseTo(3.9, 2)
  })

  it('spreads a quarterly shipment across the months it covers', () => {
    const c = cfg()
    expect(monthlyDeliveryCost({ units: 1, goodsValue: 10 }, 3, c)).toBeCloseTo(1.3, 2)
  })
})

describe('worst-case assumptions', () => {
  it('takes the deepest subscribe-and-save rate any bundle can reach', () => {
    // Defaults: essentials 15 / performance 20 / complete 25 → the biggest bundle.
    expect(worstCaseSubscriptionRate(cfg())).toBeCloseTo(0.25, 4)
  })

  it('lets a subscription tier beat the biggest bundle', () => {
    const c = cfg({ subscriptionTiers: [{ id: 't', label: 'Big', minSubtotal: 100, discountPct: 0.32 }] })
    expect(worstCaseSubscriptionRate(c)).toBeCloseTo(0.32, 4)
  })

  it('judges a price over the earliest a member can leave', () => {
    expect(pricingHorizonMonths(cfg({ minSubscriptionMonths: 3 }))).toBe(3)
    // An explicit horizon overrides the commitment.
    expect(pricingHorizonMonths(cfg({ goodPricing: { ...PRICING_CONFIG.goodPricing, horizonMonths: 6 } }))).toBe(6)
  })
})

describe('landed cost', () => {
  it('carries goods and the supplier delivery charge, spread over the cadence', () => {
    const c = cfg()
    const monthly = landedMonthlyCost({ assetPrice: 12, unitsPerShipment: 1, shipEveryMonths: 1 }, c)
    expect(monthly.goods).toBeCloseTo(12, 2)
    expect(monthly.delivery).toBeCloseTo(3.9, 2) // £3.50 parcel + £0.40 unit
    expect(monthly.total).toBeCloseTo(15.9, 2)

    const quarterly = landedMonthlyCost({ assetPrice: 12, unitsPerShipment: 1, shipEveryMonths: 3 }, c)
    expect(quarterly.goods).toBeCloseTo(4, 2)
    expect(quarterly.delivery).toBeCloseTo(1.3, 2)
  })
})

describe('the good price', () => {
  it('breaks even exactly where the worst-case path stops losing money', () => {
    const c = cfg()
    const r = goodPriceFor({ assetPrice: 10 }, c)

    // Deepest bundle rate 25%, average first month 18%, 1-month horizon.
    expect(r.assumptions.subscriptionDiscount).toBeCloseTo(0.25, 4)
    expect(r.assumptions.firstMonthDiscount).toBeCloseTo(0.18, 4)
    expect(r.assumptions.horizonMonths).toBe(1)
    expect(r.assumptions.absorbsDelivery).toBe(true)

    // cost £13.90 ÷ ((1 − 0.25) × (1 − 0.18)) = £22.60
    expect(r.horizonCost).toBeCloseTo(13.9, 2)
    expect(r.breakEvenPrice).toBeCloseTo(22.6, 1)

    // At break-even the worst case makes nothing at all — that is the definition.
    const at = goodPriceFor({ assetPrice: 10, listPrice: r.breakEvenPrice }, c).atListPrice!
    expect(at.profit).toBeCloseTo(0, 1)
    expect(at.marginPct).toBeCloseTo(0, 2)
  })

  it('recommends a price that hits the target margin on that worst case', () => {
    const c = cfg()
    const r = goodPriceFor({ assetPrice: 10, listPrice: undefined }, c)
    expect(r.goodPrice).toBeGreaterThan(r.breakEvenPrice)

    const at = goodPriceFor({ assetPrice: 10, listPrice: r.goodPrice }, c).atListPrice!
    expect(at.marginPct).toBeCloseTo(c.goodPricing.targetMarginPct, 2)
    expect(at.meetsTarget).toBe(true)
    expect(at.profitable).toBe(true)
  })

  it('calls out a price that loses money on the worst case even though it looks fine on list', () => {
    const c = cfg()
    // £20 list on a £10 asset looks like a 50% margin — and still loses money once
    // the deepest bundle discount, the intro offer and the postage are applied.
    const at = goodPriceFor({ assetPrice: 10, listPrice: 20 }, c).atListPrice!
    expect(at.profitable).toBe(false)
    expect(at.marginPct).toBeLessThan(0)
    expect(at.vsGoodPrice).toBeLessThan(0)
  })

  it('needs a higher price as the first-month giveaway grows', () => {
    const lean = goodPriceFor({ assetPrice: 10 }, cfg({ introOffer: { ...PRICING_CONFIG.introOffer, effectiveFirstMonthDiscount: 0.05 } }))
    const rich = goodPriceFor({ assetPrice: 10 }, cfg({ introOffer: { ...PRICING_CONFIG.introOffer, effectiveFirstMonthDiscount: 0.4 } }))
    expect(rich.goodPrice).toBeGreaterThan(lean.goodPrice)
  })

  it('dilutes the first month over a longer commitment', () => {
    const short = goodPriceFor({ assetPrice: 10 }, cfg({ minSubscriptionMonths: 1 }))
    const long = goodPriceFor({ assetPrice: 10 }, cfg({ minSubscriptionMonths: 6 }))
    // Same monthly cost, but one discounted month spread over six lowers the
    // monthly price needed to clear it.
    expect(long.goodPrice).toBeLessThan(short.goodPrice)
  })

  it('drops the price when the member pays for postage instead of us', () => {
    const absorbed = goodPriceFor({ assetPrice: 10 }, cfg())
    const collected = goodPriceFor(
      { assetPrice: 10 },
      cfg({
        goodPricing: { ...PRICING_CONFIG.goodPricing, assumeFreeDelivery: false },
        freeDeliveryThreshold: 500, // nothing reaches free delivery, so it is always charged
      }),
    )
    expect(collected.assumptions.absorbsDelivery).toBe(false)
    expect(collected.horizonDeliveryCollected).toBeGreaterThan(0)
    expect(collected.goodPrice).toBeLessThan(absorbed.goodPrice)
  })

  it('audits a catalogue product, estimating the cost when none is set', () => {
    const c = cfg()
    const known = auditProductPrice({ title: 'Whey', basePrice: 45, cost: 15, servings: 30 }, c)
    expect(known.costEstimated).toBe(false)
    expect(known.atListPrice).not.toBeNull()

    const guessed = auditProductPrice({ title: 'Mystery', basePrice: 45, cost: null, servings: 30 }, c)
    expect(guessed.costEstimated).toBe(true)
    expect(guessed.landedCost.goods).toBeCloseTo(45 * c.defaultCostRatio, 2)
  })

  it('never schedules a shipment further apart than the delivery cap allows', () => {
    const c = cfg()
    // 365 servings would be a yearly shipment; the cap keeps it at maxDeliveryMonths.
    const yearly = auditProductPrice({ title: 'Huge tub', basePrice: 60, cost: 20, servings: 365 }, c)
    expect(yearly.landedCost.goods).toBeCloseTo(20 / c.maxDeliveryMonths, 2)
  })
})
