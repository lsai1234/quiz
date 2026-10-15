import {
  REDUCED_DELIVERY_PRICES,
  describeDeal,
  floorFor,
  offerDeliveryOptions,
  offerProductFor,
  ordinaryPriceOf,
  priceOfferOrder,
  publicQuote,
  quoteOffer,
  type OfferQuote,
} from '../economics'
import { unitEconomics } from '@/lib/pricing/unit-economics'
import { customerDeliveryCharge } from '@/lib/pricing/delivery'
import { PRICING_CONFIG, type PricingConfig } from '@/lib/stack-blueprint/pricing'

/**
 * The last-chance deal. One promise matters above every other: the order it
 * quotes makes money after every cost the business models — so these tests
 * check the quote against `unitEconomics` directly rather than against
 * numbers copied out of it, and run twice: with PowerBody's VAT as a cost (as
 * shipped) and without it, so a path that stopped passing the config through
 * cannot hide behind whichever default happens to be set.
 */

const r2 = (n: number) => Math.round(n * 100) / 100

/** Every price × cost pairing worth asking about, from a cheap tub to a big one. */
const GRID: Array<[number, number]> = []
for (const price of [12.99, 15.99, 17.99, 19.99, 22.99, 24.99, 29.99, 34.99, 39.99, 44.99, 49.99, 59.99, 79.99, 109.99]) {
  for (const ratio of [0.3, 0.4, 0.5, 0.55, 0.62, 0.7]) GRID.push([price, r2(price * ratio)])
}

const withVat = (supplierChargesVat: boolean): PricingConfig => ({ ...PRICING_CONFIG, vat: { ...PRICING_CONFIG.vat, supplierChargesVat } })

