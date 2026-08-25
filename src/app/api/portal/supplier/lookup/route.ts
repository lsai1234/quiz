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
 * POST { skus?, productIds? } — resolve specific products against the supplier,
 * with detail. At least one of the two is required; both may be given.
 *
 * The way in. PowerBody's cheap feed has no names or RRP in it; this buys the
 * expensive half for the products actually being considered, so what comes back
 * is a whole product — picture, name, brand, real RRP, live stock. Rate-limited
 * by the transport and capped at `MAX_LOOKUP_SKUS` per list, because it is one
 * supplier call per product asked for.
 *
 * TWO WAYS IN, AND THEY COST DIFFERENT THINGS
 * ───────────────────────────────────────────
 * A SKU has to be SEARCHED for: the detail call is keyed on PowerBody's product
 * id, and the only way to map one to the other is to page the list feed. That
 * walk stops early when the SKU is there and reads the entire catalogue when it
 * is not — which is why an unknown SKU tends to surface as a timeout rather than
 * as "not in the feed".
 *
 * A product id needs no search at all. It goes straight to `getProductInfo`, so
 * it is one call, no paging, and nothing that can exhaust the build deadline.
 * It is the dependable path for a product you can already identify, and the way
 * through when the feed is slow or a SKU cannot be found in it.
 *
 * Read-only — resolving adds nothing. `POST /api/portal/supplier` imports.
 */
export async function POST(req: Request) {
  if (!(await isPortalAuthed())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { skus?: unknown; productIds?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }

  // Product ids arrive the same way SKUs do — a pasted column, a comma'd line —
  // so they get the same tolerant parsing.
  const skus = readSkuList(body.skus)
  const productIds = readSkuList(body.productIds)

  if (skus.length === 0 && productIds.length === 0) {
    return NextResponse.json({ error: 'Give at least one SKU or product ID.' }, { status: 400 })
  }
  const tooMany = skus.length > MAX_LOOKUP_SKUS ? skus.length : productIds.length > MAX_LOOKUP_SKUS ? productIds.length : 0
  if (tooMany > 0) {
    return NextResponse.json(
      { error: `Too many at once (${tooMany}). Look up ${MAX_LOOKUP_SKUS} or fewer.` },
      { status: 400 },
    )
  }

  try {
    await syncPortalRuntime()
    const supplier = await getSupplier()
    const [bySku, byId, imported] = await Promise.all([
      skus.length > 0 ? supplier.getProductsBySku(skus) : Promise.resolve([]),
      productIds.length > 0 ? supplier.getProductsById(productIds) : Promise.resolve([]),
      getImportedProducts(),
    ])
    const addedIds = new Set(imported.map((p) => p.id))

    const foundSkus = new Set(bySku.map((p) => p.sku))
    const foundIds = new Set(byId.map((p) => p.productId).filter((id): id is string => Boolean(id)))

    // Asking for the same product both ways is a reasonable thing to do while
    // working out which path answers — it should not come back twice. The SKU
    // row wins: it carries a live list row over the detail, so its price and
    // stock are the fresher of the two.
    const seen = new Set<string>()
    const products = [...bySku, ...byId].filter((p) => {
      const key = p.productId ?? `sku:${p.sku}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })

    return NextResponse.json({
      // Always fully detailed — fetching that detail is what this endpoint is
      // for, and it is what makes an imported product a whole product.
      products: products.map((sp) => toSupplierRow(sp, addedIds)),
      source: supplier.name,
      notFound: skus.filter((sku) => !foundSkus.has(sku)),
      // Kept separate from `notFound` so the screen can say which kind of code
      // failed — a SKU that is not in the feed and an id PowerBody would not
      // answer for are different problems with different fixes.
      notFoundIds: productIds.filter((id) => !foundIds.has(id)),
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Could not reach the supplier.' },
      { status: 502 },
    )
  }
}
