import { NextResponse } from 'next/server'
import { isPortalAuthed, getFounder } from '@/lib/portal/guard'
import { listSubscriptions, getSubscription, saveSubscription } from '@/lib/db/hub-data'
import { buildExitQueue, returnablesFrom } from '@/lib/portal/exits'
import { refundForReturnedValue } from '@/lib/recharge/exit'
import { listOrders } from '@/lib/orders/repo'
import { getPaymentSource } from '@/lib/payments'
import type { MemberSubscription } from '@/lib/recharge/types'

export const dynamic = 'force-dynamic'

/**
 * The exit queue.
 *
 * GET  /api/portal/exits → every plan that has ended, and what it left behind
 * POST /api/portal/exits { userId, action, note } → decide on one
 *
 * A settlement that was invoiced and declined is money owed on a cancelled plan
 * nobody is looking at. Without this it is invisible, and invisible unpaid
 * balances are how a feature meant to protect margin quietly costs more than it
 * recovers.
 *
 * Every action here is a founder overriding the automatic outcome, so every one
 * of them takes a note and records who did it. A waiver is a decision, not a
 * database edit.
 */
export async function GET() {
  if (!(await isPortalAuthed())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return NextResponse.json(buildExitQueue(await listSubscriptions()))
}

const round = (n: number) => Math.round(n * 100) / 100

/**
 * Put the money back, across the charges it came from.
 *
 * Mock payments never touch Stripe: recording a refund that no card ever
 * received would put a settled return on the screen and nothing in anyone's
 * bank. It is reported as a shortfall instead, which leaves the return open —
 * the honest state for "we owe this and have not paid it".
 *
 * Never throws. The goods are already back and the member is owed the money
 * however Stripe behaves; an exception here would lose the record of what WAS
 * refunded along with the part that wasn't.
 */
async function payOutRefund(
  userId: string,
  sub: MemberSubscription,
  amount: number,
): Promise<{ refunded: number; shortfall: number; error: string | null }> {
  if (getPaymentSource() !== 'stripe') {
    return { refunded: 0, shortfall: amount, error: 'Mock payments — refund it in Stripe by hand, then mark it refunded.' }
  }

  const orders = (await listOrders({ channel: 'subscription' })).filter((o) => o.userId === userId)
  const payments = orders
    .filter((o) => o.stripePaymentIntentId && (o.billedAmount ?? 0) > 0)
    .map((o) => ({ paymentIntentId: o.stripePaymentIntentId!, amount: o.billedAmount! }))

  if (payments.length === 0) {
    return { refunded: 0, shortfall: amount, error: 'No card payments on file to refund against — pay it out by hand.' }
  }

  try {
    const { refundAcrossPayments } = await import('@/lib/payments/stripe')
    const result = await refundAcrossPayments({
      payments,
      amount,
      // The RETURN, not the attempt: a founder double-tapping on a slow
      // connection must not pay out twice.
      idempotencyKey: `return:${sub.stripeSubscriptionId ?? sub.id}:${sub.exit?.at ?? ''}`,
      reason: '14-day return',
    })
    return {
      refunded: result.refunded,
      shortfall: result.shortfall,
      error: result.shortfall > 0.01 ? `Only ${result.refunded.toFixed(2)} of ${amount.toFixed(2)} could be refunded through Stripe.` : null,
    }
  } catch (err) {
    console.error(`[exits] refund payout failed for ${userId}:`, err)
    return { refunded: 0, shortfall: amount, error: 'Stripe refused the refund — pay it out by hand.' }
  }
}

type Action = 'waive' | 'write-off' | 'mark-paid' | 'mark-refunded' | 'refund-return'

export async function POST(req: Request) {
  if (!(await isPortalAuthed())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: {
    userId?: string
    action?: Action
    note?: string
    /** `refund-return`: which items came back unopened, by `ReturnableItem.key`. */
    returnedKeys?: string[]
    /** `refund-return`: pay it out through Stripe as well as recording it. */
    payOut?: boolean
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  if (!body.userId || !body.action) {
    return NextResponse.json({ error: 'userId and action are required' }, { status: 400 })
  }

  const sub = await getSubscription(body.userId)
  if (!sub?.exit) return NextResponse.json({ error: 'No exit recorded for this member' }, { status: 404 })

  const founder = await getFounder()
  const stamp = { note: body.note ?? null, by: founder?.email ?? null }
  const at = new Date().toISOString()

  // ── Settle a return ────────────────────────────────────────────────────────
  //
  // The browser sends WHICH items came back. It does not send what they are
  // worth, and it does not send the refund: both are recomputed here from the
  // statement snapshotted at the exit, for the same reason the member's own
  // settlement is recomputed in the cancel route — a client that can name its
  // own figure is a client that can name any figure, and this one pays money out.
  if (body.action === 'refund-return') {
    if (!sub.exit.returnRequested) {
      return NextResponse.json({ error: 'This exit is not a return' }, { status: 400 })
    }
    if (sub.exit.returnRefundedAt) {
      return NextResponse.json(
        { error: 'This return has already been refunded.', alreadyRefunded: true },
        { status: 409 },
      )
    }

    const { items, paidTotal, shippedTotal } = returnablesFrom(sub.exit.statement)
    const keys = new Set(body.returnedKeys ?? [])
    const returnedValue = round(
      items.filter((i) => keys.has(i.key)).reduce((total, i) => total + i.value, 0),
    )
    const refund = refundForReturnedValue({ paidTotal, shippedTotal, returnedValue })

    let refunded = 0
    let shortfall = refund
    let payoutError: string | null = null

    if (body.payOut !== false && refund > 0) {
      const result = await payOutRefund(body.userId, sub, refund)
      refunded = result.refunded
      shortfall = result.shortfall
      payoutError = result.error
    }

    const exit = {
      ...sub.exit,
      ...stamp,
      // What we ACTUALLY put back, which is the number that has to survive. A
      // partial payout leaves the return open rather than closing it on a figure
      // nobody received.
      refundPaid: round(refunded),
      returnRefundedAt: shortfall > 0.01 ? null : at,
    }
    await saveSubscription(body.userId, { ...sub, exit })

    return NextResponse.json({
      ok: true,
      exit,
      returnedValue,
      refund,
      refunded: round(refunded),
      shortfall: round(shortfall),
      payoutError,
    })
  }

  const exit = { ...sub.exit, ...stamp }
  switch (body.action) {
    case 'waive':
      // Never collected, and never will be. The figure goes to zero so it stops
      // counting as owed anywhere; the note is why.
      exit.settlement = 0
      exit.waiver = 'founder-waived'
      break
    case 'write-off':
      // Still owed on paper, but we have stopped chasing. Kept distinct from a
      // waiver: one is a decision we made for the member, the other is one we
      // made about our own book, and the reporting should not blur them.
      exit.writtenOffAt = at
      break
    case 'mark-paid':
      // Paid by some route Stripe did not tell us about — a bank transfer, a
      // manual invoice payment.
      exit.paid = true
      break
    case 'mark-refunded':
      exit.refundedAt = at
      break
    default:
      return NextResponse.json({ error: `Unknown action: ${body.action}` }, { status: 400 })
  }

  await saveSubscription(body.userId, { ...sub, exit })
  return NextResponse.json({ ok: true, exit })
}
