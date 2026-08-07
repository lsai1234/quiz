import { POWERBODY_FIXTURES } from '@/lib/supplier/powerbody/fixtures'
import { supplierProductToCatalogue } from '@/lib/supplier/mapping'
import { addImportedProducts, getPendingReviewProducts, saveImportedProduct } from '@/lib/portal/store'
import { getResolvedCatalogue } from '@/lib/catalogue/resolve'
import { approved, asPendingReview, sourcesForImport } from '@/lib/catalogue/review'
import { listPriceFor } from '@/lib/pricing/list-price'

// Proves the Phase 1 "done when": a scanned PowerBody product, once added,
// shows up in the catalogue the shop + quiz read (via the imported-products
// seam), carrying supplier price + stock.
describe('adding a PowerBody product surfaces it in the catalogue', () => {
  it('appears in the resolved catalogue after being added', async () => {
    const sp = POWERBODY_FIXTURES.find((p) => p.sku === 'ON-CREA-634')!
    const mapped = supplierProductToCatalogue(sp)

    const before = await getResolvedCatalogue()
    expect(before.products.some((p) => p.id === mapped.id)).toBe(false)

    await addImportedProducts([mapped])

    const after = await getResolvedCatalogue()
    const added = after.products.find((p) => p.id === mapped.id)
    expect(added).toBeDefined()
    expect(added?.basePrice).toBe(listPriceFor(sp.wholesalePrice))
    expect(added?.cost).toBe(sp.wholesalePrice)
    expect(added?.variants[0].sku).toBe(sp.sku)
  })

  it('keeps a product awaiting review out of the shop until it is approved', async () => {
    const sp = POWERBODY_FIXTURES.find((p) => p.sku === 'APP-CREA-250')!
    const mapped = supplierProductToCatalogue(sp)

    await addImportedProducts([asPendingReview(mapped, sourcesForImport(['stackSlots', 'shortReason'], true))])

    // The whole point of the gate: it is imported, it is visible in the hub's
    // review queue, and it is NOT something a customer can be sold or
    // recommended — the AI decided its stack slots and nobody has looked yet.
    const held = await getResolvedCatalogue()
    expect(held.products.some((p) => p.id === mapped.id)).toBe(false)
    expect((await getPendingReviewProducts()).some((p) => p.id === mapped.id)).toBe(true)

    const pending = (await getPendingReviewProducts()).find((p) => p.id === mapped.id)!
    await saveImportedProduct(approved(pending, 'founder1@chrgd.dev'))

    const live = await getResolvedCatalogue()
    expect(live.products.some((p) => p.id === mapped.id)).toBe(true)
    expect((await getPendingReviewProducts()).some((p) => p.id === mapped.id)).toBe(false)
  })
})
