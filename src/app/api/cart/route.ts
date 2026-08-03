import { NextResponse } from 'next/server'
import { getPaymentSource } from '@/lib/payments'
import { getResolvedCatalogue } from '@/lib/catalogue/resolve'
import { getHubUser } from '@/lib/auth/session'
import { getSubscription } from '@/lib/db/hub-data'
import { createOrderFromCheckout, newOrderId } from '@/lib/orders/service'
import { syncPortalRuntime } from '@/lib/portal/store'
import { priceOneOffLines, unitCostOf } from '@/lib/stack-blueprint/pricing'
import type { CatalogueProduct, CatalogueVariant } from '@/lib/catalogue/types'
import type { OrderChannel, OrderLine } from '@/lib/orders/types'

/**
 * POST /api/cart
 *
 * Body: { lines: CheckoutLineItem[] }  (shop basket or quiz one-off stack)
 * Returns: { checkoutUrl, mock?, orderId? } | { error }
 *
 * Prices every line server-side from the catalogue (the client's numbers are
 * never trusted) and raises an order. In Stripe mode it pre-creates a pending
 * order and returns a hosted Checkout URL (the webhook marks it paid); in mock
 * mode it records the order as paid immediately and returns the `#mock-checkout`
 * placeholder so the existing success UI is unchanged. Guest checkout is allowed
 * — a signed-in hub user is attached when present.
 */
interface IncomingLine {
  merchandiseId?: string
  quantity?: number
  attributes?: { key: string; value: string }[]
}

function channelFrom(lines: IncomingLine[]): OrderChannel {
  const source = lines[0]?.attributes?.find((a) => a.key === 'source')?.value ?? ''
  return source.includes('quiz') ? 'quiz' : 'shop'
}

function originFrom(req: Request): string {
  return process.env.APP_URL || req.headers.get('origin') || new URL(req.url).origin
}

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
  const lines = body.lines as IncomingLine[]
  for (const line of lines) {
    if (!line.merchandiseId || typeof line.quantity !== 'number' || line.quantity <= 0) {
      return NextResponse.json({ error: 'Each line must have merchandiseId and a positive quantity' }, { status: 400 })
    }
  }

  await syncPortalRuntime()
  const { products } = await getResolvedCatalogue()

  // Resolve each merchandiseId to a catalogue variant (by internal id, or the
  // Shopify variant id if one is ever attached) so the price is authoritative.
  const byMerchId = new Map<string, { product: CatalogueProduct; variant: CatalogueVariant }>()
  for (const product of products) {
    for (const variant of product.variants) {
      byMerchId.set(variant.id, { product, variant })
      if (variant.shopifyVariantId) byMerchId.set(variant.shopifyVariantId, { product, variant })
    }
  }

  // Resolve every line to its catalogue price + cost first, then price the whole
  // order in ONE pass — the bundle tier depends on the order total, so a line
  // cannot be priced in isolation.
  const matched: { product: CatalogueProduct; variant: CatalogueVariant; quantity: number }[] = []
  for (const line of lines) {
    const match = byMerchId.get(line.merchandiseId!)
    if (!match) continue // stale/unknown line — drop it
    matched.push({ ...match, quantity: line.quantity! })
  }

  /**
   * The discount, applied server-side, from the same function the storefront
   * displays (`priceOneOffLines`).
   *
   * This used to bill `variant.price` — the raw list price — so the quiz showed
   * a tier-discounted total and Stripe charged the undiscounted one, and the
   * shop never applied the configured tiers at all. Both the number on screen
   * and the number on the card now come from here.
   */
  const priced = priceOneOffLines(
    matched.map((m) => ({
      price: m.variant.price,
      cost: unitCostOf(m.product, m.variant.price),
      quantity: m.quantity,
    })),
  )

  const orderLines: OrderLine[] = matched.map((m, i) => ({
    sku: m.variant.sku ?? null,
    productId: m.product.id,
    title: m.product.title,
    variantTitle: m.variant.flavour || m.variant.size || null,
    quantity: m.quantity,
    unitPrice: priced.lines[i].discountedUnitPrice,
    supplierCost: m.product.cost ?? null,
  }))

  if (orderLines.length === 0) {
    return NextResponse.json({ error: 'None of the basket lines could be matched to a product.' }, { status: 400 })
  }

  const channel = channelFrom(lines)
  const user = await getHubUser().catch(() => null)

  // A signed-in member who already has a Stripe customer (from subscribing)
  // should buy one-offs against the SAME customer, so their orders, cards and
  // receipts live in one place rather than a new record per purchase. Guests
  // have none, and Stripe creates one for them.
  const stripeCustomerId = user ? (await getSubscription(user.id))?.stripeCustomerId ?? null : null

  // ── Stripe ──
  if (getPaymentSource() === 'stripe') {
    const orderId = newOrderId()
    await createOrderFromCheckout({
      id: orderId,
      status: 'pending_payment',
      channel,
      lines: orderLines,
      userId: user?.id ?? null,
      email: user?.email ?? null,
    })
    try {
      const { createCheckoutSession } = await import('@/lib/payments/stripe')
      const origin = originFrom(req)
      const { url } = await createCheckoutSession({
        lines: orderLines.map((l) => ({
          name: l.variantTitle ? `${l.title} – ${l.variantTitle}` : l.title,
          unitPrice: l.unitPrice,
          quantity: l.quantity,
        })),
        clientReferenceId: orderId,
        customerId: stripeCustomerId,
        customerEmail: user?.email ?? null,
        // Stripe substitutes {CHECKOUT_SESSION_ID}; the confirmation endpoint then
        // verifies it server-side. Arrival here proves nothing on its own.
        successUrl: `${origin}/order/confirmation?session_id={CHECKOUT_SESSION_ID}`,
        cancelUrl: `${origin}/shop?checkout=cancelled`,
        metadata: { orderId, channel },
      })
      if (!url) return NextResponse.json({ error: 'Stripe did not return a checkout URL.' }, { status: 502 })
      return NextResponse.json({ checkoutUrl: url, orderId })
    } catch (err) {
      console.error('[/api/cart] Stripe session creation failed:', err)
      return NextResponse.json({ error: 'Failed to start checkout. Please try again.' }, { status: 502 })
    }
  }

  // ── Mock ── record a paid order immediately so the hub + fulfilment flow can
  // be exercised without Stripe, and return the placeholder URL.
  const order = await createOrderFromCheckout({
    channel,
    lines: orderLines,
    userId: user?.id ?? null,
    email: user?.email ?? null,
    status: 'paid',
  })
  return NextResponse.json({ checkoutUrl: '#mock-checkout', mock: true, orderId: order.id })
}
