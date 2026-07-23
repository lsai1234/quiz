import { NextResponse } from 'next/server'
import { isPortalAuthed } from '@/lib/portal/guard'
import { getOrder } from '@/lib/orders/repo'
import {
  submitOrderToSupplier,
  syncSupplierStatus,
  refundOrder,
  cancelOrder,
} from '@/lib/orders/service'
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
 * POST /api/portal/orders/[id]  Body: { action }
 * action ∈ submit | sync | refund | cancel — the founder-driven order actions.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isPortalAuthed())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  let body: { action?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }

  try {
    switch (body.action) {
      case 'submit': {
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
        return NextResponse.json({ error: 'action must be submit | sync | refund | cancel' }, { status: 400 })
    }
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Action failed' },
      { status: 400 },
    )
  }
}
