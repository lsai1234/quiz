import { NextResponse } from 'next/server'
import { getDataSource, getDataSourceMode } from '@/lib/data-source'
import { getResolvedCatalogue } from '@/lib/catalogue/resolve'
import { catalogueToProducts } from '@/lib/catalogue/adapter'
import { syncPortalRuntime } from '@/lib/portal/store'

// The portal can flip the data source / edit products at runtime.
export const dynamic = 'force-dynamic'

/**
 * The quiz's product list, in the legacy `Product` shape.
 *
 * Now served from the resolved catalogue — the same source the shop and hub
 * read — rather than from Shopify, so all three agree on what exists. The
 * adapter in `catalogue/adapter.ts` does the shape conversion.
 */
export async function GET(request: Request) {
  await syncPortalRuntime()
  const { products: catalogue, source, error } = await getResolvedCatalogue()
  const products = catalogueToProducts(catalogue)

  if (new URL(request.url).searchParams.has('debug')) {
    return NextResponse.json({
      dataSource: getDataSource(),
      mode: getDataSourceMode(),
      count: products.length,
      error: error ?? null,
    })
  }

  return NextResponse.json({ products, source, count: products.length, ...(error ? { error } : {}) })
}
