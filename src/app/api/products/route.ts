import { NextResponse } from 'next/server'
import { fetchCatalogue } from '@/lib/shopify/catalogue'

export async function GET() {
  try {
    const products = await fetchCatalogue()
    return NextResponse.json({ products, source: products[0]?.shopifyProductId?.startsWith('gid://') ? 'shopify' : 'mock' })
  } catch (err) {
    console.error('[api/products] error:', err)
    return NextResponse.json({ error: 'Failed to load catalogue' }, { status: 500 })
  }
}

// Revalidate every 5 minutes so the Next.js cache stays fresh
export const revalidate = 300
