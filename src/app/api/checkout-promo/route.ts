import { NextResponse } from 'next/server'
import { liveCheckoutPromo } from '@/lib/store-codes'

/**
 * GET /api/checkout-promo → { promo: { code, percent, endsAt } | null }
 *
 * The store code the Founders Hub has chosen to advertise on the results page,
 * while it would actually be accepted. Public on purpose — it is a code we want
 * people to use — and the checkout still validates it like any typed code.
 */
export const dynamic = 'force-dynamic'

export async function GET() {
  const promo = await liveCheckoutPromo().catch(() => null)
  return NextResponse.json({ promo }, { headers: { 'cache-control': 'no-store' } })
}
