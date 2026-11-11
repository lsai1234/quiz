/**
 * Products don't ship alone — the quiz sells a stack.
 *
 * PowerBody charge delivery per PARCEL, by its weight, so what a product
 * carries in postage depends on what else is in the box. The model priced
 * every product as if it were posted on its own, which added a whole delivery
 * charge to a £10 tub and reported most of the catalogue as loss-making. These
 * pin the fix.
 */
import { unitEconomics, priceForMargin } from '../unit-economics'
import { labelGrams, selectService, shipmentWeight, unitGrams } from '../delivery'
import { priceProduct, reviewCatalogue } from '../list-price'
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

  it('reads the service off the whole parcel, not the one line', () => {
    // One 3 kg tub goes Royal Mail. Three of them is 9 kg, over Royal Mail's
    // 7 kg, so the parcel goes DPD and each line carries a third of £5.17 + VAT.
    const c = cfg()
    expect(selectService(3000, 'uk-1', c)!.carrier).toBe('royal-mail')
    expect(selectService(9000, 'uk-1', c)!.carrier).toBe('dpd')

    const shared = unitEconomics(
      { shelfPrice: 80, supplierCost: 40, grams: 3000, chargeDelivery: false, sharedParcelItems: 3 },
      cfg(),
    )
    // Over 7 kg nothing goes to the Highlands, so it is the mainland DPD cost.
    expect(shared.deliveryCost).toBeCloseTo((5.17 * 1.2) / 3, 2)
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
    expect(line.note).toMatch(/Royal Mail Tracked 48 for a 3\.0 kg parcel of 3 items, split 3 ways/)
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

describe('which service a parcel goes with', () => {
  const c = cfg()

  it('sends everything up to 7 kg Royal Mail, and DPD above', () => {
    expect(selectService(150, 'uk-1', c)!.id).toBe('z1-rm48')
    expect(selectService(7000, 'uk-1', c)!.id).toBe('z1-rm48')
    expect(selectService(7001, 'uk-1', c)!.id).toBe('z1-dpd')
    expect(selectService(30001, 'uk-1', c)).toBeNull()
  })

  it('has nothing for the Highlands over 7 kg', () => {
    expect(selectService(6500, 'uk-2', c)!.price).toBe(4.49)
    expect(selectService(7500, 'uk-2', c)).toBeNull()
  })

  it('weighs a unit by its own weight, then its label plus packaging, then 1 kg', () => {
    expect(unitGrams({ weightGrams: 640, size: '1kg' }, c)).toEqual({ grams: 640, source: 'weight' })
    expect(unitGrams({ size: '1kg' }, c)).toEqual({ grams: 1150, source: 'label' })
    expect(unitGrams({ size: 'Chocolate / 500 g' }, c)).toEqual({ grams: 575, source: 'label' })
    expect(unitGrams({ size: '90 caps' }, c)).toEqual({ grams: 1000, source: 'default' })
    expect(labelGrams('2.27kg')).toBe(2270)
    expect(labelGrams('60 servings')).toBeNull()
    expect(shipmentWeight([{ weightGrams: 500, quantity: 2 }, { size: '1kg' }], c)).toEqual({ grams: 2150, weightKnown: false })
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
    const alone = reviewCatalogue(rows.map((r) => ({ ...r, sharedParcelItems: 1 })), cfg())
    const packed = reviewCatalogue(rows, cfg())
    expect(packed.rows[0].sharedParcelItems).toBe(PRICING_CONFIG.orderMix.itemsPerOrder)
    expect(packed.losing).toBeLessThan(alone.losing)
    expect(packed.averageMargin).toBeGreaterThan(alone.averageMargin)
    // The prices themselves don't move — this is about what they have to carry.
    expect(packed.rows.map((r) => r.listPrice).sort()).toEqual(alone.rows.map((r) => r.listPrice).sort())
  })

  it('still calls out a product too cheap to carry its share of a parcel', () => {
    // A £6.49 item can't carry its share of a parcel and still pay, and no
    // amount of bundling changes that. It should stay flagged.
    const r = priceProduct({ title: 'Tiny', supplierRrp: 6.49, cost: 3.4, servings: 20 }, cfg())
    expect(r.viable).toBe(false)
    expect(r.warning).toMatch(/best kept off subscription/i)
  })

  it('prices from cost even when that lands well above the brand’s RRP', () => {
    // RRP has no say at all. A product we happen to buy dearly still prices at
    // the rule, and nothing flags it — a warning nobody acts on is noise.
    const r = priceProduct({ title: 'Dear', supplierRrp: 20, cost: 15, servings: 60 }, cfg())
    expect(r.listPrice).toBe(29.99)
    expect(r.vsRrp).toBeGreaterThan(0)
    expect(r.warning).toBeNull()
  })

  it('prices a product with no RRP exactly the same way', () => {
    // The whole point of pricing from cost: an own-brand line with no
    // recommended price is not a special case.
    const withRrp = priceProduct({ cost: 12, servings: 60, supplierRrp: 25 }, cfg())
    const without = priceProduct({ cost: 12, servings: 60, supplierRrp: null }, cfg())
    expect(without.listPrice).toBe(withRrp.listPrice)
    expect(without.rrp).toBeNull()
    expect(without.warning).toBeNull()
  })
})
