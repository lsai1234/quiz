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
} from '@/lib/orders/service'
import { getFounder } from '@/lib/portal/guard'
import { getPaymentSource } from '@/lib/payments'

export const dynamic = 'force-dynamic'

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
 * action ∈ approve | hold | reject | return | submit | sync | refund | cancel.
 *
 * The first four are the fulfilment review; `submit` is the only one that talks
 * to PowerBody and it requires an approval first (enforced in the orders domain,
 * not here). Approving from this page and sending are one click — a founder
 * opening an order and pressing "send" IS the human confirmation the gate exists
 * to demand — but the gate itself stays, so nothing automated can ever dropship.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isPortalAuthed())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  let body: { action?: string; note?: string }
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
      case 'sync': {
        const order = await syncSupplierStatus(id)
        if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })
        return NextResponse.json({ ok: true, order })
      }
      case 'refund': {
        const existing = await getOrder(id)
        if (!existing) return NextResponse.json({ error: 'Order not found' }, { status: 404 })
        // Issue the Stripe refund when we're live and have a payment to refund.
        if (getPaymentSource() === 'stripe' && existing.stripePaymentIntentId) {
          const { refundPayment } = await import('@/lib/payments/stripe')
          await refundPayment(existing.stripePaymentIntentId)
        }
        const order = await refundOrder(id, 'Refunded from Founders Hub')
        return NextResponse.json({ ok: true, order })
      }
      case 'cancel': {
        const order = await cancelOrder(id, 'Cancelled from Founders Hub')
        if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })
        return NextResponse.json({ ok: true, order })
      }
      default:
        return NextResponse.json(
          { error: 'action must be approve | hold | reject | return | submit | sync | refund | cancel' },
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
