import { NextResponse } from 'next/server'
import { getHubUser } from '@/lib/auth/session'
import { getStoredPlan, saveSubscription } from '@/lib/db/hub-data'
import { getResolvedCatalogue } from '@/lib/catalogue/resolve'
import { getPaymentSource } from '@/lib/payments'
import { reportErrorAsync } from '@/lib/monitoring/report'
import { ADD_REFUSAL_COPY, extraMetadata, planExtra, withExtra, withoutExtra } from '@/lib/hub/next-box'
import { formatGBP } from '@/lib/stack-blueprint/pricing'
import { storedRateOf } from '@/lib/recharge/plan-rate'
import { tryOffer } from '@/lib/hub/try-new'
import { nextBoxNumber, thankYouFor } from '@/lib/hub/thank-you'
import { getOfferSettings } from '@/lib/offer/store'

export const dynamic = 'force-dynamic'

/**
 * Extras for a subscriber's next box (`lib/hub/next-box`): from the shop's
 * product page and the hub's calendar.
 *
 *   GET     ?productId=…&variantId=… → { plan, quote, refusal }: their plan as the
 *           shop needs it (on it already? when is the next box?), and what
 *           adding this would cost, or why it can't go in
 *   POST    { productId, variantId } → { ok, box, extra, version }
 *   DELETE  ?id=<extra id> → { ok, version }
 *
 * Stripe first, as everywhere money moves: the extra goes on the next payment
 * (an invoice item), and only then onto the plan. If Stripe refuses, nothing is
 * stored; if storing fails, the charge comes back off. A plan Stripe doesn't
 * bill (mock payments) records the extra with nothing to charge.
 */

const billed = (sub: { stripeSubscriptionId?: string | null; stripeCustomerId?: string | null }) =>
  getPaymentSource() === 'stripe' && Boolean(sub.stripeSubscriptionId && sub.stripeCustomerId)

export async function GET(req: Request) {
  const user = await getHubUser()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  const url = new URL(req.url)
  const productId = url.searchParams.get('productId')
  const [stored, { products }] = await Promise.all([getStoredPlan(user.id), getResolvedCatalogue()])
  const sub = stored?.subscription ?? null
  const { planSummary } = await import('@/lib/hub/summary')
  const summary = planSummary(sub, products)
  // What the shop needs to know about their plan: whether there is one, what's on it, when the next box goes.
  const plan = summary
    ? {
        status: summary.status,
        day: summary.day,
        nextBox: summary.nextBox ? { id: summary.nextBox.id, date: summary.nextBox.date } : null,
        productIds: summary.lines.map((l) => l.productId),
        // Their plan saving: what anything added to a box is priced at.
        rate: sub ? storedRateOf(sub) : null,
      }
    : null
  const { planPerks } = await getOfferSettings()
  // One product they might like to try, at its first-time price (`try-new`).
  const offer = tryOffer(sub, products, planPerks.tryNew)
  // Whether the next box is a thank-you box (the gift stays a surprise until it arrives).
  const boxNumber = sub ? nextBoxNumber(sub) : null
  const thankYou = sub && sub.status === 'active' && boxNumber && thankYouFor(sub, boxNumber, planPerks.gifts, products) ? { box: boxNumber } : null
  if (!productId) return NextResponse.json({ plan, quote: null, refusal: null, try: offer, thankYou })
  const planned = planExtra({ sub, catalogue: products, productId, variantId: url.searchParams.get('variantId') })
  return NextResponse.json({
    plan,
    quote: planned.ok ? { box: planned.box, price: planned.extra.price } : null,
    refusal: planned.ok ? null : { reason: planned.reason, error: ADD_REFUSAL_COPY[planned.reason] },
    try: offer,
    thankYou,
  })
}

