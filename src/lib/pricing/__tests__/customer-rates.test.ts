/**
 * What WE charge the member for delivery.
 *
 * The thing this ladder replaced was a single charge with one free-delivery
 * cliff, and the cliff was in the wrong place: free delivery started at £60 of
 * retail while our own cost did not drop until ~£100 and did not vanish until
 * ~£198. The worst basket in the business was one that had just earned free
 * delivery. These tests pin the alignment, because it is the whole point of the
 * shape — a future edit that moves our free line below the supplier's step-down
 * should fail here rather than in a month's margin figures.
 */
import {
  blendedCustomerCharge,
  customerDeliveryCharge,
  deriveFreeDeliveryThreshold,
  deliveryOptions,
  entryDeliveryCharge,
  freeDeliveryImpact,
  quoteDelivery,
} from '@/lib/pricing/delivery'
import { priceForMargin, unitEconomics } from '@/lib/pricing/unit-economics'
import { PRICING_CONFIG, getPricingConfig, qualifiesForFreeDelivery } from '@/lib/stack-blueprint/pricing'

const config = getPricingConfig()

describe('the customer delivery ladder', () => {
  it('reads first-fit, tightest band first', () => {
    expect(customerDeliveryCharge(20, 'uk-1', config)).toBe(4.95)
    expect(customerDeliveryCharge(39.99, 'uk-1', config)).toBe(4.95)
    expect(customerDeliveryCharge(40, 'uk-1', config)).toBe(2.95)
    expect(customerDeliveryCharge(99.99, 'uk-1', config)).toBe(2.95)
    expect(customerDeliveryCharge(100, 'uk-1', config)).toBe(0)
    expect(customerDeliveryCharge(250, 'uk-1', config)).toBe(0)
  })

  it('charges nothing on an empty basket', () => {
    // Not the entry rung: no basket is not a small basket.
    expect(customerDeliveryCharge(0, 'uk-1', config)).toBe(0)
  })

  it('surcharges Zone 2 on every band, the free one included', () => {
    const surcharge = config.delivery.zone2Surcharge
    expect(customerDeliveryCharge(20, 'uk-2', config)).toBe(4.95 + surcharge)
    // The one that matters: PowerBody's Zone 2 free line is £300 of WHOLESALE,
    // roughly a £600 basket, so our cost up there never actually goes away.
    expect(customerDeliveryCharge(250, 'uk-2', config)).toBe(surcharge)
  })

  it('advertises the same threshold it charges', () => {
    // Two fields meaning "free above here" are one edit from disagreeing, and
    // the way you find out is a basket that promises free delivery and bills.
    expect(config.freeDeliveryThreshold).toBe(deriveFreeDeliveryThreshold(config))
    expect(qualifiesForFreeDelivery(config.freeDeliveryThreshold, config)).toBe(true)
    expect(customerDeliveryCharge(config.freeDeliveryThreshold, 'uk-1', config)).toBe(0)
  })

  it('stops charging at the point the supplier starts charging us less', () => {
    // The alignment the ladder exists for. Our free line, converted to wholesale
    // at the configured markup, must not sit BELOW the supplier band it is meant
    // to line up with — that gap is money we hand over for nothing.
    const freeAtWholesale = config.freeDeliveryThreshold * config.defaultCostRatio
    const stepDown = config.delivery.services
      .filter((s) => s.zone === 'uk-1' && s.maxOrderValue != null)
      .sort((a, b) => (a.maxOrderValue ?? 0) - (b.maxOrderValue ?? 0))[0]
    expect(freeAtWholesale).toBeGreaterThanOrEqual(stepDown.maxOrderValue!)
  })

  it('never collects more than the parcel costs', () => {
    // Delivery is a cost recovery, not a product. If a rung ever collected more
    // than the supplier charges, it is a margin decision that deserves saying
    // out loud rather than hiding in a postage line.
    for (const basket of [20, 45, 75, 120, 250]) {
      const quote = quoteDelivery(
        { supplierValue: basket * config.defaultCostRatio, zone: 'uk-1', orderValue: basket },
        config,
      )
      expect(quote.customerCharge).toBeLessThanOrEqual(quote.supplierCost)
    }
  })

  it('still absorbs something on every paid band', () => {
    // The plan is to pass SOME on, not all of it. A ladder that fully recovered
    // postage would price the small baskets out.
    const quote = quoteDelivery({ supplierValue: 10, zone: 'uk-1', orderValue: 20 }, config)
    expect(quote.absorbed).toBeGreaterThan(0)
    expect(quote.customerCharge).toBeGreaterThan(0)
  })

  it('entry charge is the first rung, for the price solver', () => {
    expect(entryDeliveryCharge(config)).toBe(4.95)
  })
})

