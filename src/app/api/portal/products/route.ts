import { NextResponse } from 'next/server'
import { isPortalAuthed } from '@/lib/portal/guard'
import { getResolvedCatalogue } from '@/lib/catalogue/resolve'
import { getDataSource } from '@/lib/data-source'
import { setProductOverride, markProductRemoved, syncPortalRuntime } from '@/lib/portal/store'
import { productReadiness } from '@/lib/portal/readiness'
import type { CatalogueProduct } from '@/lib/catalogue/types'

export async function GET() {
  if (!(await isPortalAuthed())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { products, source, error } = await getResolvedCatalogue()
  const live = source === 'real'
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

  // The override IS the edit. Our catalogue is ours: products come in from the
  // PowerBody feed and are curated here, so there is no upstream store to push
  // a change back to — PowerBody's own product data is theirs and read-only.
  await syncPortalRuntime()
  await setProductOverride(body.id, body.patch)

  return NextResponse.json({ ok: true })
}

/** Remove a product from the catalogue. */
export async function DELETE(req: Request) {
  if (!(await isPortalAuthed())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  let body: { id?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }
  if (!body.id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  // Hide it from the catalogue everywhere (covers mock + imported products too).
  await syncPortalRuntime()
  await markProductRemoved(body.id)
  return NextResponse.json({ ok: true })
}