export async function POST(req: Request) {
  const user = await getHubUser()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  let body: { productId?: unknown; variantId?: unknown; offer?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  if (typeof body.productId !== 'string') return NextResponse.json({ error: 'Which product?' }, { status: 400 })

  const [stored, { products }] = await Promise.all([getStoredPlan(user.id), getResolvedCatalogue()])
  const { planPerks } = await getOfferSettings()
  const planned = planExtra({
    sub: stored?.subscription ?? null,
    catalogue: products,
    productId: body.productId,
    variantId: typeof body.variantId === 'string' ? body.variantId : null,
    offer: body.offer === 'try' ? 'try' : null,
    tryNew: planPerks.tryNew,
  })
  if (!planned.ok) return NextResponse.json({ error: ADD_REFUSAL_COPY[planned.reason], reason: planned.reason }, { status: 409 })
  const sub = stored!.subscription
  let extra = planned.extra

  if (billed(sub)) {
    try {
      const { addInvoiceItem } = await import('@/lib/payments/stripe')
      const invoiceItemId = await addInvoiceItem({
        customerId: sub.stripeCustomerId!,
        subscriptionId: sub.stripeSubscriptionId!,
        amount: extra.price,
        description: `CHRGD — ${extra.title}${extra.variantTitle ? ` (${extra.variantTitle})` : ''}, added to your next box`,
        metadata: extraMetadata(extra),
        idempotencyKey: `extra:${sub.stripeSubscriptionId}:${extra.id}`,
      })
      extra = { ...extra, invoiceItemId }
    } catch (err) {
      reportErrorAsync(err, { surface: 'myhub', severity: 'critical', path: '/api/hub/next-box', userId: user.id, context: { step: 'add-invoice-item', productId: extra.productId } })
      return NextResponse.json({ error: 'We couldn’t add that to your next payment just now. Nothing has changed. Please try again.' }, { status: 502 })
    }
  }

  try {
    const boxed = withExtra(sub, planned.box.id, extra)
    // A first-time price is once per product.
    const tried = extra.kind === 'try' ? { ...boxed, tried: [...new Set([...(boxed.tried ?? []), extra.productId])] } : boxed
    const version = await saveSubscription(user.id, tried)
    return NextResponse.json({
      ok: true,
      box: planned.box,
      extra,
      version,
      said: `Added to your box on ${new Date(planned.box.date).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}. ${formatGBP(extra.price)} goes on that payment.`,
    })
  } catch (err) {
    // Nothing stored, so nothing may stay charged.
    if (extra.invoiceItemId) {
      const { removeInvoiceItem } = await import('@/lib/payments/stripe')
      await removeInvoiceItem(extra.invoiceItemId).catch((undo) =>
        reportErrorAsync(undo, { surface: 'myhub', severity: 'critical', path: '/api/hub/next-box', userId: user.id, context: { step: 'undo-invoice-item', invoiceItemId: extra.invoiceItemId } }),
      )
    }
    throw err
  }
}

export async function DELETE(req: Request) {
  const user = await getHubUser()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  const id = new URL(req.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Which extra?' }, { status: 400 })
  const stored = await getStoredPlan(user.id)
  if (!stored) return NextResponse.json({ error: 'There’s no plan on this account.' }, { status: 409 })
  const { sub, removed } = withoutExtra(stored.subscription, id)
  if (!removed) return NextResponse.json({ error: 'That isn’t in a box any more.' }, { status: 404 })

  if (removed.invoiceItemId && getPaymentSource() === 'stripe') {
    try {
      const { removeInvoiceItem } = await import('@/lib/payments/stripe')
      if (!(await removeInvoiceItem(removed.invoiceItemId))) {
        return NextResponse.json({ error: 'That’s already on a payment, so it comes in that box.' }, { status: 409 })
      }
    } catch (err) {
      reportErrorAsync(err, { surface: 'myhub', path: '/api/hub/next-box', userId: user.id, context: { step: 'remove-invoice-item' } })
      return NextResponse.json({ error: 'We couldn’t take that off your next payment just now. Nothing has changed. Please try again.' }, { status: 502 })
    }
  }
  const untried = removed.kind === 'try' ? { ...sub, tried: (sub.tried ?? []).filter((id) => id !== removed.productId) } : sub
  const version = await saveSubscription(user.id, untried)
  return NextResponse.json({ ok: true, version })
}
