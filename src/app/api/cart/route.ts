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
import {
  claimFounderCodeForCheckout,
  markFounderCodeUsed,
  releaseFounderCode,
} from '@/lib/founder-codes/redeem'
import { founderDeliveryOptions, priceAtFounderTerms } from '@/lib/founder-codes/codes'
import {
  claimStarterForCheckout,
  markStarterUsed,
  releaseStarter,
} from '@/lib/partner-starter/redeem'
import { priceStarterOrder, starterDeliveryOptions } from '@/lib/partner-starter/rules'
import { deliveryOptions } from '@/lib/pricing/delivery'
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

const round = (n: number) => Math.round(n * 100) / 100

function originFrom(req: Request): string {
  return process.env.APP_URL || req.headers.get('origin') || new URL(req.url).origin
}

export async function POST(req: Request) {
  let body: { lines?: unknown; partnerCode?: unknown; claimStarter?: unknown }
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

  // Nothing in the basket resolved to a live product. Checked HERE, before any
  // code is claimed, so a stale basket can never spend a single-use code on an
  // order that was never going to exist.
  if (matched.length === 0) {
    return NextResponse.json({ error: 'None of the basket lines could be matched to a product.' }, { status: 400 })
  }

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

  /**
   * Founder codes, before anything else, and only from what was TYPED.
   *
   * Never from the referral cookie. A partner's code arrives on a link and is
   * banked for thirty days on purpose; a founder code is an internal instrument
   * that can make an order cost nothing, and a cookie that could do that
   * silently — weeks later, on somebody else's basket — is not a thing worth
   * building. `resolveCheckoutCode` is for the partner path alone.
   *
   * The claim happens HERE rather than after the order is raised, and it is the
   * single-use lock: two tabs racing the same 100%-off code both reach this
   * line and exactly one of them gets a token. Everything after this point
   * either spends it (`markFounderCodeUsed`) or gives it back
   * (`releaseFounderCode`).
   */
  /**
   * A partner claiming their starter stack, before everything.
   *
   * ── There is no code here, and that is the design ─────────────────────────
   * The request carries an INTENT (`claimStarter`) and no identifier at all.
   * Who is claiming comes from the partner session cookie, which was set when
   * they signed their agreement and which a browser cannot forge. So the worst
   * a tampered request can do is claim the starter belonging to the person
   * already signed in — which is to say, ask for the thing we are giving them.
   *
   * It is tried first because it is the most specific instrument: checked
   * against a named partner, a signed agreement, a channel and a value cap, and
   * anything it refuses is refused with a reason that names the fix.
   */
  const claimingStarter = body.claimStarter === true
  const starterClaim = claimingStarter
    ? await claimStarterForCheckout({
        channel,
        // The list value, not what is being charged — which is zero by
        // construction and therefore inside every ceiling ever set.
        goodsListSubtotal: undiscountedSubtotal,
        format: formatGBP,
      })
    : null
  if (starterClaim && !starterClaim.ok) {
    return NextResponse.json({ error: starterClaim.reason, codeRejected: true }, { status: 400 })
  }
  const starter = starterClaim?.ok ? starterClaim : null

  const founderClaim = starter ? null : await claimFounderCodeForCheckout(typedCode, { channel })
  if (founderClaim && !founderClaim.ok) {
    return NextResponse.json({ error: founderClaim.reason, codeRejected: true }, { status: 400 })
  }
  const founder = founderClaim?.ok ? founderClaim : null

  /**
   * Give the code back when the order it was claimed for never gets raised.
   *
   * The claim is taken before the order exists, which is what makes it a lock;
   * the cost of that is every failure after it has to hand the code back or a
   * database hiccup burns a code nobody managed to spend.
   */
  const releaseClaim = async () => {
    if (founder) await releaseFounderCode(founder.code.code, founder.token)
    if (starter) await releaseStarter(starter.starter.code, starter.token)
  }

  /*
    A starter suppresses the partner path entirely, and that is a term of the
    programme rather than a shortcut: a partner's own purchases earn them no
    commission. Running the redemption anyway would attribute this order to the
    very person being given it and accrue 15% of a £0.00 net — a ledger row that
    is either meaningless or, once the net basis moves, wrong.
  */
  const redemption = founder || starter
    ? null
    : code
    ? await redeemPartnerCode(code, {
        subtotal: undiscountedSubtotal,
        email: user?.email ?? null,
        channel,
        /*
          A code the customer TYPED is a request for money off and is answered
          as one. A code that only exists because they followed a partner's
          link is attribution, and on a channel that cannot discount it now
          credits the partner rather than being dropped on the floor.

          That gap was a live leak: a referred customer who bought off the shop
          shelf earned their partner nothing, because a refused redemption
          stored no code on the order.
        */
        source: typedCode ? 'typed' : 'referral',
      })
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
  const config = getPricingConfig()
  /**
   * A founder code REPLACES this pricing rather than discounting it.
   *
   * `priceOneOffLines` floors every line at the margin floor, which is exactly
   * right for a partner's 25% and exactly wrong here: these codes SET a price
   * rather than discount one, and the floor would clamp it — a free order can
   * never reach zero through it (that is what stops a partner's 100% doing the
   * same), and a cost price would be dragged up wherever the floor sits above
   * it. `priceAtFounderTerms` returns the same shape, so everything downstream
   * bills from one object either way.
   */
  const priced = starter
    ? priceStarterOrder(pricedLines, config)
    : founder
    ? priceAtFounderTerms(founder.kind, pricedLines, config)
    : priceOneOffLines(pricedLines, config, partnerPct)

  const orderLines: OrderLine[] = matched.map((m, i) => ({
    sku: m.variant.sku ?? null,
    productId: m.product.id,
    title: m.product.title,
    variantTitle: m.variant.flavour || m.variant.size || null,
    quantity: m.quantity,
    unitPrice: priced.lines[i].discountedUnitPrice,
    supplierCost: m.product.cost ?? null,
  }))

  // The minimum order, enforced SERVER-SIDE.
  //
  // PowerBody charge us per parcel whatever is in it, so below this there is no
  // basket we can send without losing money — and a one-off has no renewal
  // behind it to make it back. The basket UI blocks it too, but a UI check is a
  // courtesy; this is the one that counts.
  //
  // Every founder code waives it, including the two that are not about the
  // minimum at all: the minimum exists because a small order loses money, and
  // each of these codes IS a decision to spend that money. A free code that
  // still demanded £15 of basket would refuse the £0.00 order it had just
  // built.
  // A starter waives it for the same reason every founder code does, plus one
  // of its own: the order it builds is £0.00 by construction, so a minimum
  // stated in pounds would refuse every single one of them.
  if (!founder && !starter && config.minOrderValue > 0 && priced.subtotal < config.minOrderValue) {
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

  /**
   * Delivery, charged rather than quietly absorbed.
   *
   * The basket has been telling people "spend £X more for free delivery" since
   * it was built, while no checkout path ever added a shipping line — so every
   * order shipped free and the margin model, which assumes postage is collected
   * below the free line, was overstating every sub-threshold order by the whole
   * parcel. `deliveryOptions` bands it on the retail total, the same number the
   * basket shows.
   *
   * A founder code moves this too, and for `cost` it moves it UPWARDS: the
   * parcel is charged at what PowerBody charge US to send it rather than at our
   * customer rate, which is often free. Selling the goods at cost and shipping
   * them on our own promotional postage would put the loss back in one line
   * below where it was just taken out.
   */
  const supplierValue = round(pricedLines.reduce((sum, l) => sum + l.cost * Math.max(1, l.quantity), 0))
  const options = starter
    ? starterDeliveryOptions(priced.total, config)
    : founder
    ? founderDeliveryOptions(founder.kind, { supplierValue, orderValue: priced.total }, config)
    : deliveryOptions(priced.total, config)
  // What we book against the order up front. Stripe's real figure — including a
  // Highlands surcharge if they pick it — replaces this on the webhook.
  const mainlandCharge = options[0]?.price ?? 0

  /** Written onto the order so a £0.00 row is explained where it is read. */
  const founderFields = founder
    ? { founderCode: founder.code.code, founderCodeKind: founder.kind }
    : {}

  /**
   * The same, for a starter — and the partner id alongside the code.
   *
   * Two fields rather than one because the two questions asked of this order
   * are different: "why did this cost nothing" is answered by the code, and
   * "which partner have we already given a stack to" is a question about the
   * partner, asked across orders, and resolving it through a join on a spent
   * code would mean the answer disappeared the day the code was tidied up.
   */
  const starterFields = starter
    ? { starterCode: starter.starter.code, starterPartnerId: starter.starter.partnerId }
    : {}

  /**
   * Nothing to pay — a `free` founder code or a partner's starter stack, which
   * are the only two ways to reach this.
   *
   * Stripe cannot take £0.00: Checkout refuses a session under its minimum
   * charge, so there is no payment path here to fall back on. The order is
   * raised as PAID because it is — there was nothing outstanding — and this is
   * the one place in the app that books a paid order nobody paid for.
   *
   * What authorises it is the claim taken above. For a founder code that is a
   * single-use code from an authenticated hub session that dies in a day; for a
   * starter it is a single-use code issued to a named partner, capped to a
   * stack, that does nothing at all until they have signed the agreement saying
   * what they will post. Neither of them is a discount that happened to reach
   * zero — a partner's 25% cannot get here, because the margin floor stops it.
   *
   * It still lands in the review queue like every other order. Free to the
   * buyer is not free to us, and nothing reaches PowerBody unreviewed.
   */
  if ((founder || starter) && round(priced.total + mainlandCharge) <= 0) {
    let order
    try {
      order = await createOrderFromCheckout({
        channel,
        lines: orderLines,
        userId: user?.id ?? null,
        email: user?.email ?? null,
        status: 'paid',
        shipping: 0,
        ...founderFields,
        ...starterFields,
      })
    } catch (err) {
      console.error('[/api/cart] could not raise the free order:', err)
      await releaseClaim()
      return NextResponse.json({ error: 'Could not place that order. Please try again.' }, { status: 502 })
    }
    if (founder) await markFounderCodeUsed(founder.code.code, founder.token, order.id)
    if (starter) await markStarterUsed(starter.starter.code, starter.token, order.id)
    return NextResponse.json({
      checkoutUrl: starter ? '#partner-starter' : '#founder-code',
      founderCode: founder?.kind,
      starterCode: starter ? starter.starter.code : undefined,
      orderId: order.id,
    })
  }

  /**
   * A starter that did NOT come to zero has no business going any further.
   *
   * It cannot happen through the pricing — `priceStarterOrder` puts every line
   * at zero and `starterDeliveryOptions` charges nothing — so reaching here
   * means one of those two changed and this one did not. The safe direction is
   * obvious: hand the code back and refuse, rather than send a partner to Stripe
   * to pay for the stack they were told was free.
   */
  if (starter) {
    console.error('[/api/cart] a starter order priced above zero:', priced.total, mainlandCharge)
    await releaseClaim()
    return NextResponse.json({ error: 'Could not place that order. Please try again.' }, { status: 500 })
  }

  // ── Stripe ──
  if (getPaymentSource() === 'stripe') {
    const orderId = newOrderId()
    try {
      await createOrderFromCheckout({
        id: orderId,
        status: 'pending_payment',
        channel,
        lines: orderLines,
        shipping: mainlandCharge,
        userId: user?.id ?? null,
        email: user?.email ?? null,
        partnerCode: redemption?.ok ? redemption.code.code : null,
        partnerDiscountPct: redemption?.ok ? redemption.discountPct : null,
        ...founderFields,
      })
    } catch (err) {
      console.error('[/api/cart] could not raise the pending order:', err)
      await releaseClaim()
      return NextResponse.json({ error: 'Failed to start checkout. Please try again.' }, { status: 502 })
    }
    // The code is spent when an order exists, not when someone types it — a cap
    // that counted attempts would exhaust itself on people who never bought.
    if (redemption?.ok) await recordCodeUse(redemption.code.code)
    // Same rule for a founder code, and the same trade: abandoning at Stripe
    // spends it. For a code that can take 100% off, erring towards spent is the
    // right direction — reissuing one is two taps in the hub, and a code that
    // survived every abandoned checkout would be a code that never ran out.
    if (founder) await markFounderCodeUsed(founder.code.code, founder.token, orderId)
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
        shippingOptions: options,
      })
      if (!url) {
        // The order exists but there is no way to pay for it, so the code was
        // never really spent. Give it back rather than burning it on a session
        // that does not exist.
        await releaseClaim()
        return NextResponse.json({ error: 'Stripe did not return a checkout URL.' }, { status: 502 })
      }
      return NextResponse.json({ checkoutUrl: url, orderId })
    } catch (err) {
      console.error('[/api/cart] Stripe session creation failed:', err)
      await releaseClaim()
      return NextResponse.json({ error: 'Failed to start checkout. Please try again.' }, { status: 502 })
    }
  }

  // ── Mock ── record a paid order immediately so the hub + fulfilment flow can
  // be exercised without Stripe, and return the placeholder URL.
  let order
  try {
    order = await createOrderFromCheckout({
      channel,
      lines: orderLines,
      userId: user?.id ?? null,
      email: user?.email ?? null,
      status: 'paid',
      // Mock mode has no Stripe to pick a rate, so it books the mainland one.
      shipping: mainlandCharge,
      partnerCode: redemption?.ok ? redemption.code.code : null,
      partnerDiscountPct: redemption?.ok ? redemption.discountPct : null,
      ...founderFields,
    })
  } catch (err) {
    console.error('[/api/cart] could not raise the order:', err)
    await releaseClaim()
    return NextResponse.json({ error: 'Could not place that order. Please try again.' }, { status: 502 })
  }
  if (redemption?.ok) await recordCodeUse(redemption.code.code)
  if (founder) await markFounderCodeUsed(founder.code.code, founder.token, order.id)
  return NextResponse.json({ checkoutUrl: '#mock-checkout', mock: true, orderId: order.id })
}
