import { NextResponse } from 'next/server'
import { isPortalAuthed } from '@/lib/portal/guard'
import { getSupplier } from '@/lib/supplier'
import { supplierProductToCatalogue } from '@/lib/supplier/mapping'
import { autopopulateProduct } from '@/lib/supplier/autopopulate'
import { addImportedProducts, getImportedProducts, syncPortalRuntime } from '@/lib/portal/store'

export const dynamic = 'force-dynamic'

/** One browsable row: the supplier product + how it maps + margin + whether it's
 *  already in our curated catalogue. */
function toRow(sp: import('@/lib/supplier/types').SupplierProduct, addedIds: Set<string>) {
  const mapped = supplierProductToCatalogue(sp)
  const margin = Math.round((sp.rrp - sp.wholesalePrice) * 100) / 100
  const marginPct = sp.rrp > 0 ? Math.round((margin / sp.rrp) * 100) : 0
  return {
    sku: sp.sku,
    name: sp.name,
    brand: sp.brand,
    category: sp.category,
    imageUrl: sp.imageUrl,
    wholesalePrice: sp.wholesalePrice,
    rrp: sp.rrp,
    currency: sp.currency,
    stock: sp.stock,
    inStock: sp.inStock,
    margin,
    marginPct,
    mappedId: mapped.id,
    stackSlots: mapped.stackSlots,
    hasStimulants: mapped.hasStimulants,
    alreadyAdded: addedIds.has(mapped.id),
  }
}

/** GET — the full PowerBody feed with mapping preview + "already added" flags. */
export async function GET() {
  if (!(await isPortalAuthed())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  await syncPortalRuntime()
  const supplier = await getSupplier()
  try {
    const [products, imported] = await Promise.all([supplier.listProducts(), getImportedProducts()])
    const addedIds = new Set(imported.map((p) => p.id))
    const { getPowerBodyCatalogueProgress } = await import('@/lib/supplier/powerbody/live')
    return NextResponse.json({
      source: supplier.name,
      count: products.length,
      // Detail is fetched under a per-request budget (PowerBody rate-limit us),
      // so a big catalogue fills in over several loads. Reporting it means a
      // partially-named list reads as "still loading", not "broken".
      progress: supplier.name === 'powerbody' ? getPowerBodyCatalogueProgress() : null,
      products: products.map((sp) => toRow(sp, addedIds)),
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

  await syncPortalRuntime()
  const supplier = await getSupplier()
  try {
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
      if (autopopulate) {
        // Enrich the CHRGD-only attributes (claim-safe). Founder reviews in the
        // Products editor before launch — never blindly trusted.
        const { patch, source } = await autopopulateProduct(product)
        if (source === 'ai') aiUsed = true
        product = { ...product, ...patch }
      }
      mapped.push(product)
    }

    await addImportedProducts(mapped)
    return NextResponse.json({
      ok: true,
      added: mapped.length,
      autopopulated: autopopulate,
      aiUsed,
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