describe('checkout delivery options', () => {
  it('offers a mainland and a Highlands rate for the basket', () => {
    const options = deliveryOptions(45, config)
    expect(options.map((o) => o.id)).toEqual(['uk-mainland', 'uk-highlands'])
    expect(options[0].price).toBe(2.95)
    expect(options[1].price).toBe(2.95 + config.delivery.zone2Surcharge)
  })

  it('still offers both when delivery is free, because Zone 2 is not', () => {
    const options = deliveryOptions(150, config)
    expect(options[0].price).toBe(0)
    expect(options[1].price).toBe(config.delivery.zone2Surcharge)
  })
})

describe('a ladder with no free band', () => {
  const alwaysPaid = {
    ...PRICING_CONFIG,
    delivery: { ...PRICING_CONFIG.delivery, customerRates: [{ maxOrderValue: null, price: 3.5 }] },
  }

  it('derives a threshold of zero rather than pretending there is one', () => {
    expect(deriveFreeDeliveryThreshold(alwaysPaid)).toBe(0)
    expect(customerDeliveryCharge(1000, 'uk-1', alwaysPaid)).toBe(3.5)
  })
})

describe('the margin model and the ladder', () => {
  it('blends the Highlands surcharge into what we assume we collect', () => {
    // The cost side is already blended (`blendedDeliveryCost`), so the revenue
    // side has to be too. Charging mainland revenue against blended cost counts
    // Zone 2's extra cost while ignoring the surcharge raised to cover it.
    const share = config.delivery.zone2SharePct
    const expected =
      customerDeliveryCharge(30, 'uk-1', config) * (1 - share) +
      customerDeliveryCharge(30, 'uk-2', config) * share
    expect(blendedCustomerCharge(30, config)).toBeCloseTo(expected, 2)
  })

  it('still collects the surcharge share above the free line', () => {
    // Free delivery is a mainland promise. Zone 2 never reaches PowerBody's own
    // free band, so a few pence of surcharge survives on every basket.
    expect(customerDeliveryCharge(250, 'uk-1', config)).toBe(0)
    expect(blendedCustomerCharge(250, config)).toBeGreaterThan(0)
  })

  it('solves a target price against the rung that price lands on', () => {
    /**
     * The solver used to take the delivery charge as a constant. On a ladder it
     * is a step function of the very price being solved for, so a price solved
     * at the £4.95 rung but landing in the £2.95 band would be under-priced by
     * the difference — silently, and only near a rung boundary.
     *
     * Checked by asking the waterfall: whatever price comes back must actually
     * hit the target margin when re-priced, which it cannot do if the postage
     * assumed on the way in was the wrong rung.
     */
    const costs = [8, 12, 18, 25, 40, 60]
    for (const cost of costs) {
      const price = priceForMargin(0.35, { supplierCost: cost, sharedParcelItems: 1 }, config)
      // Asserted, not skipped. An earlier version of this had the arguments the
      // wrong way round, which made every solve return null and the whole loop
      // pass without checking anything.
      expect(price).not.toBeNull()
      expect(unitEconomics({ shelfPrice: price!, supplierCost: cost, sharedParcelItems: 1 }, config).marginPct)
        .toBeGreaterThanOrEqual(0.35)
    }
  })

  it('reports the position rung by rung, not just the entry one', () => {
    const impact = freeDeliveryImpact(20, config)
    expect(impact.bands).toHaveLength(config.delivery.customerRates.length)
    // The free rung is the one that costs us the whole parcel.
    const free = impact.bands.find((b) => b.charge === 0)!
    expect(free.net).toBeCloseTo(-impact.supplierCost, 2)
  })
})
