import { NextResponse } from 'next/server'
import { getDataSource, getDataSourceMode } from '@/lib/data-source'
import { getResolvedCatalogue } from '@/lib/catalogue/resolve'
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

  const { products, source, error } = await getResolvedCatalogue()
  return NextResponse.json({ products, source, count: products.length, ...(error ? { error } : {}) })
}
