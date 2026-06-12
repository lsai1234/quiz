import { NextResponse } from 'next/server'
import { fetchCatalogue } from '@/lib/shopify/catalogue'
import { SHOPIFY_LIVE } from '@/lib/shopify/operations'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const debug = searchParams.has('debug')

  // Debug mode: expose env var state without leaking full token
  if (debug) {
    const domain = process.env.NEXT_PUBLIC_SHOPIFY_STORE_DOMAIN
    const token = process.env.NEXT_PUBLIC_SHOPIFY_STOREFRONT_TOKEN
    return NextResponse.json({
      shopifyLive: SHOPIFY_LIVE,
      domainSet: !!domain,
      domainValue: domain ?? null,
      tokenSet: !!token,
      tokenPreview: token ? `${token.slice(0, 6)}...${token.slice(-4)}` : null,
      apiVersion: process.env.NEXT_PUBLIC_SHOPIFY_API_VERSION ?? '2024-10 (default)',
    })
  }

  try {
    const products = await fetchCatalogue()
    const source = products[0]?.shopifyProductId?.startsWith('gid://') ? 'shopify' : 'mock'
    return NextResponse.json({ products, source, count: products.length })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[api/products] Shopify error:', message)
    // Return mocks so the UI never breaks, but surface the error for debugging
    const { MOCK_PRODUCTS } = await import('@/lib/mock-products')
    return NextResponse.json({
      products: MOCK_PRODUCTS,
      source: 'mock',
      count: MOCK_PRODUCTS.length,
      shopifyError: message,
    })
  }
}

// Revalidate every 5 minutes so the Next.js cache stays fresh
export const revalidate = 300
