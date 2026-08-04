import { anchorPrice, anchoredListPrice, anchorCoherence, auditAnchors, roundTo99 } from '../anchor'
import { PRICING_CONFIG, type PricingConfig } from '@/lib/stack-blueprint/pricing'
import { POWERBODY_FIXTURES } from '@/lib/supplier/powerbody/fixtures'

const cfg = (over: Partial<PricingConfig> = {}): PricingConfig => ({ ...PRICING_CONFIG, ...over })

describe('the anchor', () => {
  it('rounds to a .99 ending like a shop would', () => {
    // Down, never up — rounding up can push the discounted price back above RRP.
    expect(roundTo99(74.7)).toBe(73.99)
    expect(roundTo99(75.2)).toBe(74.99)
    expect(roundTo99(0.2)).toBe(0.99)
  })

  it('sets the list price a modest step above the supplier’s RRP', () => {
    const c = cfg()
    const list = anchoredListPrice(64.99, c)
    expect(list).toBeGreaterThan(64.99)
    // Modest, not double — the whole point. Within 25% of RRP.
    expect(list).toBeLessThan(64.99 * 1.25)
  })

  it('lands the member BELOW RRP once the bundle discount applies', () => {
    // The bargain has to be real and checkable, or the premium is just a markup.
    const r = anchorPrice({ title: 'Whey', supplierRrp: 64.99, cost: 38.5, servings: 71 }, cfg())
    expect(r.basis).toBe('rrp')
    expect(r.listPrice).toBeGreaterThan(64.99)
    expect(r.bundlePrice).toBeLessThan(64.99)
    expect(r.bargainVsRrp!).toBeGreaterThan(0)
  })

  it('prices the whole catalogue near the market rather than double it', () => {
    const c = cfg()
    const ratios = POWERBODY_FIXTURES.map((p) => {
      const r = anchorPrice({ title: p.name, supplierRrp: p.rrp, cost: p.wholesalePrice, servings: p.servings }, c)
      return r.listPrice / p.rrp
    })
    const avg = ratios.reduce((a, b) => a + b, 0) / ratios.length
    // The old cost-plus model averaged +111% over RRP. This must not.
    expect(avg).toBeGreaterThan(1)
    expect(avg).toBeLessThan(1.2)
  })

  it('falls back to cost-plus when there is no RRP to anchor to', () => {
    const r = anchorPrice({ title: 'Own brand', supplierRrp: null, cost: 10, servings: 30 }, cfg())
    expect(r.basis).toBe('cost-plus')
    expect(r.rrp).toBeNull()
    expect(r.bargainVsRrp).toBeNull()
    expect(r.warning).toMatch(/No supplier RRP/)
  })

  it('derives the premium so the target saving is always what the member gets', () => {
    const c = cfg()
    const r = anchorPrice({ supplierRrp: 100, cost: 40 }, c)
    // Whatever the ladder and the target are, the bundle price lands on target.
    expect(r.bargainVsRrp!).toBeCloseTo(c.anchor.targetBargainVsRrpPct, 2)
  })

  it('asking for a bigger saving LOWERS the anchor — the discount % is fixed', () => {
    // Counter-intuitive and worth pinning. The bundle discount is a fixed
    // percentage, so the only way to land the member further below RRP is to
    // start lower. A bigger target saving therefore shrinks the premium rather
    // than raising the list price, and eventually turns it negative (see the
    // coherence test below).
    const small = anchorPrice({ supplierRrp: 100, cost: 40 }, cfg({ anchor: { ...PRICING_CONFIG.anchor, targetBargainVsRrpPct: 0.03 } }))
    const big = anchorPrice({ supplierRrp: 100, cost: 40 }, cfg({ anchor: { ...PRICING_CONFIG.anchor, targetBargainVsRrpPct: 0.1 } }))
    expect(big.listPrice).toBeLessThan(small.listPrice)
    expect(big.bargainVsRrp!).toBeGreaterThan(small.bargainVsRrp!)
    expect(big.bundlePrice).toBeLessThan(100)
    expect(small.bundlePrice).toBeLessThan(100)
  })

  it('never lands the member above RRP, whatever the target', () => {
    for (const target of [0, 0.03, 0.08, 0.12]) {
      const r = anchorPrice({ supplierRrp: 100, cost: 40 }, cfg({ anchor: { ...PRICING_CONFIG.anchor, targetBargainVsRrpPct: target } }))
      expect(r.bundlePrice).toBeLessThanOrEqual(100)
    }
  })

  it('flags a target saving the bundle discount cannot deliver', () => {
    // 20% off RRP cannot come from a 15% bundle discount — the list price would
    // have to sit below RRP, which is undercutting, not anchoring.
    const incoherent = anchorCoherence(cfg({ anchor: { ...PRICING_CONFIG.anchor, targetBargainVsRrpPct: 0.2 } }))
    expect(incoherent.coherent).toBe(false)
    expect(incoherent.premium).toBeLessThan(0)
    expect(incoherent.reason).toMatch(/below RRP/i)

    expect(anchorCoherence(cfg()).coherent).toBe(true)
  })

  it('says plainly when the market will not bear what a product costs', () => {
    // Wholesale high against RRP: still profitable, but cost-plus wants more
    // than the market will give.
    const r = anchorPrice({ title: 'Thin', supplierRrp: 60, cost: 30, servings: 60 }, cfg())
    expect(r.viable).toBe(true)
    expect(r.shortfall).not.toBeNull()
    expect(r.warning).toMatch(/costs more to sell than the market will bear/i)
  })

  it('recommends dropping a product rather than pricing it above the market', () => {
    const r = anchorPrice({ title: 'Hopeless', supplierRrp: 20, cost: 25, servings: 30 }, cfg())
    expect(r.viable).toBe(false)
    expect(r.warning).toMatch(/keep it off subscription/)
  })

  it('rewards a bigger tub that ships less often, at the same monthly spend', () => {
    // The comparison that matters: two products costing the member the same per
    // month, one shipped every month and one every three. The quarterly one pays
    // a single delivery instead of three, which is the entire reason big tubs
    // work on subscription and monthly ones struggle.
    const monthly = anchorPrice({ supplierRrp: 20, cost: 10, servings: 30 }, cfg())
    const quarterly = anchorPrice({ supplierRrp: 60, cost: 30, servings: 90 }, cfg())
    expect(quarterly.marginPct).toBeGreaterThan(monthly.marginPct)
    // Same monthly outlay for the member, give or take the rounding.
    expect(quarterly.bundlePrice / 3).toBeCloseTo(monthly.bundlePrice, 0)
  })

  it('compares the anchor with what is on the shelf today', () => {
    const r = anchorPrice({ supplierRrp: 50, cost: 25, currentPrice: 45 }, cfg())
    expect(r.vsCurrentPrice).toBe(round2(r.listPrice - 45))
  })
})

