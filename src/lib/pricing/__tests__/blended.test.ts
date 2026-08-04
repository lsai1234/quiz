import { blendedEconomics, averageBundleDiscount } from '../blended'
import { commissionOn, lifetimeCommission } from '../commission'
import { PRICING_CONFIG, type PricingConfig } from '@/lib/stack-blueprint/pricing'

const cfg = (over: Partial<PricingConfig> = {}): PricingConfig => ({ ...PRICING_CONFIG, ...over })

/** A representative basket at roughly what the model recommends for it. */
const BASKET = { shelfPrice: 103, supplierCost: 30, grams: 2500 }

describe('commission', () => {
  it('is a share of net revenue, by kind', () => {
    const c = cfg()
    expect(commissionOn(100, 'first', c).amount).toBe(20)
    expect(commissionOn(100, 'renewal', c).amount).toBe(10)
  })

  it('costs more when the partner is VAT-registered and we cannot reclaim', () => {
    const eating = cfg({ partners: { ...PRICING_CONFIG.partners, partnersChargeVat: true } })
    const c = commissionOn(100, 'first', eating)
    expect(c.amount).toBe(20) // what they earn
    expect(c.cost).toBe(24) // what it costs us
  })

  it('stops costing more once we can reclaim', () => {
    const reclaiming = cfg({
      partners: { ...PRICING_CONFIG.partners, partnersChargeVat: true },
      vat: { ...PRICING_CONFIG.vat, registered: true },
    })
    expect(commissionOn(100, 'first', reclaiming).cost).toBe(20)
  })

  it('pays renewals only for the agreed window', () => {
    const c = cfg()
    // A customer who stays 24 months earns the partner 12 renewals, not 23.
    const long = lifetimeCommission(100, 80, 24, c)
    expect(long.monthsPaid).toBe(12)
    expect(long.total).toBe(20 + 8 * 12)

    // Someone who leaves after 3 months earns 2 renewals.
    expect(lifetimeCommission(100, 80, 3, c).monthsPaid).toBe(2)
    // And someone who never renews earns only the first order.
    expect(lifetimeCommission(100, 80, 1, c).total).toBe(20)
  })
})

