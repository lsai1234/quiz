import { NextResponse } from 'next/server'
import { getDataSource, getDataSourceMode } from '@/lib/data-source'
import { getPublicCatalogue, getResolvedCatalogue } from '@/lib/catalogue/resolve'
import { syncPortalRuntime } from '@/lib/portal/store'

// Don't cache — the portal can flip the data source / edit products at runtime.
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const debug = searchParams.has('debug')

  if (debug) {
    await syncPortalRuntime()
    const { products, source, error } = await getResolvedCatalogue()
    return NextResponse.json({
      dataSource: getDataSource(),
      mode: getDataSourceMode(),
      source,
      count: products.length,
      // Set when `real` is selected but nothing has been imported yet — the one
      // way this can look broken without being broken.
      error: error ?? null,
    })
  }

  // Public and unauthenticated — the shop fetches it on every visit — so the
  // products go out without what is ours alone: the review record (with the
  // approving founder's email), PowerBody's ids, price and servings provenance.
  // `toPublicProduct` says what is taken out and why the rest stays.
  const { products, source, error } = await getPublicCatalogue()
  return NextResponse.json({ products, source, count: products.length, ...(error ? { error } : {}) })
}
