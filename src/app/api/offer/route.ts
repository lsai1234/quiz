import { NextResponse } from 'next/server'
import { getResolvedCatalogue } from '@/lib/catalogue/resolve'
import { getOfferSettings } from '@/lib/offer/store'
import { publicOffer } from '@/lib/offer/public'
import { DEFAULT_OFFER } from '@/lib/offer/settings'

/**
 * GET /api/offer → the offer settings the results page reads (plan Phase 4):
 * the heroes that take effect and the bonus as customers may see it, with the
 * hub's audit fields left out (`publicOffer`). Public; the checkout re-checks
 * everything the page chose (`/api/cart`).
 */
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const [settings, { products }] = await Promise.all([getOfferSettings(), getResolvedCatalogue()])
    return NextResponse.json({ offer: publicOffer(settings, products) }, { headers: { 'cache-control': 'no-store' } })
  } catch {
    // Unreadable settings read as everything off: today's top pick, no bonus.
    return NextResponse.json({ offer: DEFAULT_OFFER }, { headers: { 'cache-control': 'no-store' } })
  }
}
