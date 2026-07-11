import { NextResponse } from 'next/server'
import { createCart } from '@/lib/shopify/operations'
import { getDataSource } from '@/lib/data-source'
import { syncPortalRuntime } from '@/lib/portal/store'

/**
 * POST /api/subscribe
 *
 * Body: { lines: SubscriptionCheckoutLine[], summary?: {...} }
 * Returns: { ok, checkoutUrl, mock? } | { error }
 *
 * Starts a subscription. In live mode this creates a Shopify cart whose lines
 * carry a `sellingPlanId` + quantity, so Shopify checkout creates the recurring
 * subscription (and Recharge picks it up). In mock mode it returns a placeholder
 * so the UI can show the confirmation.
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

  const lines = body.lines as {
    merchandiseId?: string
    quantity?: number
    sellingPlanId?: string | null
    attributes?: { key: string; value: string }[]
  }[]
  for (const line of lines) {
    if (!line.merchandiseId || typeof line.quantity !== 'number') {
      return NextResponse.json({ error: 'Each line must have merchandiseId and quantity' }, { status: 400 })
    }
  }

  await syncPortalRuntime()
  if (getDataSource() === 'mock') {
    return NextResponse.json({ ok: true, mock: true, checkoutUrl: '#mock-subscription' })
  }

  try {
    const cart = await createCart(
      lines.map((l) => ({
        merchandiseId: l.merchandiseId!,
        quantity: l.quantity!,
        // Only attach a selling plan when one is configured; a null would be rejected.
        ...(l.sellingPlanId ? { sellingPlanId: l.sellingPlanId } : {}),
        attributes: l.attributes,
      })),
    )
    return NextResponse.json({ ok: true, checkoutUrl: cart.checkoutUrl })
  } catch (err) {
    console.error('[/api/subscribe] subscription cart creation failed:', err)
    return NextResponse.json({ error: 'Failed to start subscription. Please try again.' }, { status: 502 })
  }
}
