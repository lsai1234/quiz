import { NextResponse } from 'next/server'
import { isPortalAuthed } from '@/lib/portal/guard'
import { getSupplier } from '@/lib/supplier'
import { supplierProductToCatalogue } from '@/lib/supplier/mapping'
import { toSupplierRow } from '@/lib/supplier/row'
import { asPendingReview, sourcesForImport, withoutSupplierOwned } from '@/lib/catalogue/review'
import { autopopulateProduct } from '@/lib/supplier/autopopulate'
import { addImportedProducts, getImportedProducts, syncPortalRuntime } from '@/lib/portal/store'

export const dynamic = 'force-dynamic'

/**
 * The live feed is paged and rate-limited, so a first build takes tens of
 * seconds. The platform default (10–15s) cuts that off mid-flight and answers
 * with a gateway error page, which is what left the hub stuck on "Loading the
 * PowerBody feed…". The adapter keeps itself under its own wall-clock budget
 * (`POWERBODY_BUILD_DEADLINE_MS`); this is the outer limit that must sit above it.
 */
export const maxDuration = 60

/**
 * GET — the full PowerBody feed with mapping preview + "already added" flags.
 *
 * Cheap by construction: this is the list half of their feed only, so it costs a
 * few paged calls whatever the catalogue's size. Rows come back with cost and
 * stock correct and `detailed: false` where the descriptive half has not been
 * fetched — that happens per product, when one is opened or added.
 */
export async function GET() {
  if (!(await isPortalAuthed())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  // Inside the try with everything else: resolving the supplier can throw on a
  // half-configured environment, and an unhandled throw here answers with an
  // HTML error page the browser cannot read as an error.
  try {
    await syncPortalRuntime()
    const supplier = await getSupplier()
    const [products, imported] = await Promise.all([supplier.listProducts(), getImportedProducts()])
    const addedIds = new Set(imported.map((p) => p.id))
    const { getPowerBodyCatalogueProgress } = await import('@/lib/supplier/powerbody/live')
    return NextResponse.json({
      source: supplier.name,
      count: products.length,
      // How much of the list already carries detail. Reporting it means a list
      // of bare SKUs reads as "not fetched yet", not "broken".
      progress: supplier.name === 'powerbody' ? getPowerBodyCatalogueProgress() : null,
      products: products.map((sp) => toSupplierRow(sp, addedIds)),
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to load the supplier feed.' },
      { status: 502 },
    )
  }
}

/** POST { skus, autopopulate? } — map the chosen supplier products, AI-fill the
 *  CHRGD attributes PowerBody doesn't send (claim-safe), and add them. */
export async function POST(req: Request) {
  if (!(await isPortalAuthed())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  let body: { skus?: unknown; autopopulate?: boolean }
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
    // Resolve the named SKUs directly rather than scanning the full catalogue:
    // the live supplier only details part of its feed per request, so going via
    // `listProducts` would import whichever ones happened to be detailed and
    // give the rest no name. This fetches detail for exactly what was asked for.
    const toAdd = await supplier.getProductsBySku(skus)
    if (toAdd.length === 0) {
      return NextResponse.json({ error: 'None of the given SKUs were found in the supplier feed.' }, { status: 404 })
    }
    const found = new Set(toAdd.map((p) => p.sku))
    const notFound = skus.filter((sku) => !found.has(sku))

    let aiUsed = false
    const mapped: import('@/lib/catalogue/types').CatalogueProduct[] = []
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
      // Held out of the shop and quiz until reviewed, carrying a record of which
      // fields came from PowerBody, which from our rules, and which from a model.
      mapped.push(asPendingReview(product, sourcesForImport(aiFields, aiUsed)))
    }

    await addImportedProducts(mapped)
    return NextResponse.json({
      ok: true,
      added: mapped.length,
      autopopulated: autopopulate,
      aiUsed,
      /** Nothing is sellable yet — the hub sends the founder to Review next. */
      pendingReview: mapped.length,
      ids: mapped.map((p) => p.id),
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
