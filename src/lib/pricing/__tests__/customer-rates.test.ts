/**
 * What WE charge the member for delivery: £2 under £20, free from £20, the
 * Highlands included.
 *
 * A parcel costs us £3.90 with Royal Mail. The £2 is what lets a single cheap
 * product pay its own way; from £20 the goods carry the parcel. These tests pin
 * that shape, and that a cheap order sent alone still makes money.
 */
import {
  blendedCustomerCharge,
  customerDeliveryCharge,
  deriveFreeDeliveryThreshold,
  deliveryOptions,
  entryDeliveryCharge,
  freeDeliveryImpact,
  quoteDelivery,
  recurringDeliveryOption,
} from '@/lib/pricing/delivery'
import { priceForMargin, unitEconomics } from '@/lib/pricing/unit-economics'
import { PRICING_CONFIG, getPricingConfig, qualifiesForFreeDelivery } from '@/lib/stack-blueprint/pricing'

const config = getPricingConfig()

describe('the customer delivery ladder', () => {
  it('reads first-fit, tightest band first: £2 under £20, free from £20', () => {
    expect(customerDeliveryCharge(8, 'uk-1', config)).toBe(2)
    expect(customerDeliveryCharge(19.99, 'uk-1', config)).toBe(2)
    expect(customerDeliveryCharge(20, 'uk-1', config)).toBe(0)
    expect(customerDeliveryCharge(250, 'uk-1', config)).toBe(0)
  })

  it('charges nothing on an empty basket', () => {
    // Not the entry rung: no basket is not a small basket.
    expect(customerDeliveryCharge(0, 'uk-1', config)).toBe(0)
  })

  it('charges the Highlands the same as everywhere else', () => {
    expect(config.delivery.zone2Surcharge).toBe(0)
    expect(customerDeliveryCharge(15, 'uk-2', config)).toBe(2)
    expect(customerDeliveryCharge(25, 'uk-2', config)).toBe(0)
  })

  it('surcharges Zone 2 on every band, the free one included, when a surcharge is set', () => {
    const surcharged = { ...config, delivery: { ...config.delivery, zone2Surcharge: 1.95 } }
    expect(customerDeliveryCharge(15, 'uk-2', surcharged)).toBe(3.95)
    expect(customerDeliveryCharge(250, 'uk-2', surcharged)).toBe(1.95)
  })

  it('advertises the same threshold it charges', () => {
    // Two fields meaning "free above here" are one edit from disagreeing, and
    // the way you find out is a basket that promises free delivery and bills.
    expect(config.freeDeliveryThreshold).toBe(deriveFreeDeliveryThreshold(config))
    expect(qualifiesForFreeDelivery(config.freeDeliveryThreshold, config)).toBe(true)
    expect(customerDeliveryCharge(config.freeDeliveryThreshold, 'uk-1', config)).toBe(0)
  })

  it('keeps a single product sent alone in profit on both sides of the free line', () => {
    // Our cheapest product, and one just over the line where delivery goes free.
    // Goods at half the shelf price, which is how the shelf price is set.
    for (const shelfPrice of [11.99, 19.99, 20, 24.99]) {
      const e = unitEconomics({ shelfPrice, supplierCost: shelfPrice / 2 }, config)
      expect(e.contribution).toBeGreaterThan(0)
    }
  })

  it('never collects more than the parcel costs', () => {
    // Delivery is a cost recovery, not a product. If a rung ever collected more
    // than the supplier charges, it is a margin decision that deserves saying
    // out loud rather than hiding in a postage line.
    for (const basket of [20, 45, 75, 120, 250]) {
      const quote = quoteDelivery({ grams: 1150, zone: 'uk-1', orderValue: basket }, config)
      expect(quote.customerCharge).toBeLessThanOrEqual(quote.supplierCost)
    }
  })

  it('still absorbs something on every paid band', () => {
    // The plan is to pass SOME on, not all of it. A ladder that fully recovered
    // postage would price the small baskets out.
    const quote = quoteDelivery({ grams: 1150, zone: 'uk-1', orderValue: 15 }, config)
    expect(quote.absorbed).toBeGreaterThan(0)
    expect(quote.customerCharge).toBeGreaterThan(0)
  })

  it('entry charge is the first rung, for the price solver', () => {
    expect(entryDeliveryCharge(config)).toBe(2)
  })
})

describe('checkout delivery options', () => {
  it('offers one UK rate while the Highlands pay the same', () => {
    expect(deliveryOptions(15, config)).toEqual([{ id: 'uk-mainland', zone: 'uk-1', label: 'UK delivery', price: 2 }])
    expect(deliveryOptions(45, config)).toEqual([{ id: 'uk-mainland', zone: 'uk-1', label: 'UK delivery', price: 0 }])
  })

  it('offers a mainland and a Highlands rate once there is a surcharge, even when delivery is free', () => {
    const surcharged = { ...config, delivery: { ...config.delivery, zone2Surcharge: 1.95 } }
    const options = deliveryOptions(150, surcharged)
    expect(options.map((o) => o.id)).toEqual(['uk-mainland', 'uk-highlands'])
    expect(options.map((o) => o.price)).toEqual([0, 1.95])
  })
})

describe('the one rate a subscription can bill', () => {
  // Stripe takes shipping options in payment mode only, so a monthly plan gets
  // no choice of zone — it gets a line item at one rate. That rate has to be the
  // mainland one, because it is what the plan receipt quoted on the way in.
  it('bills the mainland rate the receipt already quoted', () => {
    expect(recurringDeliveryOption(15, config)).toMatchObject({ id: 'uk-mainland', price: 2 })
  })

  it('bills nothing at all above the free line', () => {
    // Null rather than a £0.00 line: an invoice that itemises nothing every
    // month is worse than one that stays quiet about it.
    expect(recurringDeliveryOption(20, config)).toBeNull()
    expect(recurringDeliveryOption(150, config)).toBeNull()
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

  it('collects the surcharge share above the free line when there is one', () => {
    const surcharged = { ...config, delivery: { ...config.delivery, zone2Surcharge: 1.95 } }
    expect(customerDeliveryCharge(250, 'uk-1', surcharged)).toBe(0)
    expect(blendedCustomerCharge(250, surcharged)).toBeGreaterThan(0)
    expect(blendedCustomerCharge(250, config)).toBe(0)
  })

  it('solves a target price against the rung that price lands on', () => {
    /**
     * The solver used to take the delivery charge as a constant. On a ladder it
     * is a step function of the very price being solved for, so a price solved
     * at the £2 rung but landing in the free band would be under-priced by
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
    const impact = freeDeliveryImpact(1150, config)
    expect(impact.bands).toHaveLength(config.delivery.customerRates.length)
    // The free rung is the one that costs us the whole parcel.
    const free = impact.bands.find((b) => b.charge === 0)!
    expect(free.net).toBeCloseTo(-impact.supplierCost, 2)
  })
})
