/**
 * Products don't ship alone — the quiz sells a stack.
 *
 * PowerBody band delivery on the wholesale value of the PARCEL, so what a
 * product carries in postage depends entirely on what else is in the box. The
 * model priced every product as if it were posted on its own, which added a
 * whole delivery charge to a £10 tub and reported most of the catalogue as
 * loss-making. These pin the fix.
 */
import { unitEconomics, priceForMargin } from '../unit-economics'
import { toFreeShipping, selectService } from '../delivery'
import { anchorPrice, auditAnchors } from '../anchor'
import { PRICING_CONFIG, type PricingConfig } from '@/lib/stack-blueprint/pricing'
import { POWERBODY_FIXTURES } from '@/lib/supplier/powerbody/fixtures'

const cfg = (over: Partial<PricingConfig> = {}): PricingConfig => ({ ...PRICING_CONFIG, ...over })

describe('sharing a parcel', () => {
  it('splits one delivery across the products in the box', () => {
    const alone = unitEconomics({ shelfPrice: 30, supplierCost: 12, chargeDelivery: false }, cfg())
    const shared = unitEconomics(
      { shelfPrice: 30, supplierCost: 12, chargeDelivery: false, sharedParcelItems: 3 },
      cfg(),
    )
    // Three products, one parcel, one delivery charge — so each carries a third.
    expect(shared.deliveryCost).toBeCloseTo(alone.deliveryCost / 3, 1)
    expect(shared.contribution).toBeGreaterThan(alone.contribution)
  })

  it('reads the band off the whole parcel, not the one line', () => {
    // £40 of wholesale alone sits in the ≤£50 band. Three of them is £120, which
    // clears the free line — so the line carries nothing, not a third of £6.50.
    const c = cfg()
    expect(selectService(40, 'uk-1', c)!.price).toBe(6.5)
    expect(selectService(120, 'uk-1', c)!.price).toBe(0)

    const shared = unitEconomics(
      { shelfPrice: 80, supplierCost: 40, chargeDelivery: false, sharedParcelItems: 3 },
      cfg(),
    )
    // Only the Zone-2 share of orders still pays anything.
    expect(shared.deliveryCost).toBeLessThan(0.5)
  })

  it('defaults to shipping alone, which is the worst case', () => {
    const implicit = unitEconomics({ shelfPrice: 30, supplierCost: 12, chargeDelivery: false }, cfg())
    const explicit = unitEconomics(
      { shelfPrice: 30, supplierCost: 12, chargeDelivery: false, sharedParcelItems: 1 },
      cfg(),
    )
    expect(implicit.deliveryCost).toBe(explicit.deliveryCost)
  })

  it('says in the waterfall how the parcel was assumed to be packed', () => {
    const shared = unitEconomics(
      { shelfPrice: 30, supplierCost: 12, chargeDelivery: false, sharedParcelItems: 3 },
      cfg(),
    )
    const line = shared.steps.find((s) => s.id === 'delivery-cost')!
    expect(line.note).toMatch(/3-item parcel, split 3 ways/)
  })

  it('needs a lower price to hit a margin when the postage is shared', () => {
    const alone = priceForMargin(0.25, { supplierCost: 12, chargeDelivery: false }, cfg())
    const shared = priceForMargin(0.25, { supplierCost: 12, chargeDelivery: false, sharedParcelItems: 3 }, cfg())
    expect(alone).not.toBeNull()
    expect(shared).not.toBeNull()
    expect(shared!).toBeLessThan(alone!)
    // And the answer still verifies against the real waterfall.
    expect(
      unitEconomics({ shelfPrice: shared!, supplierCost: 12, chargeDelivery: false, sharedParcelItems: 3 }, cfg()).marginPct,
    ).toBeGreaterThanOrEqual(0.25)
  })
})

describe('the next band down', () => {
  it('points at the step that is actually reachable, not just the free line', () => {
    const c = cfg()
    const r = toFreeShipping(38, 'uk-1', c)
    // Free is £99 away — true, and useless. £50 is £12 away.
    expect(r.threshold).toBe(99)
    expect(r.shortfall).toBe(61)
    expect(r.next).not.toBeNull()
    expect(r.next!.threshold).toBe(50)
    expect(r.next!.shortfall).toBe(12)
    expect(r.next!.price).toBe(5.5)
    expect(r.next!.saving).toBeGreaterThan(0)
  })

  it('names free as the next step once the middle band is reached', () => {
    const r = toFreeShipping(60, 'uk-1', cfg())
    expect(r.next!.threshold).toBe(99)
    expect(r.next!.price).toBe(0)
  })

  it('has nothing left to offer a parcel that already ships free', () => {
    const r = toFreeShipping(150, 'uk-1', cfg())
    expect(r.alreadyFree).toBe(true)
    expect(r.next).toBeNull()
  })
})

describe('the catalogue audit, packed the way we actually sell', () => {
  it('stops reporting healthy products as loss-makers', () => {
    const rows = POWERBODY_FIXTURES.map((p) => ({
      title: p.name,
      supplierRrp: p.rrp,
      cost: p.wholesalePrice,
      servings: p.servings,
    }))
    const alone = auditAnchors(rows.map((r) => ({ ...r, sharedParcelItems: 1 })), cfg())
    const packed = auditAnchors(rows, cfg())
    expect(packed.sharedParcelItems).toBe(PRICING_CONFIG.orderMix.itemsPerOrder)
    expect(packed.losing).toBeLessThan(alone.losing)
    expect(packed.averageMargin).toBeGreaterThan(alone.averageMargin)
    // The prices themselves don't move — this is about what they have to carry.
    expect(packed.rows.map((r) => r.listPrice).sort()).toEqual(alone.rows.map((r) => r.listPrice).sort())
  })

  it('still calls out a product too cheap to carry its share of a parcel', () => {
    // A £6.49 item can't absorb even a third of £6.50 of postage, and no amount
    // of bundling changes that. It should stay flagged.
    const r = anchorPrice({ title: 'Tiny', supplierRrp: 6.49, cost: 3.4, servings: 20 }, cfg())
    expect(r.viable).toBe(false)
    expect(r.warning).toMatch(/keep it off subscription/)
  })

  it('says once, at the top, when the TARGET is what the catalogue is failing', () => {
    // Two dozen individually-flagged products is not two dozen findings — it is
    // one finding about the target margin, repeated.
    const audit = auditAnchors(
      POWERBODY_FIXTURES.map((p) => ({ title: p.name, supplierRrp: p.rrp, cost: p.wholesalePrice, servings: p.servings })),
      cfg(),
    )
    expect(audit.squeezed).toBeGreaterThan(audit.rows.length * 0.6)
    expect(audit.note).toMatch(/target, not the catalogue/)
    expect(audit.targetMarginPct).toBe(PRICING_CONFIG.goodPricing.targetMarginPct)
  })

  it('leaves the note off a catalogue that is mostly fine', () => {
    const audit = auditAnchors(
      Array.from({ length: 6 }, (_, i) => ({ title: `p${i}`, supplierRrp: 60, cost: 12, servings: 90 })),
      cfg(),
    )
    expect(audit.note).toBeNull()
  })
})
