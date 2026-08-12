import { NextResponse } from 'next/server'
import { getHubUser } from '@/lib/auth/session'
import { getSubscription, saveSubscription } from '@/lib/db/hub-data'
import { listOrders } from '@/lib/orders/repo'
import { consentCoversSettlement } from '@/lib/legal/consent'
import { quoteExit } from '@/lib/recharge/exit'
import { cancelSubscription, nextFreeExitMonth } from '@/lib/recharge/mock'
import { syncSubscriptionToStripe } from '@/lib/payments/subscription-sync'
import { syncPortalRuntime } from '@/lib/portal/store'
import { getPaymentSource } from '@/lib/payments'
import { queueExitEmail, queueScheduledExitEmail } from '@/lib/notify/billing'
import type { MemberSubscription } from '@/lib/recharge/types'

export const dynamic = 'force-dynamic'

/**
 * The exit.
 *
 * GET  /api/hub/subscription/cancel → the quote, for the screen to show
 * POST /api/hub/subscription/cancel { mode, reason } → do it
 *
 * WHY THIS IS A ROUTE OF ITS OWN
 * ──────────────────────────────
 * The hub's other mutations are pure client-side functions whose result is PUT
 * back as a whole document. That is fine for moving a delivery date. It is not
 * fine for a charge: the settlement was computed in the browser, from a
 * subscription the browser holds, and the existing PUT route diffs whatever it
 * is handed. A client that can pick its own settlement is a client that can pick
 * zero.
 *
 * So the figure is recomputed HERE from the stored subscription and the member's
 * own order history, and the amount the client believed is only ever used to
 * check they were shown the same number (`expectedSettlement`). If it has moved
 * under them — a renewal landed while the sheet was open — they are told, and
 * asked again.
 *
 * THE ORDER OF OPERATIONS IS THE POINT
 * ────────────────────────────────────
 * Charge first, then cancel, and **cancel regardless of whether the charge
 * worked**. A declined card leaves an open invoice the member can still pay; it
 * must never leave them still subscribed. Holding someone's cancellation hostage
 * to a payment is the one thing the terms explicitly promise we will not do.
 */

/** Everything the decision needs, fetched once. */
async function loadContext(userId: string) {
  await syncPortalRuntime()
  const [sub, orders, consented] = await Promise.all([
    getSubscription(userId),
    listOrders({ channel: 'subscription' }),
    consentCoversSettlement(userId),
  ])
  return {
    sub,
    // `listOrders` is not scoped by member, so scope it here. An exit priced off
    // somebody else's history is the worst possible bug in this file.
    orders: orders.filter((o) => o.userId === userId),
    consented,
  }
}

export async function GET() {
  const user = await getHubUser()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  const { sub, orders, consented } = await loadContext(user.id)
  if (!sub) return NextResponse.json({ error: 'No subscription' }, { status: 404 })

  const quote = quoteExit({ sub, orders, consentCoversSettlement: consented })
  return NextResponse.json({
    quote,
    // The member never sees the founder-facing divergence check.
    divergence: undefined,
    scheduledExitMonth: sub.scheduledExitMonth ?? null,
  })
}

interface CancelBody {
  /**
   * `now` settles and ends today; `scheduled` ends free on the next zero month;
   * `resume` clears a scheduled exit for someone who changed their mind.
   */
  mode?: 'now' | 'scheduled' | 'resume'
  reason?: string
  /** What the screen showed them, so a moved figure can be caught. */
  expectedSettlement?: number
}

