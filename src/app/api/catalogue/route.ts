import { NextResponse } from 'next/server'
import { SHOPIFY_LIVE } from '@/lib/shopify/operations'
import { MOCK_CATALOGUE } from '@/lib/catalogue/mock-catalogue'
import type { CatalogueProduct } from '@/lib/catalogue/types'

// Revalidate every 5 minutes so the Next.js cache stays fresh
export const revalidate = 300

let _catalogueCache: CatalogueProduct[] | null = null
let _cacheTime = 0
const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes

async function fetchShopifyCatalogue(): Promise<CatalogueProduct[]> {
  const now = Date.now()
  if (_catalogueCache && now - _cacheTime < CACHE_TTL_MS) return _catalogueCache

  const { getProducts } = await import('@/lib/shopify/operations')
  const { mapShopifyToCatalogueProduct } = await import('@/lib/shopify/catalogue')

  const shopifyProducts = await getProducts(50)
  _catalogueCache = shopifyProducts.map(mapShopifyToCatalogueProduct)
  _cacheTime = now
  return _catalogueCache
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const debug = searchParams.has('debug')

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

  if (!SHOPIFY_LIVE) {
    return NextResponse.json({
      products: MOCK_CATALOGUE,
      source: 'mock',
      count: MOCK_CATALOGUE.length,
    })
  }

  try {
    const products = await fetchShopifyCatalogue()
    return NextResponse.json({
      products,
      source: 'shopify',
      count: products.length,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[api/catalogue] Shopify error:', message)
    return NextResponse.json({
      products: MOCK_CATALOGUE,
      source: 'mock',
      count: MOCK_CATALOGUE.length,
      shopifyError: message,
    })
  }
}
