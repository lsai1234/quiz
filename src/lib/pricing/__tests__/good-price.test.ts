import { goodPriceFor, auditProductPrice, worstCaseSubscriptionRate, pricingHorizonMonths, supplierAccountCheck } from '../good-price'
import { unitEconomics, priceForMargin, gradePrice } from '../unit-economics'
import { selectService, quoteDelivery, blendedDeliveryCost, shipmentWeight, eligibleServices } from '../delivery'
import { netFromGross, grossFromNet, revenueFromShelfPrice, costFromSupplierPrice, vatRateFor } from '../vat'
import { PRICING_CONFIG, type PricingConfig } from '@/lib/stack-blueprint/pricing'

/**
 * A config built from the defaults with a few rules overridden.
 *
 * NOTE the shipped default is NOT VAT-registered — that is the phase the
 * business is in, and it changes both sides of every calculation. Tests about
 * VAT mechanics say which they mean rather than relying on the default.
 */
function cfg(over: Partial<PricingConfig> = {}): PricingConfig {
  return { ...PRICING_CONFIG, ...over }
}
const unregistered = () => cfg({ vat: { ...PRICING_CONFIG.vat, registered: false } })
const registered = (over: Partial<PricingConfig> = {}) => ({
  ...cfg(over),
  vat: { ...PRICING_CONFIG.vat, registered: true },
})

describe('VAT', () => {
  it('strips and adds VAT symmetrically', () => {
    expect(netFromGross(30, 0.2)).toBe(25)
    expect(grossFromNet(25, 0.2)).toBe(30)
    expect(netFromGross(0, 0.2)).toBe(0)
  })

  it('uses a product’s own rate when it has one, including zero-rated', () => {
    const c = cfg()
    expect(vatRateFor({ vatRate: null }, c)).toBe(0.2)
    expect(vatRateFor(undefined, c)).toBe(0.2)
    // 0 is a real rate, not "unset" — zero-rated food must not fall back to 20%.
    expect(vatRateFor({ vatRate: 0 }, c)).toBe(0)
  })

  it('registered: we hand VAT over but reclaim what the supplier charged', () => {
    const c = registered()
    expect(revenueFromShelfPrice(30, 0.2, c)).toBe(25)
    expect(costFromSupplierPrice(10, c)).toBe(10)
  })

  it('unregistered: we keep the whole price but eat the supplier’s VAT', () => {
    const c = unregistered()
    expect(revenueFromShelfPrice(30, 0.2, c)).toBe(30)
    expect(costFromSupplierPrice(10, c)).toBe(12)
  })
})

describe('PowerBody’s delivery rate card', () => {
  const c = cfg()

  it('picks the cheapest service that can carry the weight', () => {
    // Under 7kg on the mainland, Royal Mail Tracked 48 at £3.25 beats DPD.
    expect(selectService(500, 'uk-1', c)).toMatchObject({ name: 'Royal Mail Tracked 48', price: 3.25 })
    // Over 7kg only DPD's heavy band is left.
    expect(selectService(8000, 'uk-1', c)).toMatchObject({ name: 'DPD Two Day', price: 5.17 })
  })

  it('charges more to the Highlands and Islands', () => {
    expect(selectService(500, 'uk-2', c)?.price).toBe(4.49)
  })

  it('treats weight bands as (min, max] so a boundary lands in one band only', () => {
    // 1990g is the top of DPD's light band and the bottom of its heavy one.
    const at = eligibleServices(1990, 'uk-1', c).map((s) => s.id)
    expect(at).toContain('dpd-z1-light')
    expect(at).not.toContain('dpd-z1-heavy')
  })

  it('reports when nothing on the card can carry it, rather than pricing it at zero', () => {
    // PowerBody list no Highlands service above 7kg.
    const q = quoteDelivery({ grams: 9000, zone: 'uk-2' }, c)
    expect(q.service).toBeNull()
    expect(q.supplierCost).toBe(0)
    expect(q.unavailableReason).toMatch(/Nothing on the rate card/)
  })

  it('never gives dropshippers free supplier shipping, however big the order', () => {
    // Our own free-delivery offer to the member does not reach PowerBody.
    const q = quoteDelivery({ grams: 1000, zone: 'uk-1', orderValue: 500 }, registered())
    expect(q.customerCharge).toBe(0)
    expect(q.freeForCustomer).toBe(true)
    expect(q.supplierCost).toBe(3.25)
    expect(q.absorbed).toBe(3.25)
  })

  it('collects postage from the member below the free-delivery threshold', () => {
    const q = quoteDelivery({ grams: 1000, zone: 'uk-1', orderValue: 20 }, c)
    expect(q.customerCharge).toBe(3.95)
    expect(q.absorbed).toBe(0)
  })

  it('blends the zones rather than pricing everything at the worst one', () => {
    const blended = blendedDeliveryCost(1000, registered())
    expect(blended).toBeGreaterThan(3.25)
    expect(blended).toBeLessThan(4.49)
    // 96% × £3.25 + 4% × £4.49
    expect(blended).toBeCloseTo(3.3, 2)
  })

  it('falls back to a default weight and says that it guessed', () => {
    expect(shipmentWeight([{ weightGrams: 900, quantity: 2 }], c)).toEqual({ grams: 1800, weightKnown: true })
    expect(shipmentWeight([{ weightGrams: null, quantity: 1 }], c)).toEqual({ grams: 1000, weightKnown: false })
  })

  it('costs the supplier’s VAT into delivery when we cannot reclaim it', () => {
    expect(quoteDelivery({ grams: 1000, zone: 'uk-1' }, unregistered()).supplierCost).toBeCloseTo(3.9, 2)
  })
})