describe('auditing the catalogue', () => {
  it('summarises what needs attention, worst first', () => {
    const audit = auditAnchors(
      POWERBODY_FIXTURES.map((p) => ({
        title: p.name,
        supplierRrp: p.rrp,
        cost: p.wholesalePrice,
        servings: p.servings,
      })),
      cfg(),
    )
    expect(audit.rows.length).toBe(POWERBODY_FIXTURES.length)
    // Sorted worst margin first, so the problems are at the top.
    for (let i = 1; i < audit.rows.length; i++) {
      expect(audit.rows[i].marginPct).toBeGreaterThanOrEqual(audit.rows[i - 1].marginPct)
    }
    expect(audit.averageBargain).toBeGreaterThan(0)
  })

  it('counts products with no RRP separately from ones that lose money', () => {
    const audit = auditAnchors(
      [
        { title: 'anchored', supplierRrp: 60, cost: 25, servings: 60 },
        { title: 'no rrp', supplierRrp: null, cost: 25, servings: 60 },
        { title: 'hopeless', supplierRrp: 20, cost: 25, servings: 30 },
      ],
      cfg(),
    )
    expect(audit.unanchored).toBe(1)
    expect(audit.losing).toBeGreaterThanOrEqual(1)
  })
})

const round2 = (n: number) => Math.round(n * 100) / 100
