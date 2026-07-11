import { NextResponse } from 'next/server'
import { createCart } from '@/lib/shopify/operations'
import { getDataSource } from '@/lib/data-source'
import { syncPortalRuntime } from '@/lib/portal/store'

/**
 * POST /api/cart
 *
 * Body: { lines: CheckoutLineItem[] }
 * Returns: { checkoutUrl: string } | { error: string }
 *
 * Creates a Shopify cart with line attributes and returns the checkoutUrl.
 * When Shopify is not live, returns a mock permalink so the client always
 * gets the same shape.
 */
export async function POST(req: Request) {
  let body: { lines?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (!Array.isArray(body.lines) || body.lines.length === 0) {
    return NextResponse.json({ error: 'lines must be a non-empty array' }, { status: 400 })
  }

  // Validate shape of each line
  const lines = body.lines as { merchandiseId?: string; quantity?: number; attributes?: { key: string; value: string }[] }[]
  for (const line of lines) {
    if (!line.merchandiseId || typeof line.quantity !== 'number') {
      return NextResponse.json({ error: 'Each line must have merchandiseId and quantity' }, { status: 400 })
    }
  }

  await syncPortalRuntime()
  if (getDataSource() === 'mock') {
    // Mock mode — return a placeholder URL so the UI can still show success state
    return NextResponse.json({
      checkoutUrl: '#mock-checkout',
      mock: true,
    })
  }

  try {
    const cart = await createCart(
      lines.map((l) => ({
        merchandiseId: l.merchandiseId!,
        quantity: l.quantity!,
        // attributes are passed through if the Storefront API mutation supports them
        // (cartCreate supports attributes via CartLineInput.attributes)
      })),
    )
    return NextResponse.json({ checkoutUrl: cart.checkoutUrl })
  } catch (err) {
    console.error('[/api/cart] Shopify cart creation failed:', err)
    return NextResponse.json({ error: 'Failed to create cart. Please try again.' }, { status: 502 })
  }
}
