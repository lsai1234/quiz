import { toSupplierRow } from '@/lib/supplier/row'
import { unitEconomics } from '@/lib/pricing/unit-economics'
import { listPriceFor } from '@/lib/pricing/list-price'
import type { SupplierProduct } from '@/lib/supplier/types'

const BASE: SupplierProduct = {
  sku: 'PB-1',
  productId: '1001',
  name: 'Whey Protein 1kg',
  brand: 'PB',
  category: 'Protein',
  description: '',
  imageUrl: null,
  wholesalePrice: 10,
  rrp: 24.99,
  currency: 'GBP',
  stock: 5,
  inStock: true,
  barcode: null,
  flavours: [],
  servings: 30,
  weightGrams: 1150,
  vatRate: null,
  detailed: true,
  updatedAt: '2026-08-01T00:00:00.000Z',
}

/** The same product as the cheap list feed gives it: money, nothing else. */
const BARE: SupplierProduct = {
  ...BASE,
  name: 'PB-1',
  brand: '',
  category: '',
  rrp: 12, // the list feed's price_tax fallback — wholesale inc VAT
  weightGrams: null,
  detailed: false,
}

const none = new Set<string>()

describe('toSupplierRow', () => {
  it('prices from cost, so the money column needs no detail call', () => {
    const row = toSupplierRow(BARE, none)

    // Every figure a founder decides on is present on an undetailed row.
    expect(row.wholesalePrice).toBe(10)
    expect(row.sellPrice).toBe(listPriceFor(10))
    expect(row.marginPct).toBeGreaterThan(0)
    expect(row.contribution).toBeGreaterThan(0)
  })

  it('never passes the supplier’s RRP off as known before it is', () => {
    // The list feed's fallback RRP is wholesale-including-VAT. Reporting it
    // would put a ~17% margin on screen that no one had computed.
    expect(toSupplierRow(BARE, none).rrp).toBeNull()
    expect(toSupplierRow(BASE, none).rrp).toBe(24.99)
  })

  it('reports the real margin — VAT, delivery, fees and returns — not price minus cost', () => {
    const row = toSupplierRow(BASE, none)
    const naive = Math.round(((row.sellPrice - 10) / row.sellPrice) * 100)

    expect(row.marginPct).toBe(
      Math.round(
        unitEconomics({ shelfPrice: row.sellPrice, supplierCost: 10, grams: 1150, vatRate: null }).marginPct * 100,
      ),
    )
    // The whole reason to use the waterfall: the naive figure is much rosier.
    expect(row.marginPct).toBeLessThan(naive)
  })

  it('flags the margin as estimated only while the shipping weight is unknown', () => {
    // Delivery is weight-banded, and weight comes from the detail call — so
    // until then the margin rests on an assumption and says so.
    expect(toSupplierRow(BARE, none).marginEstimated).toBe(true)
    expect(toSupplierRow(BASE, none).marginEstimated).toBe(false)
  })

  it('marks products already in our catalogue', () => {
    const row = toSupplierRow(BASE, none)
    expect(row.alreadyAdded).toBe(false)
    expect(toSupplierRow(BASE, new Set([row.mappedId])).alreadyAdded).toBe(true)
  })
})
