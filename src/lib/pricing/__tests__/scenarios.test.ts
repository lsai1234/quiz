/**
 * Every route a customer can take, and which of them are allowed to lose.
 */
import { checkScenarios } from '../scenarios'
import { unitEconomics } from '../unit-economics'
import { PRICING_CONFIG, type PricingConfig } from '@/lib/stack-blueprint/pricing'
import { blendedCustomerCharge, customerDeliveryCharge } from '@/lib/pricing/delivery'

const cfg = (over: Partial<PricingConfig> = {}): PricingConfig => ({ ...PRICING_CONFIG, ...over })

/**
 * The same config with the scratch card switched on.
 *
 * The card is off in the live config — a partner's code is the only extra
 * discount now — so the `top-card` scenario is not dealt. The two tests below
 * are about how a card that IS running is judged, so they turn it on.
 */
const withCard = (): PricingConfig =>
  cfg({ introOffer: { ...PRICING_CONFIG.introOffer, scratchReveal: { ...PRICING_CONFIG.introOffer.scratchReveal, enabled: true } } })
/** A typical three-item quiz box, priced by the rule. */
const BOX = { listPrice: 90, supplierCost: 45, sharedParcelItems: 3 }

describe('the scenario check', () => {
  it('passes a typical quiz box on every route', () => {
    const check = checkScenarios(BOX, cfg())
    expect(check.ok).toBe(true)
    expect(check.problems).toEqual([])
  })

  it('charges less the deeper the discount, in order', () => {
    const s = checkScenarios(BOX, cfg()).scenarios
    const full = s.find((x) => x.id === 'full')!
    const oneOff = s.find((x) => x.id === 'one-off')!
    const sub = s.find((x) => x.id === 'subscribed')!
    expect(oneOff.paid).toBeLessThan(full.paid)
    expect(sub.paid).toBeLessThan(oneOff.paid)
    expect(sub.keeps).toBeLessThan(full.keeps)
  })

  it('lets the rare top card lose without failing the product', () => {
    // The whole point: one scenario is MEANT to lose. Marking it promotional is
    // what stops "this product is broken" firing on a working intro offer.
    const check = checkScenarios(BOX, withCard())
    const top = check.scenarios.find((s) => s.id === 'top-card')!
    expect(top.promotional).toBe(true)
    expect(top.keeps).toBeLessThan(0)
    expect(check.ok).toBe(true)
    expect(check.problems).not.toContain(top)
  })

  it('averages the first month across the card, and lets it lose', () => {
    // The intro offer is acquisition cost by design, so even the AVERAGED first
    // month is promotional. Demanding it break even would mean not having one.
    const check = checkScenarios(BOX, withCard())
    const first = check.scenarios.find((s) => s.id === 'first-month')!
    const top = check.scenarios.find((s) => s.id === 'top-card')!
    expect(first.promotional).toBe(true)
    // Averaged, so it sits above the worst card and below a plain renewal.
    expect(first.keeps).toBeGreaterThan(top.keeps)
    expect(first.keeps).toBeLessThan(check.scenarios.find((s) => s.id === 'subscribed')!.keeps)
  })

  it('judges a subscription on its whole life, which is NOT promotional', () => {
    // This is the test the business actually agreed to: month one may lose, the
    // subscription may not.
    const check = checkScenarios(BOX, cfg())
    const life = check.scenarios.find((s) => s.id === 'lifetime')!
    const first = check.scenarios.find((s) => s.id === 'first-month')!
    const renewal = check.scenarios.find((s) => s.id === 'subscribed')!
    expect(life.promotional).toBe(false)
    expect(life.keeps).toBeCloseTo(first.keeps + renewal.keeps * (PRICING_CONFIG.orderMix.averageRetentionMonths - 1), 1)
    expect(life.keeps).toBeGreaterThan(0)
  })

  it('leans on the renewals to pay back the first month', () => {
    // With a one-month "life" there are no renewals, so the lifetime IS the
    // intro month — which is what makes retention the thing that funds the offer.
    const oneMonth = checkScenarios(BOX, cfg({ orderMix: { ...PRICING_CONFIG.orderMix, averageRetentionMonths: 1 } }))
    const life = oneMonth.scenarios.find((s) => s.id === 'lifetime')!
    expect(life.keeps).toBe(oneMonth.scenarios.find((s) => s.id === 'first-month')!.keeps)
    // And a longer life is worth strictly more.
    const sixMonths = checkScenarios(BOX, cfg()).scenarios.find((s) => s.id === 'lifetime')!
    expect(sixMonths.keeps).toBeGreaterThan(life.keeps)
  })

  it('fails a box too small to carry its parcel', () => {
    const check = checkScenarios({ listPrice: 8, supplierCost: 4, sharedParcelItems: 1 }, cfg())
    expect(check.ok).toBe(false)
    expect(check.problems.length).toBeGreaterThan(0)
    // …and never blames the promotional card for it.
    expect(check.problems.every((p) => !p.promotional)).toBe(true)
  })

  it('qualifies free delivery on the basket’s worth, not its discounted price', () => {
    // A basket just over the free-delivery line earns a discount that drops it
    // back under. Qualifying on the discounted figure would charge postage the
    // customer was promised they'd avoid.
    const c = cfg()
    const listPrice = c.freeDeliveryThreshold + 2
    const oneOff = checkScenarios({ listPrice, supplierCost: listPrice / 2, sharedParcelItems: 1 }, c)
      .scenarios.find((x) => x.id === 'one-off')!
    // They pay less than the threshold…
    expect(oneOff.paid).toBeLessThan(c.freeDeliveryThreshold)
    // …and still get free delivery, because qualification used what the basket
    // is worth. Compare against the same order priced on the discounted figure.
    const shared = { supplierCost: listPrice / 2, sharedParcelItems: 1 }
    const onWorth = unitEconomics({ shelfPrice: oneOff.paid, ...shared, freeDeliveryBasis: listPrice }, c)
    const onDiscounted = unitEconomics({ shelfPrice: oneOff.paid, ...shared }, c)
    // Qualified on the list value, so the mainland rate is free — what is left
    // is the Highlands surcharge blended over the share of orders that pay one,
    // which no free-delivery offer removes (PowerBody's Zone 2 free line is
    // £300 of wholesale).
    expect(onWorth.deliveryCharged).toBe(blendedCustomerCharge(listPrice, c))
    expect(customerDeliveryCharge(listPrice, 'uk-1', c)).toBe(0)
    // Qualified on the discounted price instead, it pays a real postage rung —
    // strictly more, which is the whole point of the distinction.
    expect(onDiscounted.deliveryCharged).toBe(blendedCustomerCharge(oneOff.paid, c))
    expect(onDiscounted.deliveryCharged).toBeGreaterThan(onWorth.deliveryCharged)
  })

  it('keeps more when the box is shared between more products', () => {
    const alone = checkScenarios({ ...BOX, sharedParcelItems: 1 }, cfg())
    const shared = checkScenarios({ ...BOX, sharedParcelItems: 5 }, cfg())
    const keeps = (c: typeof alone) => c.scenarios.find((s) => s.id === 'subscribed')!.keeps
    expect(keeps(shared)).toBeGreaterThan(keeps(alone))
  })
})