describe('the unit-economics waterfall', () => {
  // VAT mechanics are the subject here, so these run registered; the
  // unregistered path has its own tests above and below.
  const c = registered()

  it('sums every step exactly to the contribution', () => {
    const e = unitEconomics({ shelfPrice: 30, supplierCost: 10, grams: 1000 }, c)
    expect(e.steps[e.steps.length - 1].runningTotal).toBeCloseTo(e.contribution, 2)
    const summed = e.steps.reduce((s, step) => s + step.amount, 0)
    expect(summed).toBeCloseTo(e.contribution, 2)
  })

  it('takes VAT off the top — the error that made every old margin wrong', () => {
    const e = unitEconomics({ shelfPrice: 30, supplierCost: 10, grams: 1000, chargeDelivery: false }, c)
    expect(e.netRevenue).toBe(25)
    expect(e.vat).toBe(5)
    // Naive margin: (30 − 10) / 30 = 67%. Reality is far lower.
    expect(e.marginPct).toBeLessThan(0.5)
  })

  it('counts postage the member pays as revenue, net of its own VAT', () => {
    // £30 is under the £50 free-delivery threshold, so they pay £3.95.
    const e = unitEconomics({ shelfPrice: 30, supplierCost: 10, grams: 1000 }, c)
    expect(e.deliveryCharged).toBe(3.95)
    expect(e.grossRevenue).toBe(33.95)
    expect(e.netRevenue).toBeCloseTo(25 + 3.95 / 1.2, 2)
  })

  it('carries delivery, card fees and a returns provision', () => {
    const e = unitEconomics({ shelfPrice: 60, supplierCost: 10, grams: 1000 }, c)
    expect(e.deliveryCost).toBeGreaterThan(3)
    expect(e.paymentFee).toBeCloseTo(60 * 0.015 + 0.2, 2)
    expect(e.returnsProvision).toBeGreaterThan(0)
    expect(e.contribution).toBeCloseTo(e.netRevenue - e.productCost - e.deliveryCost - e.paymentFee - e.returnsProvision, 2)
  })

  it('spreads delivery over a bundle, which is why bundles pay better', () => {
    const single = unitEconomics({ shelfPrice: 60, supplierCost: 20, grams: 1000, quantity: 1 }, c)
    const triple = unitEconomics({ shelfPrice: 60, supplierCost: 20, grams: 1000, quantity: 3 }, c)
    // Three units, one delivery — so margin per pound improves.
    expect(triple.marginPct).toBeGreaterThan(single.marginPct)
  })

  it('reports margin on net and on gross, so the two are never confused', () => {
    const e = unitEconomics({ shelfPrice: 30, supplierCost: 10, grams: 1000 }, c)
    expect(e.marginOfGrossPct).toBeLessThan(e.marginPct)
  })

  it('flags an estimated cost and an estimated weight', () => {
    const e = unitEconomics({ shelfPrice: 30, grams: null }, c)
    expect(e.assumptions.costKnown).toBe(false)
    expect(e.assumptions.weightKnown).toBe(false)
    expect(e.steps.find((s) => s.id === 'goods')?.estimated).toBe(true)
    expect(e.steps.find((s) => s.id === 'delivery-cost')?.estimated).toBe(true)
  })

  it('solves for a price that hits the target margin exactly', () => {
    const input = { supplierCost: 10, grams: 1000 }
    const price = priceForMargin(0.35, input, c)!
    expect(unitEconomics({ ...input, shelfPrice: price }, c).marginPct).toBeGreaterThanOrEqual(0.35)
  })

  it('breaks even where the contribution is zero', () => {
    const input = { supplierCost: 10, grams: 1000 }
    const price = priceForMargin(0, input, c)!
    expect(unitEconomics({ ...input, shelfPrice: price }, c).contribution).toBeCloseTo(0, 1)
  })

  it('solves a price that agrees with its own delivery assumption', () => {
    // The free-delivery threshold makes the equation piecewise. Whichever branch
    // is returned, feeding it back through the waterfall must reproduce the
    // margin it was solved for — that is the bug this guards.
    for (const supplierCost of [3, 10, 25, 60]) {
      const input = { supplierCost, grams: 1000 }
      const price = priceForMargin(0.35, input, c)!
      expect(unitEconomics({ ...input, shelfPrice: price }, c).marginPct).toBeGreaterThanOrEqual(0.35)
    }
  })

  it('honours a pinned delivery assumption', () => {
    const input = { supplierCost: 10, grams: 1000 }
    const absorbed = priceForMargin(0.35, { ...input, chargeDelivery: false }, c)!
    const collected = priceForMargin(0.35, { ...input, chargeDelivery: true }, c)!
    // Collecting postage means we need less from the goods.
    expect(collected).toBeLessThan(absorbed)
  })

  it('solves correctly when the cost itself is a share of the price', () => {
    const price = priceForMargin(0.35, { grams: 1000 }, c)!
    expect(unitEconomics({ shelfPrice: price, grams: 1000 }, c).marginPct).toBeGreaterThanOrEqual(0.35)
  })

  it('needs a higher price when we cannot reclaim the supplier’s VAT', () => {
    const input = { supplierCost: 10, grams: 1000 }
    expect(priceForMargin(0.35, input, unregistered())!).toBeGreaterThan(priceForMargin(0.35, input, cfg())! * 0.8)
  })

  it('grades a price against the target', () => {
    // £14 on a £10 product looks like a 29% margin and is actually a loss once
    // VAT, PowerBody's £3.25 delivery, card fees and returns come off.
    const cheap = gradePrice({ shelfPrice: 14, supplierCost: 10, grams: 1000, chargeDelivery: false }, 0.35, c)
    expect(cheap.profitable).toBe(false)
    expect(cheap.meetsTarget).toBe(false)
    expect(cheap.vsTarget).toBeLessThan(0)
  })
})

