/**
 * @jest-environment node
 *
 * What the public catalogue gives away.
 *
 * `/api/catalogue` is unauthenticated and the shop fetches it on every visit,
 * so anything on a product it serves is readable by anyone in their browser's
 * network tab. It used to serve the raw product — review record included — and
 * every approve stamps the approving founder's sign-in email on that record.
 * These pin what leaves, and that what the shop's own pricing needs still does.
 */
import { POWERBODY_FIXTURES } from '@/lib/supplier/powerbody/fixtures'
import { supplierProductToCatalogue } from '@/lib/supplier/mapping'
import { addImportedProducts, getPendingReviewProducts, saveImportedProduct } from '@/lib/portal/store'
import { getResolvedCatalogue, toPublicProduct } from '@/lib/catalogue/resolve'
import { approved, asPendingReview, sourcesForImport } from '@/lib/catalogue/review'
import type { CatalogueProduct } from '@/lib/catalogue/types'
import { GET } from '../route'

const FOUNDER = 'founder1@chrgd.dev'

/** An imported product, approved by a founder — the record every approve path writes. */
async function approveOne(): Promise<CatalogueProduct> {
  const sp = POWERBODY_FIXTURES.find((p) => p.sku === 'ON-CREA-634')!
  const mapped = supplierProductToCatalogue(sp)
  const withProvenance: CatalogueProduct = {
    ...mapped,
    supplierProductId: '634',
    variants: mapped.variants.map((v) => ({ ...v, supplierProductId: '634', priceSource: 'founder', servingsSource: 'supplier' })),
  }
  const pendingReview = asPendingReview(withProvenance, sourcesForImport(['stackSlots', 'shortReason'], true))
  await addImportedProducts([{ ...pendingReview, review: { ...pendingReview.review!, notes: ['Swap group was a guess.'] } }])
  const pending = (await getPendingReviewProducts()).find((p) => p.id === mapped.id)!
  await saveImportedProduct(approved(pending, FOUNDER))
  return withProvenance
}

describe('GET /api/catalogue', () => {
  it('never sends the approving founder’s email, the review record or PowerBody’s ids', async () => {
    const product = await approveOne()

    const res = await GET(new Request('http://localhost/api/catalogue'))
    const raw = await res.text()
    const body = JSON.parse(raw) as { products: CatalogueProduct[] }
    const served = body.products.find((p) => p.id === product.id)

    // It is on sale, so it is served…
    expect(served).toBeDefined()
    // …without anything that is ours alone, anywhere in the response.
    expect(raw).not.toContain(FOUNDER)
    expect(raw).not.toContain('approvedBy')
    expect(raw).not.toContain('Swap group was a guess.')
    expect(served).not.toHaveProperty('review')
    expect(served).not.toHaveProperty('supplierProductId')
    for (const v of served!.variants) {
      expect(v).not.toHaveProperty('supplierProductId')
      expect(v).not.toHaveProperty('priceSource')
      expect(v).not.toHaveProperty('servingsSource')
    }
  })

  it('keeps what the shop reads — the cost its pricing holds discounts above, prices, stock', async () => {
    const product = await approveOne()

    const body = (await (await GET(new Request('http://localhost/api/catalogue'))).json()) as { products: CatalogueProduct[] }
    const served = body.products.find((p) => p.id === product.id)!

    expect(served.cost).toBe(product.cost)
    expect(served.basePrice).toBe(product.basePrice)
    expect(served.variants.map((v) => [v.id, v.price, v.available, v.sku])).toEqual(
      product.variants.map((v) => [v.id, v.price, v.available, v.sku]),
    )
  })

  it('leaves the server’s own catalogue whole: the hub still reads who approved it', async () => {
    const product = await approveOne()
    await GET(new Request('http://localhost/api/catalogue'))

    const server = (await getResolvedCatalogue()).products.find((p) => p.id === product.id)!
    expect(server.review?.approvedBy).toBe(FOUNDER)
    expect(server.variants[0].supplierProductId).toBe('634')
  })
})

describe('toPublicProduct', () => {
  it('copies rather than edits, so a product read for the shop is never saved without its record', () => {
    const product: CatalogueProduct = {
      ...supplierProductToCatalogue(POWERBODY_FIXTURES[0]),
      supplierProductId: '1',
      review: { status: 'approved', sources: {}, confirmed: [], importedAt: '2026-10-01T00:00:00.000Z', approvedBy: FOUNDER },
    }
    const before = JSON.stringify(product)

    const shown = toPublicProduct(product)

    expect(shown).not.toHaveProperty('review')
    expect(JSON.stringify(product)).toBe(before)
  })
})
