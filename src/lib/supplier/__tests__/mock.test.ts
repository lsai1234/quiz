import { createMockSupplier, __resetMockOrders } from '@/lib/supplier/powerbody/mock'
import { POWERBODY_FIXTURES } from '@/lib/supplier/powerbody/fixtures'

const OOS_SKUS = ['PHD-DIET-WHEY-1000', 'GRE-ENERGY-390', 'NOW-MAG-180']

describe('mock PowerBody supplier', () => {
  beforeEach(() => __resetMockOrders())

  it('lists every fixture product', async () => {
    const supplier = createMockSupplier()
    const products = await supplier.listProducts()
    expect(products).toHaveLength(POWERBODY_FIXTURES.length)
    expect(products.every((p) => p.sku && p.rrp > 0 && p.wholesalePrice > 0)).toBe(true)
  })

  it('keeps genuinely out-of-stock items at zero and in-stock items positive', async () => {
    const supplier = createMockSupplier()
    const levels = await supplier.getStockLevels()
    for (const sku of OOS_SKUS) {
      const lvl = levels.find((l) => l.sku === sku)!
      expect(lvl.stock).toBe(0)
      expect(lvl.inStock).toBe(false)
    }
    const inStock = levels.find((l) => l.sku === 'ON-GOLD-WHEY-2270')!
    expect(inStock.stock).toBeGreaterThan(0)
    expect(inStock.inStock).toBe(true)
  })

  it('narrows getStockLevels to the requested SKUs', async () => {
    const supplier = createMockSupplier()
    const levels = await supplier.getStockLevels(['ON-CREA-634', 'APP-CREA-250'])
    expect(levels.map((l) => l.sku).sort()).toEqual(['APP-CREA-250', 'ON-CREA-634'])
  })

  it('places an order and reads it back', async () => {
    const supplier = createMockSupplier()
    const result = await supplier.placeOrder({
      reference: 'ord_123',
      shippingAddress: { name: 'Sam', line1: '1 St', city: 'London', postcode: 'E1 6AN', country: 'GB' },
      lines: [{ sku: 'ON-CREA-634', quantity: 1 }],
    })
    expect(result.supplierOrderId).toMatch(/^PB-/)
    expect(result.status).toBe('received')

    const order = await supplier.getOrder(result.supplierOrderId)
    expect(order?.reference).toBe('ord_123')
    expect(order?.lines).toEqual([{ sku: 'ON-CREA-634', quantity: 1 }])

    const all = await supplier.listOrders()
    expect(all).toHaveLength(1)
  })
})
