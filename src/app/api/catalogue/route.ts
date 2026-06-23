import { NextResponse } from 'next/server'
import { getDataSource, getDataSourceMode, hasShopifyCredentials } from '@/lib/data-source'
import { getResolvedCatalogue } from '@/lib/catalogue/resolve'

// Don't cache — the portal can flip the data source / edit products at runtime.
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const debug = searchParams.has('debug')

  if (debug) {
    const domain = process.env.NEXT_PUBLIC_SHOPIFY_STORE_DOMAIN
    const token = process.env.NEXT_PUBLIC_SHOPIFY_STOREFRONT_TOKEN
    return NextResponse.json({
      dataSource: getDataSource(),
      mode: getDataSourceMode(),
      hasCredentials: hasShopifyCredentials(),
      domainSet: !!domain,
      domainValue: domain ?? null,
      tokenSet: !!token,
      tokenPreview: token ? `${token.slice(0, 6)}...${token.slice(-4)}` : null,
      apiVersion: process.env.NEXT_PUBLIC_SHOPIFY_API_VERSION ?? '2024-10 (default)',
    })
  }

  const { products, source } = await getResolvedCatalogue()
  return NextResponse.json({ products, source, count: products.length })
}
