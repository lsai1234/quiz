import { NextResponse } from 'next/server'
import { getIntroOffer } from '@/lib/payments/intro-offer'

/**
 * GET /api/intro-offer
 *
 * The current global first-month intro offer (the live ladder rung everyone
 * sees). The reveal fetches this to show "X% off your first month — up to Y%".
 * Never throws: a failure returns a zero offer so the reveal just shows no intro.
 */
export async function GET() {
  try {
    return NextResponse.json(await getIntroOffer())
  } catch {
    return NextResponse.json({ discount: 0, pct: 0, headlinePct: 0 })
  }
}
