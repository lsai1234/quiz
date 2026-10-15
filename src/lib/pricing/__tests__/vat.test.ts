/**
 * Whether PowerBody's VAT is a cost to us — and that every place which prices a
 * supplier cost, or solves for a price that will, agrees on the answer.
 *
 * Two switches decide it: `vat.registered` (can we reclaim?) and
 * `vat.supplierChargesVat` (is there any to reclaim?). It is a cost only when
 * they charge it AND we cannot reclaim it. PowerBody do charge it — the prices
 * we store are ex VAT and their invoices add it — and we are not registered,
 * so it ships as a cost.
 */
import { costFromSupplierPrice, supplierVatIsCost } from '../vat'
import { priceForMargin, unitEconomics } from '../unit-economics'
import { PRICING_CONFIG, type PricingConfig } from '@/lib/stack-blueprint/pricing'

const withVat = (registered: boolean, supplierChargesVat: boolean): PricingConfig => ({
  ...PRICING_CONFIG,
  vat: { ...PRICING_CONFIG.vat, registered, supplierChargesVat },
})

/** Anything in a waterfall note that says PowerBody's VAT is in our costs. */
const VAT_ON_COSTS_WORDING = /plus VAT|cannot reclaim|can't reclaim|nothing can be reclaimed on costs/i

describe('whether PowerBody’s VAT is a cost', () => {
  it('ships as a cost: PowerBody charge VAT and we cannot reclaim it yet', () => {
    expect(PRICING_CONFIG.vat.supplierChargesVat).toBe(true)
    expect(PRICING_CONFIG.vat.registered).toBe(false)
    expect(supplierVatIsCost(PRICING_CONFIG)).toBe(true)
  })

  it.each([
    // registered, charged → a cost?
    [false, false, false],
    [false, true, true],
    [true, false, false],
    [true, true, false],
  ])('registered %s, they charge VAT %s → a cost: %s', (registered, charged, expected) => {
    expect(supplierVatIsCost(withVat(registered, charged))).toBe(expected)
  })

  it.each([
    // registered, charged → what £10 ex VAT costs us
    [false, false, 10],
    [false, true, 12],
    [true, false, 10],
    [true, true, 10],
  ])('registered %s, they charge VAT %s → £10 ex VAT costs £%s', (registered, charged, expected) => {
    expect(costFromSupplierPrice(10, withVat(registered, charged))).toBe(expected)
  })
})

describe('unit economics with the switch off', () => {
  const off = withVat(false, false)
  const on = withVat(false, true)
  const sale = { shelfPrice: 30, supplierCost: 10, grams: 1000 }

  it('costs the goods at the wholesale price, and says so in the assumptions', () => {
    const e = unitEconomics(sale, off)
    expect(e.productCost).toBe(sale.supplierCost)
    expect(e.assumptions.supplierChargesVat).toBe(false)
    expect(e.assumptions.vatRegistered).toBe(false)
  })

  it('never says PowerBody’s VAT is in our costs', () => {
    for (const input of [sale, { ...sale, supplierCost: null }]) {
      for (const step of unitEconomics(input, off).steps) {
        expect(step.note).not.toMatch(VAT_ON_COSTS_WORDING)
      }
    }
    const goods = unitEconomics(sale, off).steps.find((s) => s.id === 'goods')!
    expect(goods.note).toMatch(/carry no VAT/)
  })

  it('costs delivery at their quoted price too', () => {
    // The rate card is ex VAT throughout, so the switch moves both lines.
    const offDelivery = unitEconomics(sale, off).deliveryCost
    const onDelivery = unitEconomics(sale, on).deliveryCost
    expect(offDelivery).toBeLessThan(onDelivery)
    expect(onDelivery / offDelivery).toBeCloseTo(1 + PRICING_CONFIG.vat.standardRate, 1)
  })

  it('keeps the VAT wording, and the gross-up, when their invoices do carry it', () => {
    const e = unitEconomics(sale, on)
    expect(e.productCost).toBe(12)
    expect(e.assumptions.supplierChargesVat).toBe(true)
    expect(e.steps.find((s) => s.id === 'goods')!.note).toMatch(/plus VAT, which we cannot reclaim/)
    expect(e.steps.find((s) => s.id === 'vat')!.note).toMatch(/nothing can be reclaimed on costs/)
  })

  it('makes more on the same sale with the switch off', () => {
    expect(unitEconomics(sale, off).contribution).toBeGreaterThan(unitEconomics(sale, on).contribution)
  })
})

describe('priceForMargin keeps in step with the switch', () => {
  // An unknown cost is a share of the price being solved for, so the solver
  // carries its own copy of the VAT gross-up. If that copy disagreed with
  // `costFromSupplierPrice`, the price it returned would miss its own target.
  const unknownCost = { supplierCost: null, grams: 1000 }

  it.each([false, true])('round-trips an unknown cost (they charge VAT: %s)', (charged) => {
    const c = withVat(false, charged)
    for (const m of [0, 0.1, 0.2]) {
      const price = priceForMargin(m, unknownCost, c)
      expect(price).not.toBeNull()
      const achieved = unitEconomics({ ...unknownCost, shelfPrice: price! }, c).marginPct
      expect(achieved).toBeGreaterThanOrEqual(m)
      expect(Math.abs(achieved - m)).toBeLessThan(0.01)
    }
  })

  it('round-trips a known cost too', () => {
    for (const charged of [false, true]) {
      const c = withVat(false, charged)
      const price = priceForMargin(0.25, { supplierCost: 15, grams: 1000 }, c)!
      const achieved = unitEconomics({ supplierCost: 15, grams: 1000, shelfPrice: price }, c).marginPct
      expect(Math.abs(achieved - 0.25)).toBeLessThan(0.01)
    }
  })

  it('asks a lower price with the switch off', () => {
    for (const m of [0, 0.1, 0.2]) {
      const off = priceForMargin(m, unknownCost, withVat(false, false))!
      const on = priceForMargin(m, unknownCost, withVat(false, true))!
      expect(off).toBeLessThan(on)
    }
  })

  it('makes no difference once we are registered', () => {
    // Registered, any VAT they charge is reclaimed — the switch is moot.
    expect(priceForMargin(0.2, unknownCost, withVat(true, false))).toBe(
      priceForMargin(0.2, unknownCost, withVat(true, true)),
    )
  })
})
