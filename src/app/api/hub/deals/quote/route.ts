import { NextResponse } from 'next/server'
import { getHubUser } from '@/lib/auth/session'
import { getResolvedCatalogue } from '@/lib/catalogue/resolve'
import { publicBox, quoteBox } from '@/lib/deals/box'
import { dealsFor } from '@/lib/deals/server'
import { getOfferSettings } from '@/lib/offer/store'

/**
 * POST /api/hub/deals/quote { variantIds } → PublicBox
 *
 * What a top-up box of the member's own deals costs, as the checkout will
 * price it: open deals, and anything due within 30 days alongside one. Prices
 * only, never our costs.
 */
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const user = await getHubUser()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  let body: { variantIds?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  const ids = Array.isArray(body.variantIds) ? [...new Set(body.variantIds.filter((x): x is string => typeof x === 'string'))].slice(0, 12) : []
  const state = await dealsFor(user)
  const picked = ids.map((id) => state.deals.find((d) => d.variantId === id))
  if (!state.enabled || !ids.length || picked.some((d) => !d || !d.boxable) || !picked.some((d) => d!.state === 'open')) {
    return NextResponse.json({ error: 'Pick at least one open member price.' }, { status: 400 })
  }
  const { products } = await getResolvedCatalogue()
  const items = picked.map((d) => {
    const product = products.find((p) => p.id === d!.productId)!
    return { product, variant: product.variants.find((v) => v.id === d!.variantId)! }
  })
  if (items.some((i) => !i.product || !i.variant)) return NextResponse.json({ error: 'That product isn’t available.' }, { status: 409 })
  const settings = await getOfferSettings()
  return NextResponse.json(publicBox(quoteBox(items, settings.memberDeals)))
}
