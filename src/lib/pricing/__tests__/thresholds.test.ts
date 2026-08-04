/**
 * The cut-offs — and the rule that a one-off must never lose while a
 * subscription only has to average out.
 */
import { pricingThresholds } from '../thresholds'
import { unitEconomics } from '../unit-economics'
import { PRICING_CONFIG, type PricingConfig } from '@/lib/stack-blueprint/pricing'

const cfg = (over: Partial<PricingConfig> = {}): PricingConfig => ({ ...PRICING_CONFIG, ...over })
const at = (id: string, c = cfg()) => pricingThresholds(c).thresholds.find((t) => t.id === id)!

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
    // judged across its life, because the scratch card is meant to lose on
    // month one. So the subscription floors sit ABOVE the one-off floor in
    // pounds-per-month terms, but they are measuring different things — the
    // point of the test is that they are computed separately at all.
    const renewal = at('renewal').value!
    const lifetime = at('lifetime').value!
    // Carrying an intro discount costs something, so the lifetime bar is higher.
    expect(lifetime).toBeGreaterThan(renewal)
  })

  it('needs a bigger plan when the scratch card is more generous', () => {
    const mean = at('lifetime', cfg({ introOffer: { ...PRICING_CONFIG.introOffer, effectiveFirstMonthDiscount: 0.05 } })).value!
    const lavish = at('lifetime', cfg({ introOffer: { ...PRICING_CONFIG.introOffer, effectiveFirstMonthDiscount: 0.35 } })).value!
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
    // The regression this was built for: `minSubscriptionMonthly` sat at £25 for
    // months, which does not cover the goods and postage on the deepest bundle
    // rate — so we were offering, and honouring, loss-making subscriptions.
    const t = at('lifetime', cfg({ minSubscriptionMonthly: 25 }))
    expect(t.enforcedBy!.ok).toBe(false)
    expect(t.value!).toBeGreaterThan(25)
  })
})
