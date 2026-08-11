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
  customerDeliveryCharge,
  deriveFreeDeliveryThreshold,
  deliveryOptions,
  entryDeliveryCharge,
  quoteDelivery,
} from '@/lib/pricing/delivery'
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