describe.each([
  ['PowerBody’s VAT a cost (as shipped)', withVat(true)],
  ['no VAT on our costs', withVat(false)],
])('with %s', (_name, config) => {

/** What an order really makes at this price and mainland delivery charge. */
function made(price: number, supplierCost: number | null, deliveryCharge: number) {
  return unitEconomics({ shelfPrice: price, supplierCost, customerDelivery: deliveryCharge }, config)
}
function clears(price: number, supplierCost: number | null, deliveryCharge: number) {
  const e = made(price, supplierCost, deliveryCharge)
  return e.contribution >= floorFor(e.netRevenue, config.lastChance) && price >= config.minOrderValue
}
const quotes = GRID.map(([price, cost]) => ({ price, cost, q: quoteOffer({ price, supplierCost: cost }, config) }))

describe('the order the levers are pulled in', () => {
  it('waives delivery before it takes anything off the product', () => {
    for (const { q } of quotes.filter(({ q }) => q.viable && q.discountPct > 0)) {
      expect(q.deliveryCharge).toBe(0)
      expect(['free', 'included']).toContain(q.deliveryDeal)
    }
  })

  it('goes as deep as the floor allows once delivery is free, and no deeper', () => {
    const cap = Math.round(config.lastChance.maxDiscountPct * 100)
    for (const { cost, q } of quotes.filter(({ q }) => q.viable && q.discountPct > 0)) {
      expect(clears(q.offerPrice, cost, 0)).toBe(true)
      if (q.discountPct < cap) expect(clears(r2(q.basePrice * (1 - (q.discountPct + 1) / 100)), cost, 0)).toBe(false)
    }
  })

  it('reduces delivery instead when free delivery would lose money — and adds nothing off on top', () => {
    const reduced = quotes.filter(({ q }) => q.viable && q.deliveryDeal === 'reduced')
    expect(reduced.length).toBeGreaterThan(0)
    for (const { cost, q } of reduced) {
      expect(q.discountPct).toBe(0)
      expect(q.offerPrice).toBe(q.basePrice)
      expect(REDUCED_DELIVERY_PRICES).toContain(q.deliveryCharge)
      expect(q.deliveryCharge).toBeLessThan(q.standardDelivery)
      // Free would not have cleared, and nor would the next price down.
      expect(clears(q.basePrice, cost, 0)).toBe(false)
      const lower = REDUCED_DELIVERY_PRICES.filter((p) => p < q.deliveryCharge)
      if (lower.length) expect(clears(q.basePrice, cost, lower[lower.length - 1])).toBe(false)
    }
  })

  it('offers free delivery on its own when there is no worthwhile percentage on top', () => {
    const least = Math.round(config.lastChance.minDiscountPct * 100)
    for (const { q } of quotes) expect(q.discountPct === 0 || q.discountPct >= least).toBe(true)
    expect(quotes.some(({ q }) => q.viable && q.deliveryDeal === 'free' && q.discountPct === 0)).toBe(true)
    expect(quotes.some(({ q }) => q.viable && q.deliveryDeal === 'free' && q.discountPct > 0)).toBe(true)
  })

  it('takes a percentage off a product whose delivery is free anyway', () => {
    const q = quoteOffer({ price: 109.99, supplierCost: 40 }, config)
    expect(q.standardDelivery).toBe(0)
    expect(q.deliveryDeal).toBe('included')
    expect(q.discountPct).toBeGreaterThan(0)
  })
})

describe('it never sells at a loss', () => {
  it('quotes exactly what the order makes, and every deal clears the floor', () => {
    for (const { cost, q } of quotes) {
      const e = made(q.offerPrice, cost, q.deliveryCharge)
      expect(q.contribution).toBe(e.contribution)
      if (q.viable) {
        expect(q.contribution).toBeGreaterThanOrEqual(q.floor)
        expect(q.floor).toBeGreaterThanOrEqual(config.lastChance.minContribution)
      }
    }
  })

  it('makes no deal on a product that does not pay its way at full price', () => {
    const q = quoteOffer({ price: 11.99, supplierCost: 6 }, config)
    expect(q.viable).toBe(false)
    expect(q.totalSaving).toBe(0)
  })

  it('will not offer an order the checkout would refuse as under the minimum', () => {
    for (const { q } of quotes.filter(({ q }) => q.viable)) expect(q.offerPrice).toBeGreaterThanOrEqual(config.minOrderValue)
  })

  it('caps the percentage when the cost is only an estimate', () => {
    const q = quoteOffer({ price: 79.99, supplierCost: null }, config)
    expect(q.costKnown).toBe(false)
    expect(q.discountPct / 100).toBeLessThanOrEqual(config.lastChance.uncostedMaxDiscountPct)
  })

  it('estimates an unknown cost once, from the shelf price — a discount never makes the goods cheaper', () => {
    for (const price of [19.99, 25.99, 34.99, 59.99]) {
      const q = quoteOffer({ price, supplierCost: null }, config)
      // What the goods would be guessed at, at full price: the same guess the
      // deal has to clear the floor against, whatever it takes off.
      const atFull = unitEconomics({ shelfPrice: price, supplierCost: null }, config)
      const estimate = r2(atFull.shelfPrice * config.defaultCostRatio)
      if (!q.viable) continue
      expect(clears(q.offerPrice, estimate, q.deliveryCharge)).toBe(true)
    }
  })

  it('never goes past the deepest percentage in settings', () => {
    const q = quoteOffer({ price: 99.99, supplierCost: 10 }, config)
    expect(q.discountPct).toBe(Math.round(config.lastChance.maxDiscountPct * 100))
  })

  it('follows the floor in settings: a smaller floor buys a better deal', () => {
    const tight = quoteOffer({ price: 34.99, supplierCost: 14 }, config)
    const loose = quoteOffer({ price: 34.99, supplierCost: 14 }, config, { ...config.lastChance, minContribution: 1, minMarginPct: 0 })
    expect(loose.total).toBeLessThanOrEqual(tight.total)
    expect(loose.contribution).toBeGreaterThanOrEqual(1)
  })
})

describe('what the customer is told', () => {
  it('is always better than buying it the ordinary way, by at least £1 — and says so against that', () => {
    for (const { price, cost, q } of quotes.filter(({ q }) => q.viable)) {
      const ordinary = r2(ordinaryPriceOf({ price, supplierCost: cost }, config) + customerDeliveryCharge(price, 'uk-1', config))
      // The struck-through figure IS the ordinary checkout's, so the saving
      // the card states is the saving the customer actually gets.
      expect(q.normalTotal).toBe(ordinary)
      expect(r2(ordinary - q.total)).toBeGreaterThanOrEqual(1)
      expect(q.totalSaving).toBe(r2(ordinary - q.total))
    }
  })

  it('takes the percentage off what a £50+ product already costs alone, not off the shelf', () => {
    const q = quoteOffer({ price: 59.99, supplierCost: 22 }, config)
    expect(q.basePrice).toBeLessThan(q.listPrice) // the bundle tier it earns on its own
    expect(q.offerPrice).toBe(r2(q.basePrice * (1 - q.discountPct / 100)))
    expect(q.saving).toBe(r2(q.basePrice - q.offerPrice))
  })

  it('adds up: product plus delivery is the total, and the savings are the difference', () => {
    for (const { q } of quotes) {
      expect(q.total).toBe(r2(q.offerPrice + q.deliveryCharge))
      expect(q.normalTotal).toBe(r2(q.basePrice + q.standardDelivery))
      expect(q.totalSaving).toBe(r2(q.normalTotal - q.total))
      expect(r2(q.saving + q.deliverySaving)).toBe(q.totalSaving)
    }
  })

  it('reads its inputs from the catalogue the way the order does', () => {
    const input = offerProductFor({ cost: 9, weightGrams: 900, vatRate: null }, { price: 29.99, cost: 11 })
    expect(input).toEqual({ price: 29.99, supplierCost: 11, grams: 900, vatRate: null })
  })

  it('uses the larger of the pound and percentage floors', () => {
    const s = { ...config.lastChance, minContribution: 3, minMarginPct: 0.1 }
    expect(floorFor(20, s)).toBe(3)
    expect(floorFor(80, s)).toBe(8)
  })

  it('says the deal in a few words', () => {
    const base = { standardDelivery: 4.95, deliveryCharge: 0 }
    expect(describeDeal({ ...base, deliveryDeal: 'free', discountPct: 15 })).toBe('free delivery (was £4.95) + 15% off')
    expect(describeDeal({ ...base, deliveryDeal: 'reduced', deliveryCharge: 1.49, discountPct: 0 })).toBe('delivery £1.49 (was £4.95)')
    expect(describeDeal({ ...base, standardDelivery: 0, deliveryDeal: 'included', discountPct: 20 })).toBe('20% off')
  })
})

})

