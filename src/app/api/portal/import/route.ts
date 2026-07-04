import { NextResponse } from 'next/server'
import { isPortalAuthed } from '@/lib/portal/guard'
import { getDataSource } from '@/lib/data-source'
import { addImportedProducts } from '@/lib/portal/store'
import { parseImportCsv } from '@/lib/portal/import'
import type { CatalogueProduct } from '@/lib/catalogue/types'

/**
 * POST { csv }                → validated preview (no writes)
 * POST { csv, confirm: true } → import all valid rows (mock store or live Shopify)
 */
export async function POST(req: Request) {
  if (!(await isPortalAuthed())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { csv?: string; confirm?: boolean }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }
  if (typeof body.csv !== 'string' || !body.csv.trim()) {
    return NextResponse.json({ error: 'csv is required' }, { status: 400 })
  }

  const preview = parseImportCsv(body.csv)

  // Preview mode — just return validation results.
  if (!body.confirm) {
    return NextResponse.json({ preview })
  }

  const valid = preview.rows.filter((r) => r.errors.length === 0 && r.product).map((r) => r.product!)
  if (valid.length === 0) {
    return NextResponse.json({ error: 'No valid rows to import', preview }, { status: 400 })
  }

  const live = getDataSource() === 'shopify'
  const results: { id: string; ok: boolean; error?: string }[] = []
  const toStore: CatalogueProduct[] = []

  if (live) {
    const { createProduct } = await import('@/lib/shopify/admin')
    for (const product of valid) {
      try {
        const { shopifyProductId, variantIds } = await createProduct(product)
        toStore.push({
          ...product,
          shopifyProductId,
          variants: product.variants.map((v) => ({ ...v, shopifyVariantId: variantIds[v.id] ?? null })),
        })
        results.push({ id: product.id, ok: true })
      } catch (err) {
        results.push({ id: product.id, ok: false, error: err instanceof Error ? err.message : String(err) })
      }
    }
  } else {
    for (const product of valid) {
      toStore.push(product)
      results.push({ id: product.id, ok: true })
    }
  }

  if (toStore.length > 0) await addImportedProducts(toStore)

  return NextResponse.json({
    ok: true,
    imported: toStore.length,
    failed: results.filter((r) => !r.ok).length,
    source: live ? 'shopify' : 'mock',
    results,
  })
}
