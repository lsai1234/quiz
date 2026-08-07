import { NextResponse } from 'next/server'
import { isPortalAuthed } from '@/lib/portal/guard'
import { getSupplier } from '@/lib/supplier'
import { supplierProductToCatalogue, uniqueProductId } from '@/lib/supplier/mapping'
import { asPendingReview, sourcesForImport, withoutSupplierOwned } from '@/lib/catalogue/review'
import { canMerge, mergeProducts } from '@/lib/catalogue/merge'
import { autopopulateProduct } from '@/lib/supplier/autopopulate'
import { addImportedProducts, getImportedProducts, syncPortalRuntime } from '@/lib/portal/store'

export const dynamic = 'force-dynamic'

/**
 * Resolving named SKUs pages the (rate-limited) list feed and then makes one
 * detail call per product, so give it room — the platform default would cut it
 * off and answer with an error page the browser cannot read.
 */
export const maxDuration = 60

/**
 * POST { skus, combine?, title?, autopopulate? } — map the chosen supplier
 * products, AI-fill the CHRGD attributes PowerBody doesn't send (claim-safe),
 * and add them for review.
 *
 * `combine` turns the SKUs into ONE product with a variant each, which is how a
 * product that PowerBody sell as four flavours becomes one thing in the shop
 * with a flavour picker. Every variant keeps its own SKU, so it stays orderable.
 */
export async function POST(req: Request) {
  if (!(await isPortalAuthed())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  let body: { skus?: unknown; autopopulate?: boolean; combine?: boolean; title?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }
  if (!Array.isArray(body.skus) || body.skus.length === 0) {
    return NextResponse.json({ error: 'skus must be a non-empty array' }, { status: 400 })
  }
  const skus = body.skus.filter((s): s is string => typeof s === 'string')
  const autopopulate = body.autopopulate !== false

  try {
    await syncPortalRuntime()
    const supplier = await getSupplier()
    // Fetches full detail for exactly the SKUs asked for — so what lands in the
    // catalogue is a whole product, never a half-populated row.
    const toAdd = await supplier.getProductsBySku(skus)
    if (toAdd.length === 0) {
      return NextResponse.json({ error: 'None of the given SKUs were found in the supplier feed.' }, { status: 404 })
    }
    const found = new Set(toAdd.map((p) => p.sku))
    const notFound = skus.filter((sku) => !found.has(sku))

    let aiUsed = false
    const mapped: import('@/lib/catalogue/types').CatalogueProduct[] = []
    const sourcesById = new Map<string, ReturnType<typeof sourcesForImport>>()
    for (const sp of toAdd) {
      let product = supplierProductToCatalogue(sp)
      let aiFields: string[] = []
      if (autopopulate) {
        // Enrich the CHRGD-only attributes (claim-safe). Nothing here is trusted
        // blindly: the product lands as `pending` and a founder walks the fields
        // a rule or a model decided before it can be sold.
        const { patch, source } = await autopopulateProduct(product)
        if (source === 'ai') aiUsed = true
        // Only the gaps. The classifier estimates a cost and a serving count for
        // products that have neither, and applying that here overwrote what
        // PowerBody actually charge us with a guess — which then flowed into
        // every margin figure in the hub.
        const enrichment = withoutSupplierOwned(patch)
        aiFields = Object.keys(enrichment)
        product = { ...product, ...enrichment }
      }
      mapped.push(product)
      sourcesById.set(product.id, sourcesForImport(aiFields, aiUsed))
    }

    let toStore = mapped
    if (body.combine) {
      const check = canMerge(mapped)
      if (!check.ok) return NextResponse.json({ error: check.reason }, { status: 400 })
      toStore = [mergeProducts(mapped, { title: body.title })]
    }

    // Held out of the shop and quiz until reviewed, carrying a record of which
    // fields came from PowerBody, which from our rules, and which from a model.
    // `taken` grows as we go, so two SKUs sharing a name inside ONE paste
    // disambiguate against each other and not just against what is already here.
    const taken = [...(await getImportedProducts())]
    const pending = toStore.map((product) => {
      const id = uniqueProductId(product, taken)
      const sources = sourcesById.get(product.id) ?? sourcesForImport([], aiUsed)
      const stored = asPendingReview({ ...product, id, handle: id }, sources)
      taken.push(stored)
      return stored
    })

    await addImportedProducts(pending)
    return NextResponse.json({
      ok: true,
      added: pending.length,
      combined: Boolean(body.combine),
      skusAdded: mapped.length,
      autopopulated: autopopulate,
      aiUsed,
      /** Nothing is sellable yet — the hub sends the founder to Review next. */
      pendingReview: pending.length,
      ids: pending.map((p) => p.id),
      // Named explicitly so a typo'd SKU is reported rather than silently
      // dropped from a bulk paste.
      notFound,
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to add products.' },
      { status: 502 },
    )
  }
}