describe('what the checkout bills', () => {
  const config = PRICING_CONFIG
  const quotes = GRID.map(([price, cost]) => ({ price, cost, q: quoteOffer({ price, supplierCost: cost }, config) }))
  const free = quotes.find(({ q }) => q.viable && q.deliveryDeal === 'free' && q.discountPct > 0)!.q
  const cut = quotes.find(({ q }) => q.viable && q.deliveryDeal === 'reduced')!.q

  it('prices the order from the deal alone — no tier, no code', () => {
    const priced = priceOfferOrder(free)
    expect(priced.lines).toEqual([{ unitPrice: free.listPrice, discountedUnitPrice: free.offerPrice, quantity: 1, lineTotal: free.offerPrice }])
    expect(priced.total).toBe(free.offerPrice)
    expect(priced.subtotal).toBe(free.listPrice)
    expect(priced.tierPct).toBe(0)
    expect(priced.partnerPct).toBe(0)
  })

  it('offers its own delivery: the deal on the mainland, plus the surcharge up north', () => {
    const surcharge = config.delivery.zone2Surcharge
    const [mainland, highlands] = offerDeliveryOptions(free)
    expect(mainland).toMatchObject({ id: 'uk-mainland', price: 0, label: 'Free UK mainland delivery' })
    expect(highlands).toMatchObject({ id: 'uk-highlands', price: surcharge })
    const [m2, h2] = offerDeliveryOptions(cut)
    expect(m2.price).toBe(cut.deliveryCharge)
    expect(h2.price).toBe(r2(cut.deliveryCharge + surcharge))
  })

  it('sends a browser the deal but none of our own figures', () => {
    const pub = publicQuote(free) as Partial<OfferQuote>
    expect(pub.total).toBe(free.total)
    expect(pub).not.toHaveProperty('contribution')
    expect(pub).not.toHaveProperty('marginPct')
    expect(pub).not.toHaveProperty('floor')
    expect(pub).not.toHaveProperty('costKnown')
  })
})

describe('unitEconomics with a deal’s own delivery', () => {
  const config = PRICING_CONFIG
  it('models the standard charge exactly as the bands do', () => {
    for (const price of [19.99, 44.99, 120]) {
      const banded = unitEconomics({ shelfPrice: price, supplierCost: price / 2 })
      const set = unitEconomics({ shelfPrice: price, supplierCost: price / 2, customerDelivery: customerDeliveryCharge(price, 'uk-1') })
      expect(set.deliveryCharged).toBe(banded.deliveryCharged)
      expect(set.contribution).toBe(banded.contribution)
    }
  })

  it('still collects the Highlands surcharge, blended, when the mainland is free', () => {
    const e = unitEconomics({ shelfPrice: 29.99, supplierCost: 15, customerDelivery: 0 })
    expect(e.deliveryCharged).toBe(r2(config.delivery.zone2SharePct * config.delivery.zone2Surcharge))
  })
})
