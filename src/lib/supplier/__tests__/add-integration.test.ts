import { createMockSupplier } from '@/lib/supplier/powerbody/mock'
import { supplierProductToCatalogue } from '@/lib/supplier/mapping'
import { addImportedProducts } from '@/lib/portal/store'
import { getResolvedCatalogue } from '@/lib/catalogue/resolve'
import { anchoredListPrice } from '@/lib/pricing/anchor'

// Proves the Phase 1 "done when": a scanned PowerBody product, once added,
// shows up in the catalogue the shop + quiz read (via the imported-products
// seam), carrying supplier price + stock.
describe('adding a PowerBody product surfaces it in the catalogue', () => {
  it('appears in the resolved catalogue after being added', async () => {
    const supplier = createMockSupplier()
    const sp = (await supplier.listProducts()).find((p) => p.sku === 'ON-CREA-634')!
    const mapped = supplierProductToCatalogue(sp)

    const before = await getResolvedCatalogue()
    expect(before.products.some((p) => p.id === mapped.id)).toBe(false)

    await addImportedProducts([mapped])

    const after = await getResolvedCatalogue()
    const added = after.products.find((p) => p.id === mapped.id)
    expect(added).toBeDefined()
    expect(added?.basePrice).toBe(anchoredListPrice(sp.rrp))
    expect(added?.cost).toBe(sp.wholesalePrice)
    expect(added?.variants[0].sku).toBe(sp.sku)
  })
})
