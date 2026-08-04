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
  it('is coherent as shipped', () => {
    const check = checkLadder(AVG, cfg())
    expect(check.coherent).toBe(true)
    for (const r of check.rungs) expect(r.warning).toBeNull()
  })

  it('gives a bigger reason to subscribe the bigger the bundle', () => {
    // The advantage growing with stack size is what makes the ladder pull in the
    // same direction as the bundle sizes, rather than against them.
    const [essentials, performance, complete] = checkLadder(AVG, cfg()).rungs
    expect(performance.advantage).toBeGreaterThan(essentials.advantage)
    expect(complete.advantage).toBeGreaterThan(performance.advantage)
    expect(essentials.advantage).toBeGreaterThanOrEqual(HEALTHY_ADVANTAGE_PP)
  })

  it('lands every subscriber below the supplier’s RRP', () => {
    for (const r of checkLadder(AVG, cfg()).rungs) {
      expect(r.vsRrpSubscribed).toBeGreaterThan(0)
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

  it('flags a rung too shallow to clear the anchor premium', () => {
    // The list price sits above RRP, so a discount smaller than that premium
    // leaves the member paying over the odds. This is the constraint that
    // decided the entry rung — see docs/PRICING_STRATEGY.md §5.
    const check = checkLadder(
      AVG,
      cfg({
        levelSubscriptionDiscount: { essentials: 0.03, performance: 0.15, complete: 0.2 },
        bundleTiers: [] as DiscountTier[],
      }),
    )
    const entry = check.rungs.find((r) => r.level === 'essentials')!
    expect(entry.vsRrpSubscribed).toBeLessThan(0)
    expect(entry.warning).toMatch(/ABOVE the supplier's RRP/)
  })

  it('reports the shallowest discount that still beats RRP', () => {
    const check = checkLadder(AVG, cfg())
    // premium/(1+premium) — a ~8.2% premium needs a ~7.6% discount to break even
    // against RRP.
    expect(check.minDiscountForRrp).toBeCloseTo(check.anchorPremium / (1 + check.anchorPremium), 4)
    expect(check.minDiscountForRrp).toBeLessThan(PRICING_CONFIG.levelSubscriptionDiscount.essentials)
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
    expect(cheap.coherent).toBe(true)
    expect(dear.coherent).toBe(true)
    // The cheap basket earns no one-off discount, so the advantage is the rate.
    expect(cheap.rungs[0].oneOffPct).toBe(0)
    expect(cheap.rungs[0].advantage).toBe(cheap.rungs[0].subscriptionPct)
    expect(dear.rungs[0].oneOffPct).toBe(PRICING_CONFIG.bundleTiers[0].discountPct)
  })
})
