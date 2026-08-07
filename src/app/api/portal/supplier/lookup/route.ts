import { NextResponse } from 'next/server'
import { isPortalAuthed } from '@/lib/portal/guard'
import { getSupplier } from '@/lib/supplier'
import { supplierProductToCatalogue } from '@/lib/supplier/mapping'
import { getImportedProducts, syncPortalRuntime } from '@/lib/portal/store'
import { MAX_LOOKUP_SKUS, readSkuList } from '@/lib/supplier/sku-input'

export const dynamic = 'force-dynamic'

/**
 * POST { skus } — resolve specific SKUs against the supplier, with detail.
 *
 * The browse page can only show what has been detailed so far (the live feed is
 * rate-limited, so it fills in over several loads). This is the way to reach a
 * product you already know the SKU of without waiting for that: it fetches
 * exactly those SKUs, so you can check what you're about to import and then add
 * it in one go.
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

  await syncPortalRuntime()
  const supplier = await getSupplier()
  try {
    const [products, imported] = await Promise.all([supplier.getProductsBySku(skus), getImportedProducts()])
    const addedIds = new Set(imported.map((p) => p.id))
    const found = new Set(products.map((p) => p.sku))

    return NextResponse.json({
      source: supplier.name,
      products: products.map((sp) => {
        const mapped = supplierProductToCatalogue(sp)
        const margin = Math.round((sp.rrp - sp.wholesalePrice) * 100) / 100
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
          marginPct: sp.rrp > 0 ? Math.round((margin / sp.rrp) * 100) : 0,
          mappedId: mapped.id,
          stackSlots: mapped.stackSlots,
          hasStimulants: mapped.hasStimulants,
          alreadyAdded: addedIds.has(mapped.id),
        }
      }),
      notFound: skus.filter((sku) => !found.has(sku)),
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Could not reach the supplier.' },
      { status: 502 },
    )
  }
}
