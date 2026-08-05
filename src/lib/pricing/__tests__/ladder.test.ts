/**
 * The invariant that was broken in production and that nothing caught:
 * subscribing has to beat buying once, at every bundle size.
 */
import { checkLadder, HEALTHY_ADVANTAGE_PP } from '../ladder'
import { PRICING_CONFIG, type PricingConfig, type DiscountTier } from '@/lib/stack-blueprint/pricing'

const cfg = (over: Partial<PricingConfig> = {}): PricingConfig => ({ ...PRICING_CONFIG, ...over })
// A representative shelf price per product, near the catalogue average.
const AVG = 25

describe('the discount ladder', () => {
  it('has every rung individually healthy as shipped', () => {
    const check = checkLadder(AVG, cfg())
    for (const r of check.rungs) expect(r.warning).toBeNull()
    expect(check.rungs.every((r) => r.healthy)).toBe(true)
  })

  it('gives a bigger reason to subscribe the bigger the bundle', () => {
    // The advantage growing with stack size is what makes the ladder pull in the
    // same direction as the bundle sizes, rather than against them.
    const [essentials, performance, complete] = checkLadder(AVG, cfg()).rungs
    expect(performance.advantage).toBeGreaterThan(essentials.advantage)
    expect(complete.advantage).toBeGreaterThan(performance.advantage)
    expect(essentials.advantage).toBeGreaterThanOrEqual(HEALTHY_ADVANTAGE_PP)
  })

  it('always charges a subscriber less than someone buying once', () => {
    for (const r of checkLadder(AVG, cfg()).rungs) {
      expect(r.paysSubscribed).toBeLessThan(r.paysOneOff)
    }
  })

  it('catches the collision that actually happened', () => {
    // The old settings: one-off tiers laddering to 20% at £120, against a 15%
    // subscription rate — so a 5-item stack paid MORE to subscribe.
    const old = checkLadder(
      AVG,
      cfg({
        levelSubscriptionDiscount: { essentials: 0.1, performance: 0.15, complete: 0.2 },
        bundleTiers: [
          { id: 'a', label: '£50+', minSubtotal: 50, discountPct: 0.1 },
          { id: 'b', label: '£90+', minSubtotal: 90, discountPct: 0.15 },
          { id: 'c', label: '£120+', minSubtotal: 120, discountPct: 0.2 },
        ] as DiscountTier[],
      }),
    )
    expect(old.coherent).toBe(false)
    const performance = old.rungs.find((r) => r.level === 'performance')!
    expect(performance.advantage).toBeLessThan(0)
    expect(performance.warning).toMatch(/Subscribing COSTS the member/)
    // And the flat rungs are flagged too — 0pp is no reason to commit.
    expect(old.rungs.filter((r) => !r.healthy).length).toBe(3)
  })

  it('reports how deep a discount the prices can actually carry', () => {
    // Prices are cost × markup and floored at cost × (1 + marginFloor), so the
    // ceiling falls straight out of two numbers we set ourselves — no RRP, no
    // supplier suggestion, nothing that can change under us.
    const check = checkLadder(AVG, cfg())
    const expected = 1 - (1 + PRICING_CONFIG.marginFloorPct) / PRICING_CONFIG.listPricing.markupOnCost
    expect(check.deepestPossibleDiscount).toBeCloseTo(expected, 4)
  })

  it('lets the intro offer pay out in full, loss and all', () => {
    // The top card asks for more off than a 2× price can carry inside the margin
    // floor — and that is fine, because the floor does not apply to the intro
    // offer. The deep card is a rationed, deliberate loss; clipping it would
    // advertise 40% and hand back less.
    const check = checkLadder(AVG, cfg())
    expect(PRICING_CONFIG.introOffer.respectMarginFloor).toBe(false)
    expect(check.deepestOffered).toBeGreaterThan(check.deepestPossibleDiscount)
    expect(check.clipped).toBeNull()
    expect(check.coherent).toBe(true)
  })

  it('flags a clip only when the floor really does apply', () => {
    const floored = checkLadder(
      AVG,
      cfg({ introOffer: { ...PRICING_CONFIG.introOffer, respectMarginFloor: true } }),
    )
    expect(floored.clipped).not.toBeNull()
    expect(floored.clipped!.advertised).toBeGreaterThan(floored.clipped!.delivered)
    expect(floored.coherent).toBe(false)
    expect(floored.summary).toMatch(/can only carry/)
    // Every rung is still individually healthy — this is about the combination.
    for (const r of floored.rungs) expect(r.warning).toBeNull()
  })

  it('moves the ceiling when the markup moves', () => {
    const lean = checkLadder(AVG, cfg({ listPricing: { ...PRICING_CONFIG.listPricing, markupOnCost: 1.6 } }))
    const fat = checkLadder(AVG, cfg({ listPricing: { ...PRICING_CONFIG.listPricing, markupOnCost: 2.5 } }))
    expect(fat.deepestPossibleDiscount).toBeGreaterThan(lean.deepestPossibleDiscount)
  })

  it('moves the basket values with what we actually sell', () => {
    // Tier qualification is on basket value, so which tier a stack trips depends
    // on the catalogue. A £30 basket doesn't clear the £50 one-off tier at all,
    // so subscribing wins by the whole rate; a £180 one does, so it wins by the
    // gap. Both are healthy — but only because the flat tier keeps the gap from
    // closing as baskets grow, which is exactly what the laddered tiers failed
    // to do.
    const cheap = checkLadder(10, cfg())
    const dear = checkLadder(60, cfg())
    expect(cheap.rungs[0].listPrice).toBe(30)
    expect(dear.rungs[0].listPrice).toBe(180)
    expect(cheap.rungs.every((r) => r.healthy)).toBe(true)
    expect(dear.rungs.every((r) => r.healthy)).toBe(true)
    // The cheap basket earns no one-off discount, so the advantage is the rate.
    expect(cheap.rungs[0].oneOffPct).toBe(0)
    expect(cheap.rungs[0].advantage).toBe(cheap.rungs[0].subscriptionPct)
    expect(dear.rungs[0].oneOffPct).toBe(PRICING_CONFIG.bundleTiers[0].discountPct)
  })
})
