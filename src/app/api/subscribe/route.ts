import { NextResponse } from 'next/server'

/**
 * POST /api/subscribe — retired.
 *
 * Body: { lines: SubscriptionCheckoutLine[], summary?: {...} }
 * Returns: { ok, checkoutUrl, mock } | { error }
 *
 * This used to create a Shopify cart whose lines carried a `sellingPlanId`, so
 * Shopify checkout set up the recurring subscription. Subscriptions are now
 * taken through Stripe (`/api/checkout` + `lib/recharge`) and the catalogue
 * comes from PowerBody, so there is no Shopify store to build a cart in.
 *
 * Kept — rather than deleted — because it is a public endpoint that something
 * outside this repo may still post to, and a validating placeholder is a kinder
 * answer than a 404. It validates the body exactly as before and returns the
 * placeholder checkout URL. Delete it once nothing calls it.
 */
export async function POST(req: Request) {
  let body: { lines?: unknown; summary?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (!Array.isArray(body.lines) || body.lines.length === 0) {
    return NextResponse.json({ error: 'lines must be a non-empty array' }, { status: 400 })
  }

  const lines = body.lines as { merchandiseId?: string; quantity?: number }[]
  for (const line of lines) {
    if (!line.merchandiseId || typeof line.quantity !== 'number') {
      return NextResponse.json({ error: 'Each line must have merchandiseId and quantity' }, { status: 400 })
    }
  }

  return NextResponse.json({ ok: true, mock: true, checkoutUrl: '#mock-subscription' })
}