describe('the good price', () => {
  const c = cfg()

  it('prices against the deepest discount any bundle can reach', () => {
    expect(worstCaseSubscriptionRate(c)).toBeCloseTo(0.25, 4)
    expect(worstCaseSubscriptionRate(cfg({ subscriptionTiers: [{ id: 't', label: 'Big', minSubtotal: 100, discountPct: 0.32 }] }))).toBeCloseTo(0.32, 4)
  })

  it('judges a price over the earliest a member can leave', () => {
    expect(pricingHorizonMonths(cfg({ minSubscriptionMonths: 3 }))).toBe(3)
    expect(pricingHorizonMonths(cfg({ goodPricing: { ...PRICING_CONFIG.goodPricing, horizonMonths: 6 } }))).toBe(6)
  })

  it('recommends a price whose worst case still clears the target', () => {
    const r = goodPriceFor({ assetPrice: 10, grams: 1000 }, c)
    expect(r.goodPrice).not.toBeNull()
    const graded = goodPriceFor({ assetPrice: 10, grams: 1000, listPrice: r.goodPrice! }, c)
    expect(graded.atListPrice!.meetsTarget).toBe(true)
    expect(graded.atListPrice!.profitable).toBe(true)
  })

  it('breaks even where the worst case makes nothing', () => {
    const r = goodPriceFor({ assetPrice: 10, grams: 1000 }, c)
    const atBreakEven = goodPriceFor({ assetPrice: 10, grams: 1000, listPrice: r.breakEvenPrice! }, c)
    expect(atBreakEven.scenarios[2].contribution).toBeCloseTo(0, 1)
  })

  it('shows the spread: one-off beats a typical subscriber beats the worst case', () => {
    const r = goodPriceFor({ assetPrice: 10, grams: 1000, listPrice: 40 }, c)
    const [oneOff, typical, worst] = r.scenarios
    expect(oneOff.contribution).toBeGreaterThan(typical.contribution)
    expect(typical.contribution).toBeGreaterThan(worst.contribution)
    expect(r.scenarios.map((s) => s.id)).toEqual(['one-off', 'subscription-typical', 'subscription-worst'])
  })

  it('demands more price as the first-month giveaway grows', () => {
    const lean = goodPriceFor({ assetPrice: 10, grams: 1000 }, cfg({ introOffer: { ...PRICING_CONFIG.introOffer, effectiveFirstMonthDiscount: 0.05 } }))
    const rich = goodPriceFor({ assetPrice: 10, grams: 1000 }, cfg({ introOffer: { ...PRICING_CONFIG.introOffer, effectiveFirstMonthDiscount: 0.4 } }))
    expect(rich.goodPrice!).toBeGreaterThan(lean.goodPrice!)
  })

  it('dilutes the first month over a longer commitment', () => {
    const short = goodPriceFor({ assetPrice: 10, grams: 1000 }, cfg({ minSubscriptionMonths: 1 }))
    const long = goodPriceFor({ assetPrice: 10, grams: 1000 }, cfg({ minSubscriptionMonths: 6 }))
    expect(long.goodPrice!).toBeLessThan(short.goodPrice!)
  })

  it('demands more price for a heavier product', () => {
    const light = goodPriceFor({ assetPrice: 10, grams: 500 }, c)
    const heavy = goodPriceFor({ assetPrice: 10, grams: 9000 }, c)
    expect(heavy.goodPrice!).toBeGreaterThan(light.goodPrice!)
  })

  it('audits a catalogue product, estimating cost and weight when unset', () => {
    const known = auditProductPrice({ title: 'Whey', basePrice: 45, cost: 15, servings: 30, weightGrams: 1000 }, c)
    expect(known.costEstimated).toBe(false)
    expect(known.weightEstimated).toBe(false)

    const guessed = auditProductPrice({ title: 'Mystery', basePrice: 45, cost: null, servings: 30 }, c)
    expect(guessed.costEstimated).toBe(true)
    expect(guessed.weightEstimated).toBe(true)
  })

  it('estimates an unknown cost off the NET price, not the VAT-inclusive one', () => {
    const audit = auditProductPrice({ title: 'X', basePrice: 60, cost: null, servings: 30, weightGrams: 1000 }, registered())
    // 35% of the £50 net price, not of the £60 shelf price.
    expect(audit.monthlyCost.goods).toBeCloseTo(50 * PRICING_CONFIG.defaultCostRatio, 1)
  })

  it('never schedules a shipment further apart than the delivery cap allows', () => {
    const yearly = auditProductPrice({ title: 'Huge tub', basePrice: 60, cost: 20, servings: 365, weightGrams: 1000 }, registered())
    expect(yearly.monthlyCost.goods).toBeCloseTo(20 / PRICING_CONFIG.maxDeliveryMonths, 2)
  })

  it('reports where our price sits against the supplier’s RRP', () => {
    const under = auditProductPrice({ title: 'X', basePrice: 45, cost: 15, weightGrams: 1000, supplierRrp: 50 }, c)
    expect(under.vsRrpPct).toBeCloseTo(0.1, 3) // 10% under RRP
    const noRrp = auditProductPrice({ title: 'X', basePrice: 45, cost: 15, weightGrams: 1000 }, c)
    expect(noRrp.vsRrpPct).toBeNull()
  })
})

describe('the PowerBody account minimum', () => {
  const c = cfg()

  it('works out how many orders a month keep the account open', () => {
    // £35 order at 40% cost = £14 of wholesale spend; £1000 ÷ £14 = 72 orders.
    const check = supplierAccountCheck(35, 40, 0.4, c)
    expect(check.minimumSpend).toBe(1000)
    expect(check.ordersNeeded).toBe(72)
    expect(check.meetsMinimum).toBe(false)
  })

  it('passes once the spend clears the minimum', () => {
    expect(supplierAccountCheck(35, 100, 0.4, c).meetsMinimum).toBe(true)
  })

  it('compares our average order with the one PowerBody suggest', () => {
    expect(supplierAccountCheck(50, 100, 0.4, c).vsTargetOrderValue).toBe(15)
  })
})
