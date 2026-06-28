import { NextResponse } from 'next/server'
import { isPortalAuthed } from '@/lib/portal/guard'
import { getResolvedCatalogue } from '@/lib/catalogue/resolve'
import { getDataSource } from '@/lib/data-source'
import { setProductOverride, markProductRemoved } from '@/lib/portal/store'
import { productReadiness } from '@/lib/portal/readiness'
import type { CatalogueProduct } from '@/lib/catalogue/types'

export async function GET() {
  if (!(await isPortalAuthed())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { products, source, error } = await getResolvedCatalogue()
  const live = source === 'shopify'
  return NextResponse.json({
    source,
    error,
    products: products.map((p) => ({ product: p, readiness: productReadiness(p, { live }) })),
  })
}

export async function POST(req: Request) {
  if (!(await isPortalAuthed())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  let body: { id?: string; patch?: Partial<CatalogueProduct> }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }
  if (!body.id || !body.patch) {
    return NextResponse.json({ error: 'id and patch required' }, { status: 400 })
  }

  // Resolve the product (for its Shopify id) before recording the override.
  const { products } = await getResolvedCatalogue()
  const existing = products.find((p) => p.id === body.id)

  // Always record the override (so the app reflects it immediately, in either mode).
  setProductOverride(body.id, body.patch)

  // When live, also push the change to Shopify (tags + metafields).
  let shopify: { written: boolean; error?: string } = { written: false }
  if (getDataSource() === 'shopify' && existing) {
    try {
      const { writeProductConfig } = await import('@/lib/shopify/admin')
      await writeProductConfig({ ...existing, ...body.patch })
      shopify = { written: true }
    } catch (err) {
      shopify = { written: false, error: err instanceof Error ? err.message : String(err) }
    }
  }

  return NextResponse.json({ ok: true, shopify })
}

/** Remove a product from the catalogue (and from Shopify when live). */
export async function DELETE(req: Request) {
  if (!(await isPortalAuthed())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  let body: { id?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }
  if (!body.id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const { products } = await getResolvedCatalogue()
  const existing = products.find((p) => p.id === body.id)

  // When live, delete from Shopify first so we don't hide a product we failed to remove.
  let shopify: { deleted: boolean; error?: string } = { deleted: false }
  if (getDataSource() === 'shopify' && existing?.shopifyProductId) {
    try {
      const { deleteProduct } = await import('@/lib/shopify/admin')
      await deleteProduct(existing.shopifyProductId)
      shopify = { deleted: true }
    } catch (err) {
      return NextResponse.json(
        { error: 'Failed to delete from Shopify', detail: err instanceof Error ? err.message : String(err) },
        { status: 502 },
      )
    }
  }

  // Hide it from the catalogue everywhere (covers mock + imported products too).
  markProductRemoved(body.id)
  return NextResponse.json({ ok: true, shopify })
}
