import { NextResponse } from 'next/server'
import { isPortalAuthed } from '@/lib/portal/guard'
import { getOrder } from '@/lib/orders/repo'
import {
  submitOrderToSupplier,
  syncSupplierStatus,
  refundOrder,
  cancelOrder,
  approveOrderForSupplier,
  holdOrder,
  rejectOrderForFulfilment,
  returnOrderToQueue,
  updateShippingAddress,
} from '@/lib/orders/service'
import type { SupplierAddress } from '@/lib/supplier/types'
import { getFounder } from '@/lib/portal/guard'
import { checkOrderDeletion, deleteOrder } from '@/lib/admin/deletion'
import { getPaymentSource } from '@/lib/payments'
import { syncPortalRuntime } from '@/lib/portal/store'

export const dynamic = 'force-dynamic'

/**
 * `submit` and `diagnose` both talk to PowerBody, whose calls are throttled at
 * their end — a diagnosis is several of them back to back. Same room the
 * supplier diagnostics get.
 */
export const maxDuration = 60

/** GET /api/portal/orders/[id] — one order. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isPortalAuthed())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const order = await getOrder(id)
  if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })
  return NextResponse.json({ order })
}

/**
 * POST /api/portal/orders/[id]  Body: { action, note? }
 *
 * action ∈ approve | hold | reject | return | submit | sync | refund | cancel |
 * address | diagnose | line-options | line-search | line-swap | line-remove | line-backorder |
 * delete-check | delete.
 *
 * The first four are the fulfilment review; `submit` is the only one that talks
 * to PowerBody and it requires an approval first (enforced in the orders domain,
 * not here). Approving from this page and sending are one click — a founder
 * opening an order and pressing "send" IS the human confirmation the gate exists
 * to demand — but the gate itself stays, so nothing automated can ever dropship.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isPortalAuthed())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  await syncPortalRuntime()
  const { id } = await params
  let body: {
    action?: string
    note?: string
    address?: SupplierAddress
    /** Line actions: which line, and the SKU the screen showed on it. */
    line?: number
    sku?: string | null
    /** `line-swap`: the replacement. */
    productId?: string
    variantId?: string
    /** Line actions: email the customer. Default true. */
    notify?: boolean
    /** `line-search`: what to look for. */
    query?: string
    /** `line-swap`: the founder has seen what a hand-picked product does not keep. */
    acceptWarnings?: boolean
    /** `line-swap`: refund the gap on a cheaper replacement. Default true. */
    refundDifference?: boolean
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }
  const note = body.note?.trim() || null

  try {
    const founder = await getFounder()
    const by = founder?.name ?? null

    switch (body.action) {
      case 'approve': {
        const order = await approveOrderForSupplier(id, by, note)
        if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })
        return NextResponse.json({ ok: true, order })
      }
      case 'hold': {
        const order = await holdOrder(id, by, note)
        if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })
        return NextResponse.json({ ok: true, order })
      }
      case 'reject': {
        const order = await rejectOrderForFulfilment(id, by, note)
        if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })
        return NextResponse.json({ ok: true, order })
      }
      case 'return': {
        const order = await returnOrderToQueue(id, by, note)
        if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })
        return NextResponse.json({ ok: true, order })
      }
      case 'submit': {
        await approveOrderForSupplier(id, by, note ?? 'Approved from the order page')
        const order = await submitOrderToSupplier(id)
        if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })
        return NextResponse.json({ ok: true, order })
      }
      /*
        Why it will not send — read-only. Asks PowerBody about each item and
        whether they already hold the order, and reads back what they said last
        time. Places nothing. See `lib/orders/send-diagnostics`.
      */
      case 'diagnose': {
        const { diagnoseSupplierSend } = await import('@/lib/orders/send-diagnostics')
        const diagnosis = await diagnoseSupplierSend(id)
        if (!diagnosis) return NextResponse.json({ error: 'Order not found' }, { status: 404 })
        return NextResponse.json({ ok: true, diagnosis })
      }
      case 'sync': {
        const order = await syncSupplierStatus(id)
        if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })
        return NextResponse.json({ ok: true, order })
      }
      case 'address': {
        if (!body.address || typeof body.address !== 'object') {
          return NextResponse.json({ error: 'address is required' }, { status: 400 })
        }
        // Validation lives in the orders domain, so the fulfilment queue and any
        // later caller get the same rules rather than this route's copy of them.
        const order = await updateShippingAddress(id, body.address, by)
        if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })
        return NextResponse.json({ ok: true, order })
      }
      case 'refund': {
        const existing = await getOrder(id)
        if (!existing) return NextResponse.json({ error: 'Order not found' }, { status: 404 })
        // Issue the Stripe refund when we're live and have a payment to refund.
        // An order that shares its payment (split off another) or has already
        // had an item refunded refunds what it is worth now, not the payment:
        // the payment also paid for goods elsewhere, or was partly given back.
        const { refundAmountFor } = await import('@/lib/orders/line-changes')
        const amount = refundAmountFor(existing)
        if (getPaymentSource() === 'stripe' && existing.stripePaymentIntentId) {
          if (amount === null) {
            const { refundPayment } = await import('@/lib/payments/stripe')
            await refundPayment(existing.stripePaymentIntentId)
          } else {
            const { refundPaymentAmount } = await import('@/lib/payments/stripe')
            await refundPaymentAmount(existing.stripePaymentIntentId, amount, {
              idempotencyKey: `order-refund:${existing.id}`,
              reason: `Refund of ${existing.id}`,
            })
          }
        }
        const order = await refundOrder(
          id,
          amount === null ? 'Refunded from Founders Hub' : `Refunded £${amount.toFixed(2)} from Founders Hub`,
        )
        return NextResponse.json({ ok: true, order })
      }

      /*
        One item that cannot be sent as bought — see `lib/orders/line-changes`.
        `line-options` is read-only (live stock and replacements); the other
        three change the order, may move money, and email the customer unless
        `notify` is false.
      */
      case 'line-options': {
        const { lineOptions } = await import('@/lib/orders/line-changes')
        return NextResponse.json({ ok: true, options: await lineOptions(id, Number(body.line)) })
      }
      case 'line-search': {
        const { searchReplacements } = await import('@/lib/orders/line-changes')
        return NextResponse.json({
          ok: true,
          products: await searchReplacements(id, Number(body.line), String(body.query ?? '')),
        })
      }
      case 'line-swap': {
        if (!body.productId || !body.variantId) {
          return NextResponse.json({ error: 'productId and variantId are required' }, { status: 400 })
        }
        const { swapLine } = await import('@/lib/orders/line-changes')
        const order = await swapLine(
          id,
          Number(body.line),
          body.sku ?? null,
          { productId: body.productId, variantId: body.variantId },
          { by, notify: body.notify !== false, acceptWarnings: body.acceptWarnings === true, refundDifference: body.refundDifference !== false },
        )
        return NextResponse.json({ ok: true, order })
      }
      case 'line-remove': {
        const { removeLine } = await import('@/lib/orders/line-changes')
        const order = await removeLine(id, Number(body.line), body.sku ?? null, { by, notify: body.notify !== false })
        return NextResponse.json({ ok: true, order })
      }
      case 'line-backorder': {
        const { backorderLine } = await import('@/lib/orders/line-changes')
        const { order, backorder } = await backorderLine(id, Number(body.line), body.sku ?? null, {
          by,
          notify: body.notify !== false,
        })
        return NextResponse.json({ ok: true, order, backorderId: backorder.id })
      }
      /*
        What deleting this order would do, and whether it may be done at all.

        Its own action so the confirm step can say something true before the
        press rather than after it — an irreversible button whose consequences
        are only discoverable by pressing it is not a confirm, it is a dare.
      */
      case 'delete-check': {
        return NextResponse.json({ check: await checkOrderDeletion(id) })
      }

      /*
        Delete it outright — for an order that will not be sent and should not
        be in the numbers. `reject` marks it and keeps it; this removes it.

        The refusals live in the domain, not here: an order already with the
        supplier, or paid for and not refunded, is a fact about the world that
        deleting our row does not change.
      */
      case 'delete': {
        const result = await deleteOrder(id, { by: founder?.email ?? by, reason: note })
        if (!result.ok) return NextResponse.json({ error: result.reason }, { status: 409 })
        return NextResponse.json({ ok: true, deleted: result.summary })
      }

      case 'cancel': {
        const order = await cancelOrder(id, 'Cancelled from Founders Hub')
        if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })
        return NextResponse.json({ ok: true, order })
      }
      default:
        return NextResponse.json(
          {
            error:
              'action must be approve | hold | reject | return | submit | sync | refund | cancel | address | diagnose | line-options | line-search | line-swap | line-remove | line-backorder',
          },
          { status: 400 },
        )
    }
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Action failed' },
      { status: 400 },
    )
  }
}
