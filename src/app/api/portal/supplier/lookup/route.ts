import { NextResponse } from 'next/server'
import { isPortalAuthed } from '@/lib/portal/guard'
import { getSupplier } from '@/lib/supplier'
import { toSupplierRow } from '@/lib/supplier/row'
import { getImportedProducts, syncPortalRuntime } from '@/lib/portal/store'
import { MAX_LOOKUP_SKUS, readSkuList } from '@/lib/supplier/sku-input'

export const dynamic = 'force-dynamic'

/** Resolving a SKU pages the (rate-limited) list feed, so give it room — the
 *  platform default would cut it off and answer with an unreadable error page. */
export const maxDuration = 60

/**
 * POST { skus } — resolve specific SKUs against the supplier, with detail.
 *
 * Browsing reads PowerBody's cheap list feed, which has no names or RRP in it.
 * This is where the expensive half is bought: given SKUs it fetches their full
 * records, so it backs both "look this code up" and the Details button on a
 * browse row. Rate-limited by the transport and capped at `MAX_LOOKUP_SKUS`,
 * because it is one supplier call per product asked for.
 *
 * Read-only — resolving a SKU adds nothing. `POST /api/portal/supplier` does the
 * importing.
 */
export async function POST(req: Request) {
  if (!(await isPortalAuthed())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { skus?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }

  const skus = readSkuList(body.skus)

  if (skus.length === 0) {
    return NextResponse.json({ error: 'Give at least one SKU.' }, { status: 400 })
  }
  if (skus.length > MAX_LOOKUP_SKUS) {
    return NextResponse.json(
      { error: `Too many SKUs at once (${skus.length}). Look up ${MAX_LOOKUP_SKUS} or fewer.` },
      { status: 400 },
    )
  }

  try {
    await syncPortalRuntime()
    const supplier = await getSupplier()
    const [products, imported] = await Promise.all([supplier.getProductsBySku(skus), getImportedProducts()])
    const addedIds = new Set(imported.map((p) => p.id))
    const found = new Set(products.map((p) => p.sku))

    return NextResponse.json({
      // Same row shape as the browse feed, so the page can drop these straight
      // into the list it is already showing. These are always fully detailed —
      // fetching that detail is what this endpoint is for.
      products: products.map((sp) => toSupplierRow(sp, addedIds)),
      source: supplier.name,
      notFound: skus.filter((sku) => !found.has(sku)),
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Could not reach the supplier.' },
      { status: 502 },
    )
  }
}
