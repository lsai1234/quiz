import { OFFER_FLOOR, UNCOSTED_MAX_DISCOUNT, floorFor, offerProductFor, quoteOffer } from '../economics'
import { unitEconomics } from '@/lib/pricing/unit-economics'
import { getPricingConfig, priceOneOffLines } from '@/lib/stack-blueprint/pricing'

/**
 * The last-chance offer's discount. One promise matters above every other: the
 * order it quotes makes money after every cost the business models, so these
 * tests check the quote against `unitEconomics` directly rather than against
 * numbers copied out of it.
 */

function contributionAt(price: number, supplierCost: number | null, listPrice = price) {
  return unitEconomics({ shelfPrice: price, supplierCost, freeDeliveryBasis: listPrice }).contribution
}

describe('the discount it picks', () => {
  it('goes as deep as the floor allows on a product with room, and no deeper', () => {
    const q = quoteOffer({ price: 34.99, supplierCost: 12 })
    expect(q.discountPct).toBeGreaterThan(0)
    expect(q.viable).toBe(true)
    expect(q.contribution).toBeGreaterThanOrEqual(q.floor)
    // The next rung down the ladder would have broken the floor, or there is none.
    const deeper = [20, 15, 10, 5].filter((d) => d > q.discountPct)
    for (const d of deeper) {
      const price = Math.round(34.99 * (1 - d / 100) * 100) / 100
      expect(contributionAt(price, 12, 34.99)).toBeLessThan(floorFor(unitEconomics({ shelfPrice: price, supplierCost: 12, freeDeliveryBasis: 34.99 }).netRevenue))
    }
  })

  it('never quotes an order that loses money, across a spread of prices and costs', () => {
    for (const price of [9.99, 12.99, 17.99, 24.99, 29.99, 34.99, 44.99, 59.99, 89.99]) {
      for (const ratio of [0.3, 0.45, 0.55, 0.7]) {
        const cost = Math.round(price * ratio * 100) / 100
        const q = quoteOffer({ price, supplierCost: cost })
        // Re-derived independently: what the order really makes at the offer price.
        const made = contributionAt(q.offerPrice, cost, price)
        expect(made).toBe(q.contribution)
        // An offer is only made when viable, and a viable one always clears the floor.
        if (q.viable) expect(made).toBeGreaterThanOrEqual(Math.max(OFFER_FLOOR.minContribution, q.floor))
      }
    }
  })

  it('quotes exactly what the checkout will charge, tier and margin floor included', () => {
    for (const [price, cost] of [[24.99, 11], [54.99, 22], [79.99, 30]] as const) {
      const q = quoteOffer({ price, supplierCost: cost })
      const rate = q.discountPct / 100
      // /api/cart prices a one-line order with priceOneOffLines and the rate applied as a code.
      const charged = priceOneOffLines([{ price, cost, quantity: 1 }], getPricingConfig(), rate).total
      expect(Math.abs(charged - q.offerPrice)).toBeLessThan(0.02)
    }
  })

  it('will not offer an order the checkout would refuse as under the minimum', () => {
    const q = quoteOffer({ price: 14.99, supplierCost: 3 })
    expect(q.offerPrice).toBeLessThan(getPricingConfig().minOrderValue)
    expect(q.viable).toBe(false)
  })

  it('reads its inputs from the catalogue the way the order does', () => {
    const input = offerProductFor({ cost: 9, basePrice: 30, weightGrams: 900, vatRate: null }, { price: 29.99, cost: 11 })
    expect(input).toMatchObject({ price: 29.99, supplierCost: 11, floorCost: 9, grams: 900 })
  })

  it('offers nothing off a cheap product that barely pays at full price', () => {
    const q = quoteOffer({ price: 11.99, supplierCost: 6 })
    expect(q.discountPct).toBe(0)
    expect(q.viable).toBe(false)
  })

  it('caps the discount when the cost is only an estimate', () => {
    const q = quoteOffer({ price: 59.99, supplierCost: null })
    expect(q.costKnown).toBe(false)
    expect(q.discountPct / 100).toBeLessThanOrEqual(UNCOSTED_MAX_DISCOUNT)
  })

  it('never goes to 25%, which is the daily code’s', () => {
    expect(quoteOffer({ price: 99.99, supplierCost: 10 }).discountPct).toBeLessThanOrEqual(20)
  })
})

describe('what the customer is told', () => {
  it('charges delivery on the list price, as checkout does, so the discount is never eaten by postage', () => {
    // £42.99 is in the £2.95 band; 10% off takes the price under £40, but the
    // band is read on what the order is worth, so postage stays £2.95.
    const q = quoteOffer({ price: 42.99, supplierCost: 14 }, { ladder: [0.1] })
    expect(q.offerPrice).toBe(38.69)
    expect(q.deliveryCharge).toBe(2.95)
    expect(q.total).toBe(41.64)
    expect(q.saving).toBe(4.3)
    expect(q.totalSaving).toBe(4.3)
  })

  it('uses the larger of the pound and percentage floors', () => {
    expect(floorFor(20)).toBe(3)
    expect(floorFor(80)).toBe(8)
  })
})
