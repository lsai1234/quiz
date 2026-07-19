import { NextResponse } from 'next/server'
import { getShopBundles } from '@/lib/bundles/store'

// Don't cache — the portal can add/edit/reorder bundles and flip the data
// source at runtime, and prices are computed from the live catalogue.
export const dynamic = 'force-dynamic'

/**
 * Public bundles feed for the shop row: published, sellable bundles only,
 * ordered by displayOrder, each with a live price summary. Bundles whose core
 * products no longer resolve are auto-hidden by the store.
 */
export async function GET() {
  const bundles = await getShopBundles()
  return NextResponse.json({ bundles, count: bundles.length })
}
