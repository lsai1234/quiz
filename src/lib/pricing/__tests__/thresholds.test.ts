/**
 * The cut-offs — and the rule that a one-off must never lose while a
 * subscription only has to average out.
 */
import { pricingThresholds } from '../thresholds'
import { unitEconomics } from '../unit-economics'
import { PRICING_CONFIG, type PricingConfig } from '@/lib/stack-blueprint/pricing'

const cfg = (over: Partial<PricingConfig> = {}): PricingConfig => ({ ...PRICING_CONFIG, ...over })
const at = (id: string, c = cfg()) => pricingThresholds(c).thresholds.find((t) => t.id === id)!

/**
 * The same config with the scratch card running.
 *
 * There is no site-wide first-month discount any more — a partner's code is the
 * only extra discount — so the tests about what an intro offer *costs* need one
 * to exist before they can measure it.
 */
const withCard = (): PricingConfig =>
  cfg({ introOffer: { ...PRICING_CONFIG.introOffer, scratchReveal: { ...PRICING_CONFIG.introOffer.scratchReveal, enabled: true } } })

describe('the cut-offs', () => {
  it('finds a floor for every question', () => {
    for (const t of pricingThresholds(cfg()).thresholds) {
      expect(t.value).not.toBeNull()
      expect(t.value!).toBeGreaterThan(0)
    }
  })

  it('says an order below the floor really does lose money', () => {
    const floor = at('single').value!
    const costRatio = 1 / PRICING_CONFIG.listPricing.markupOnCost
    const contributionAt = (p: number) =>
      unitEconomics({ shelfPrice: p, supplierCost: Math.round(p * costRatio * 100) / 100 }, cfg()).contribution
    // Just under loses, at the floor it pays. The floor is the real edge, not a
    // rounded-up guess.
    expect(contributionAt(floor - 0.5)).toBeLessThan(0)
    expect(contributionAt(floor)).toBeGreaterThanOrEqual(0)
  })

  it('holds a subscription to a gentler test than a one-off', () => {
    // A one-off has to pay on the order in front of you. A subscription is
    // judged across its life, because a first-month offer is meant to lose on
    // month one. So the subscription floors sit ABOVE the one-off floor in
    // pounds-per-month terms, but they are measuring different things — the
    // point of the test is that they are computed separately at all.
    const card = withCard()
    const renewal = at('renewal', card).value!
    const lifetime = at('lifetime', card).value!
    // Carrying an intro discount costs something, so the lifetime bar is higher.
    expect(lifetime).toBeGreaterThan(renewal)
  })

  it('asks no more of a subscription than a renewal when there is no intro offer', () => {
    // Which is where the live config now sits. The lifetime bar is only above
    // the renewal bar because a first month is being given away; take the
    // giveaway out and there is nothing left to carry.
    expect(at('lifetime').value!).toBe(at('renewal').value!)
  })

  it('needs a bigger plan when the first month is more generous', () => {
    const card = withCard()
    const mean = at('lifetime', { ...card, introOffer: { ...card.introOffer, effectiveFirstMonthDiscount: 0.05 } }).value!
    const lavish = at('lifetime', { ...card, introOffer: { ...card.introOffer, effectiveFirstMonthDiscount: 0.35 } }).value!
    expect(lavish).toBeGreaterThan(mean)
  })

  it('needs a bigger order when the supplier charges more to ship', () => {
    const dearer = cfg({
      delivery: {
        ...PRICING_CONFIG.delivery,
        services: PRICING_CONFIG.delivery.services.map((s) => ({ ...s, price: s.price > 0 ? s.price * 2 : 0 })),
      },
    })
    expect(at('single', dearer).value!).toBeGreaterThan(at('single').value!)
  })

  it('drops the floor when we take a bigger markup', () => {
    // More margin per pound means a smaller order can carry the same parcel.
    const fat = at('single', cfg({ listPricing: { ...PRICING_CONFIG.listPricing, markupOnCost: 3 } })).value!
    expect(fat).toBeLessThan(at('single').value!)
  })
})

describe('the settings that enforce them', () => {
  it('is fully enforced as shipped', () => {
    const r = pricingThresholds(cfg())
    expect(r.allEnforced).toBe(true)
  })

  it('catches a minimum order value that lets losing orders through', () => {
    const t = at('one-off', cfg({ minOrderValue: 5 }))
    expect(t.enforcedBy!.ok).toBe(false)
    expect(pricingThresholds(cfg({ minOrderValue: 5 })).allEnforced).toBe(false)
  })

  it('catches a subscription minimum below what a plan needs to survive', () => {
    const t = at('lifetime', cfg({ minSubscriptionMonthly: 5 }))
    expect(t.enforcedBy!.ok).toBe(false)
    expect(t.value!).toBeGreaterThan(5)
  })

  it('charges the member postage on a plan under the free-delivery line', () => {
    // The bug this replaced: the subscription floors assumed we ABSORB postage
    // on every plan. We don't — a plan under `freeDeliveryThreshold` is charged
    // like any other order. Assuming the worst case on the wrong side of our own
    // rule overstated the floor by most of a delivery.
    const floor = at('lifetime').value!
    expect(floor).toBeLessThan(PRICING_CONFIG.freeDeliveryThreshold)
    // Turn the customer charge off and the floor has to rise — proving the
    // charge is really being counted.
    // Every rung free = we absorb the lot.
    const freeLadder = PRICING_CONFIG.delivery.customerRates.map((r) => ({ ...r, price: 0 }))
    const absorbed = at('lifetime', cfg({ delivery: { ...PRICING_CONFIG.delivery, customerRates: freeLadder } })).value!
    expect(absorbed).toBeGreaterThan(floor)
  })
})