export async function POST(req: Request) {
  const user = await getHubUser()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  let body: CancelBody
  try {
    body = (await req.json()) as CancelBody
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { sub, orders, consented } = await loadContext(user.id)
  if (!sub) return NextResponse.json({ error: 'No subscription' }, { status: 404 })
  if (sub.status === 'cancelled') return NextResponse.json({ ok: true, alreadyCancelled: true })

  const quote = quoteExit({ sub, orders, consentCoversSettlement: consented })

  // ── Changed their mind about a scheduled exit ──────────────────────────────
  // Nothing was charged and nothing was stopped, so there is nothing to undo
  // beyond forgetting the date.
  if (body.mode === 'resume') {
    await saveSubscription(user.id, { ...sub, scheduledExitMonth: null })
    return NextResponse.json({ ok: true, scheduledExitMonth: null })
  }

  // ── Scheduled exit: nothing to charge, nothing to stop ─────────────────────
  if (body.mode === 'scheduled') {
    const month = nextFreeExitMonth(sub, sub.monthsActive)
    if (month == null) {
      return NextResponse.json(
        { error: 'This plan has no free exit date in the next year — settle now, or contact us.' },
        { status: 400 },
      )
    }
    await saveSubscription(user.id, { ...sub, scheduledExitMonth: month, cancelReason: body.reason ?? undefined })
    // Confirming in writing that nothing changes in the meantime. A member who
    // thinks they have stopped and then sees a payment reads it as a mistake.
    await queueScheduledExitEmail(user.id, sub, Math.max(0, month - sub.monthsActive))
    return NextResponse.json({ ok: true, scheduledExitMonth: month, settlement: 0 })
  }

  // ── Settle and go ──────────────────────────────────────────────────────────
  //
  // The client's figure is a check, never an input. A mismatch means a renewal
  // landed while the sheet was open and the balance moved — so they are shown
  // the new one rather than billed a number nobody agreed to.
  if (
    body.expectedSettlement != null &&
    Math.abs(body.expectedSettlement - quote.settlement) > 0.01
  ) {
    return NextResponse.json(
      {
        error: 'Your balance has changed since this screen loaded.',
        settlementChanged: true,
        settlement: quote.settlement,
      },
      { status: 409 },
    )
  }

  let invoiceId: string | null = null
  let invoiceUrl: string | null = null
  let paid = quote.settlement <= 0

  if (quote.settlement > 0) {
    if (getPaymentSource() !== 'stripe') {
      // Mock payments take no money, and pretending otherwise would write an
      // exit record claiming a charge that never happened.
      console.warn(`[exit] mock payments — settlement of £${quote.settlement} not collected for ${user.id}`)
    } else if (!sub.stripeCustomerId) {
      console.error(`[exit] no Stripe customer for ${user.id} — cannot raise a settlement invoice`)
    } else {
      try {
        const { chargeSettlement } = await import('@/lib/payments/stripe')
        const result = await chargeSettlement({
          customerId: sub.stripeCustomerId,
          amount: quote.settlement,
          description: 'CHRGD — balance on products already sent',
          // Stable per exit: the same plan leaving on the same cycle is the same
          // charge, however many times the button is pressed.
          idempotencyKey: `exit:${sub.stripeSubscriptionId ?? sub.id}:${sub.monthsActive}`,
        })
        invoiceId = result.invoiceId
        invoiceUrl = result.hostedInvoiceUrl
        paid = result.paid
      } catch (err) {
        // The charge failed in a way that was not a decline. The member still
        // leaves; this is ours to chase.
        console.error(`[exit] settlement charge failed for ${user.id}:`, err)
      }
    }
  }

  const cancelled: MemberSubscription = {
    ...cancelSubscription(sub, body.reason ?? undefined),
    scheduledExitMonth: null,
    exit: {
      at: new Date().toISOString(),
      reason: body.reason ?? null,
      settlement: quote.settlement,
      source: quote.source,
      waiver: quote.waiver?.reason ?? null,
      invoiceId,
      paid,
      overpayment: quote.overpayment,
      statement: quote.statement ?? undefined,
    },
  }

  // Stripe next. `syncSubscriptionToStripe` never blocks a cancellation — a
  // failure there is logged and reconciled by hand, not surfaced as a refusal.
  const sync = await syncSubscriptionToStripe(sub, cancelled)
  if (sync.cancelError) {
    console.error(`[exit] cancelled locally but NOT in Stripe for ${user.id}:`, sync.cancelError)
  }
  await saveSubscription(user.id, cancelled)

  await queueExitEmail(user.id, cancelled, {
    settlement: quote.settlement,
    paid,
    waiverExplanation: quote.waiver?.explanation ?? null,
    shippedTotal: quote.statement?.shippedTotal ?? 0,
    paidTotal: quote.statement?.paidTotal ?? 0,
    overpayment: quote.overpayment,
    invoiceUrl: invoiceUrl,
  })

  return NextResponse.json({
    ok: true,
    settlement: quote.settlement,
    waiver: quote.waiver,
    overpayment: quote.overpayment,
    invoiceId,
    paid,
  })
}
