import { NextResponse } from 'next/server'
import { getPaymentSource } from '@/lib/payments'
import { getResolvedCatalogue } from '@/lib/catalogue/resolve'
import { getHubUser } from '@/lib/auth/session'
import { getSubscription } from '@/lib/db/hub-data'
import { createOrderFromCheckout, newOrderId } from '@/lib/orders/service'
import { syncPortalRuntime } from '@/lib/portal/store'
import { formatGBP, getPricingConfig, priceOneOffLines, unitCostOf } from '@/lib/stack-blueprint/pricing'
import { redeemPartnerCode, recordCodeUse } from '@/lib/partners/redeem'
import { resolveCheckoutCode } from '@/lib/partners/referral'
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
  variantId?: string
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
  let body: { lines?: unknown; partnerCode?: unknown }
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
    if (!line.variantId || typeof line.quantity !== 'number' || line.quantity <= 0) {
      return NextResponse.json({ error: 'Each line must have variantId and a positive quantity' }, { status: 400 })
    }
  }

  await syncPortalRuntime()
  const { products } = await getResolvedCatalogue()

  // Resolve each variantId to a catalogue variant (by internal id, or the
  // catalogue variant id) so the price is authoritative.
  const byMerchId = new Map<string, { product: CatalogueProduct; variant: CatalogueVariant }>()
  for (const product of products) {
    for (const variant of product.variants) {
      byMerchId.set(variant.id, { product, variant })
    }
  }

  // Resolve every line to its catalogue price + cost first, then price the whole
  // order in ONE pass — the bundle tier depends on the order total, so a line
  // cannot be priced in isolation.
  const matched: { product: CatalogueProduct; variant: CatalogueVariant; quantity: number }[] = []
  for (const line of lines) {
    const match = byMerchId.get(line.variantId!)
    if (!match) continue // stale/unknown line — drop it
    matched.push({ ...match, quantity: line.quantity! })
  }

  const pricedLines = matched.map((m) => ({
    price: m.variant.price,
    cost: unitCostOf(m.product, m.variant.price),
    quantity: m.quantity,
  }))

  const user = await getHubUser().catch(() => null)

  /**
   * Re-validate the partner code HERE, against the undiscounted subtotal.
   *
   * `/api/partner-code` already checked it while they were typing, but that was
   * advisory: between then and now the code can be paused, capped out or its
   * partner suspended, and the browser is free to send whatever it likes. A bad
   * code is not a failed checkout — it silently bills full price would be worse,
   * so the response says so and the basket can show it.
   */
  const undiscountedSubtotal = pricedLines.reduce((s, l) => s + l.price * Math.max(1, l.quantity), 0)
  const typedCode = typeof body.partnerCode === 'string' ? body.partnerCode : null
  // What they typed, or failing that the code their link left in a cookie. The
  // server does this so no journey can lose a referral by not having rendered
  // the code box — "Buy now" goes straight to Stripe without one.
  const code = await resolveCheckoutCode(typedCode)
  // The channel decides eligibility as well as reporting: codes work on stacks
  // and bundles, not on single products off the shop shelf (`worksOn`). Read
  // from the line attributes, which the client sends — but a client claiming to
  // be the quiz can only reach a stack it also has to pay for at these prices,
  // so the worst it buys is the discount it could have had by using the quiz.
  const channel = channelFrom(lines)
  const redemption = code
    ? await redeemPartnerCode(code, { subtotal: undiscountedSubtotal, email: user?.email ?? null, channel })
    : null
  // A code somebody TYPED and got wrong is worth stopping for — that basket is
  // still on screen and can be fixed. A stale cookie they never typed is not:
  // failing the checkout over it would punish someone for a link they clicked
  // weeks ago, so it just attributes nothing.
  if (redemption && !redemption.ok && typedCode) {
    return NextResponse.json({ error: redemption.reason, codeRejected: true }, { status: 400 })
  }
  const partnerPct = redemption?.ok ? redemption.discountPct : 0

  /**
   * The discount, applied server-side, from the same function the storefront
   * displays (`priceOneOffLines`).
   *
   * This used to bill `variant.price` — the raw list price — so the quiz showed
   * a tier-discounted total and Stripe charged the undiscounted one, and the
   * shop never applied the configured tiers at all. Both the number on screen
   * and the number on the card now come from here.
   */
  const priced = priceOneOffLines(pricedLines, getPricingConfig(), partnerPct)

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

  // The minimum order, enforced SERVER-SIDE.
  //
  // PowerBody charge us per parcel whatever is in it, so below this there is no
  // basket we can send without losing money — and a one-off has no renewal
  // behind it to make it back. The basket UI blocks it too, but a UI check is a
  // courtesy; this is the one that counts.
  const config = getPricingConfig()
  if (config.minOrderValue > 0 && priced.subtotal < config.minOrderValue) {
    return NextResponse.json(
      {
        error: `Orders start at ${formatGBP(config.minOrderValue)} — add ${formatGBP(
          Math.round((config.minOrderValue - priced.subtotal) * 100) / 100,
        )} more to check out.`,
        minimumOrderValue: config.minOrderValue,
        subtotal: priced.subtotal,
      },
      { status: 400 },
    )
  }

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
      partnerCode: redemption?.ok ? redemption.code.code : null,
      partnerDiscountPct: redemption?.ok ? redemption.discountPct : null,
    })
    // The code is spent when an order exists, not when someone types it — a cap
    // that counted attempts would exhaust itself on people who never bought.
    if (redemption?.ok) await recordCodeUse(redemption.code.code)
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
    partnerCode: redemption?.ok ? redemption.code.code : null,
    partnerDiscountPct: redemption?.ok ? redemption.discountPct : null,
  })
  if (redemption?.ok) await recordCodeUse(redemption.code.code)
  return NextResponse.json({ checkoutUrl: '#mock-checkout', mock: true, orderId: order.id })
}