describe('the average order', () => {
  it('weights the bundle discount across the mix rather than taking the worst', () => {
    const avg = averageBundleDiscount(cfg())
    const ladder = PRICING_CONFIG.levelSubscriptionDiscount
    // Strictly between the smallest and biggest rates, whatever they are.
    expect(avg).toBeGreaterThan(ladder.essentials)
    expect(avg).toBeLessThan(ladder.complete)
  })

  it('makes money at the shipped settings', () => {
    const b = blendedEconomics(BASKET, cfg())
    expect(b.profitable).toBe(true)
    expect(b.perOrder).toBeGreaterThan(0)
    expect(b.marginPct).toBeGreaterThan(0)
  })

  it('covers every combination of channel and attribution', () => {
    const b = blendedEconomics(BASKET, cfg())
    expect(b.cases.map((c) => c.label).sort()).toEqual([
      'One-off, direct',
      'One-off, via a partner',
      'Subscription, direct',
      'Subscription, via a partner',
    ])
    // The weights are shares of all orders and must account for all of them.
    expect(b.cases.reduce((s, c) => s + c.weight, 0)).toBeCloseTo(1, 3)
  })

  it('drops a case that cannot happen rather than showing it at zero', () => {
    const noPartners = cfg({ orderMix: { ...PRICING_CONFIG.orderMix, attributedShare: 0 } })
    const labels = blendedEconomics(BASKET, noPartners).cases.map((c) => c.label)
    expect(labels).not.toContain('One-off, via a partner')
    expect(labels).not.toContain('Subscription, via a partner')
  })

  it('costs more per order as partners take a bigger share', () => {
    const low = blendedEconomics(BASKET, cfg({ orderMix: { ...PRICING_CONFIG.orderMix, attributedShare: 0.1 } }))
    const high = blendedEconomics(BASKET, cfg({ orderMix: { ...PRICING_CONFIG.orderMix, attributedShare: 0.9 } }))
    expect(high.commissionPerOrder).toBeGreaterThan(low.commissionPerOrder)
    expect(high.perOrder).toBeLessThan(low.perOrder)
  })

  it('still makes money even if EVERY order came through a partner', () => {
    // The whole point. An unknown attribution share is only a risk if some level
    // of it loses money — and none does.
    const all = cfg({ orderMix: { ...PRICING_CONFIG.orderMix, attributedShare: 1 } })
    expect(blendedEconomics(BASKET, all).profitable).toBe(true)
  })

  it('reports that partner share cannot break the average', () => {
    const b = blendedEconomics(BASKET, cfg())
    const lever = b.breakEven.find((l) => l.lever === 'Orders through partners')!
    // null = nothing in range breaks it, which is the answer worth having.
    expect(lever.breaksAt).toBeNull()
  })

  it('sweeps subscriber life downwards, because that is the direction it hurts', () => {
    // A headroom table that only walked levers upwards would report the most
    // load-bearing assumption in the model as perfectly safe by construction.
    const life = blendedEconomics(BASKET, cfg()).breakEven.find((l) => l.lever === 'Average subscriber life')!
    expect(life.unit).toBe('months')
    // Either it cannot break it (headroom null) or it breaks BELOW where we are.
    if (life.breaksAt != null) expect(life.breaksAt).toBeLessThan(life.current)
  })

  it('watches the supplier, which is the one lever we do not control', () => {
    const cost = blendedEconomics(BASKET, cfg()).breakEven.find((l) => l.lever === 'What PowerBody charge us')!
    expect(cost.unit).toBe('currency')
    expect(cost.current).toBe(BASKET.supplierCost)
    expect(cost.breaksAt).not.toBeNull()
    // They would have to raise prices substantially, not marginally.
    expect(cost.breaksAt!).toBeGreaterThan(BASKET.supplierCost * 1.5)
  })

  it('cannot be broken by the first-month discount alone, at this retention', () => {
    // Worth pinning, because it is counter-intuitive. The intro offer only
    // touches month one; spread over a six-month subscription — and absent
    // entirely from one-off orders — even giving the first month away free
    // leaves the average positive. Retention is doing the work.
    const b = blendedEconomics(BASKET, cfg())
    expect(b.breakEven.find((l) => l.lever === 'Average first-month discount')!.breaksAt).toBeNull()

    const free = cfg({ introOffer: { ...PRICING_CONFIG.introOffer, effectiveFirstMonthDiscount: 1 } })
    expect(blendedEconomics(BASKET, free).profitable).toBe(true)
  })

  it('finds the break-even when retention stops covering for it', () => {
    // Strip the renewals away and the first month is the whole relationship —
    // now the intro discount can and does break the average.
    const fragile = cfg({ orderMix: { ...PRICING_CONFIG.orderMix, averageRetentionMonths: 1 } })
    const lever = blendedEconomics(BASKET, fragile).breakEven.find(
      (l) => l.lever === 'Average first-month discount',
    )!
    expect(lever.breaksAt).not.toBeNull()
    expect(lever.breaksAt!).toBeGreaterThan(lever.current)
  })

  it('turns unprofitable when a lever is pushed past its break-even', () => {
    // The general property: wherever the sweep reports a break, going past it
    // really does break. Asserted against every lever that reports one rather
    // than a named lever, so the test survives the numbers moving — including
    // the ones swept downwards and the one that lives on the input, not config.
    const fragile = cfg({ orderMix: { ...PRICING_CONFIG.orderMix, averageRetentionMonths: 1 } })
    const breakable = blendedEconomics(BASKET, fragile).breakEven.filter((l) => l.breaksAt != null)
    expect(breakable.length).toBeGreaterThan(0)

    for (const lever of breakable) {
      // Step further in whatever direction the sweep was walking.
      const down = lever.breaksAt! < lever.current
      const step = lever.unit === 'currency' ? lever.breaksAt! * 0.1 : lever.unit === 'months' ? 1 : 0.05
      const past = down ? Math.max(0, lever.breaksAt! - step) : lever.breaksAt! + step

      let input = BASKET
      let c = fragile
      switch (lever.lever) {
        case 'Orders through partners':
          c = { ...c, orderMix: { ...c.orderMix, attributedShare: Math.min(1, past) } }; break
        case 'Commission on a first order':
          c = { ...c, partners: { ...c.partners, firstOrderPct: Math.min(1, past) } }; break
        case 'Average subscriber life':
          c = { ...c, orderMix: { ...c.orderMix, averageRetentionMonths: Math.max(1, Math.round(past)) } }; break
        case 'What PowerBody charge us':
          input = { ...BASKET, supplierCost: past }; break
        case 'Average first-month discount':
          c = { ...c, introOffer: { ...c.introOffer, effectiveFirstMonthDiscount: Math.min(1, past) } }; break
        case 'Biggest bundle discount':
          c = { ...c, levelSubscriptionDiscount: { ...c.levelSubscriptionDiscount, complete: Math.min(1, past) } }; break
        case 'Orders returned':
          c = { ...c, returns: { ...c.returns, ratePct: Math.min(1, past) } }; break
        default:
          throw new Error(`Unhandled lever in the break-even test: ${lever.lever}`)
      }
      expect(blendedEconomics(input, c).profitable).toBe(false)
    }
  })

  it('values a customer over their life, not just one order', () => {
    const b = blendedEconomics(BASKET, cfg())
    expect(b.perCustomer).toBeGreaterThan(b.perOrder)
  })

  it('values a customer more the longer they stay', () => {
    const short = blendedEconomics(BASKET, cfg({ orderMix: { ...PRICING_CONFIG.orderMix, averageRetentionMonths: 2 } }))
    const long = blendedEconomics(BASKET, cfg({ orderMix: { ...PRICING_CONFIG.orderMix, averageRetentionMonths: 18 } }))
    expect(long.perCustomer).toBeGreaterThan(short.perCustomer)
  })

  it('shows an attributed order earning less than a direct one', () => {
    const b = blendedEconomics(BASKET, cfg())
    const direct = b.cases.find((c) => c.label === 'Subscription, direct')!
    const partner = b.cases.find((c) => c.label === 'Subscription, via a partner')!
    expect(partner.contribution).toBeLessThan(direct.contribution)
    expect(partner.commission).toBeGreaterThan(0)
    expect(direct.commission).toBe(0)
    // …but still positive, which is what makes any attribution share safe.
    expect(partner.contribution).toBeGreaterThan(0)
  })

  it('reports what it assumed, so a guess is never shown as a fact', () => {
    const b = blendedEconomics(BASKET, cfg())
    expect(b.assumptions.attributedShare).toBe(PRICING_CONFIG.orderMix.attributedShare)
    expect(b.assumptions.averageRetentionMonths).toBe(PRICING_CONFIG.orderMix.averageRetentionMonths)
    expect(b.assumptions.averageBundleDiscount).toBeGreaterThan(0)
  })
})
