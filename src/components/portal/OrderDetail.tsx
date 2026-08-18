'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { StatusBadge, statusLabel, formatStamp } from './OrdersList'
import { Button, Card } from '@/components/system'


interface OrderLine {
  sku: string | null
  productId: string
  title: string
  variantTitle?: string | null
  quantity: number
  unitPrice: number
  supplierCost?: number | null
}
interface OrderEvent { at: string; type: string; detail?: string }
interface OrderReview { state: string; by?: string | null; at?: string; note?: string | null }
interface Order {
  id: string
  channel: string
  status: string
  review?: OrderReview
  email: string | null
  currency: string
  subtotal: number
  shipping: number
  total: number
  lines: OrderLine[]
  stripeSessionId: string | null
  stripePaymentIntentId: string | null
  supplierOrderId: string | null
  supplierStatus: string | null
  trackingNumber: string | null
  partnerCode?: string | null
  partnerDiscountPct?: number | null
  events: OrderEvent[]
  createdAt: string
  updatedAt: string
}

const money = (n: number, ccy: string) => `${ccy === 'GBP' ? '£' : ''}${n.toFixed(2)}`

const BACK_HREF = '/founderhub/commerce/orders'

const REVIEW_LABEL: Record<string, string> = {
  pending: 'Waiting on your review',
  approved: 'Approved — ready to send',
  held: 'On hold',
  rejected: 'Rejected — will not be fulfilled',
}
/** Review state → the system's semantic tone. `Card` and `Badge` own the colours. */
const REVIEW_TONE: Record<string, 'attention' | 'positive' | 'critical'> = {
  pending: 'attention',
  approved: 'positive',
  held: 'attention',
  rejected: 'critical',
}

export function OrderDetail({ id }: { id: string }) {
  const [order, setOrder] = useState<Order | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    fetch(`/api/portal/orders/${id}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setOrder(d.order))
      .catch(() => setNotFound(true))
  }, [id])

  useEffect(() => { load() }, [load])

  const act = useCallback(async (action: string) => {
    setBusy(action)
    setError(null)
    const res = await fetch(`/api/portal/orders/${id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    })
    const d = await res.json().catch(() => ({}))
    if (res.ok && d.order) setOrder(d.order)
    else setError(d.error ?? 'Action failed')
    setBusy(null)
  }, [id])

  if (notFound) return <p className="text-sm text-[var(--ink-3)]">Order not found. <Link href={BACK_HREF} className="underline">Back to orders</Link></p>
  if (!order) return <p className="text-sm text-[var(--ink-3)]">Loading…</p>

  const canSubmit = order.status === 'paid' || order.status === 'failed'
  const canSync = !!order.supplierOrderId
  const terminal = ['refunded', 'cancelled'].includes(order.status)
  const review = order.review?.state ?? 'pending'
  const awaitingReview = !order.supplierOrderId && canSubmit

  return (
    <div className="space-y-5">
      <Link href={BACK_HREF} className="text-xs text-[var(--ink-3)] underline">← All orders</Link>

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-black" style={{ color: 'var(--ink-1)', fontFamily: 'var(--font-display)' }}>{order.id}</h1>
          <p className="text-[11px] text-[var(--ink-3)]">{order.channel} · {order.email ?? 'guest'} · {formatStamp(order.createdAt)}</p>
        </div>
        <StatusBadge status={order.status} />
      </div>

      {/* Fulfilment review — nothing reaches PowerBody until this says approved. */}
      {awaitingReview && (
        <Card padding="tight" tone={REVIEW_TONE[review] ?? 'accent'}>
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div>
              <p style={{ fontSize: 'var(--text-body-sm)', fontWeight: 'var(--weight-display)', fontFamily: 'var(--font-display)', color: `var(--tone-${REVIEW_TONE[review] ?? 'info'})` }}>
                {REVIEW_LABEL[review] ?? review}
              </p>
              <p style={{ fontSize: 'var(--text-meta)', color: 'var(--ink-3)', marginTop: 'var(--space-1)' }}>
                We ask PowerBody for nothing until you confirm it.
                {order.review?.by && ` Last set by ${order.review.by}.`}
                {order.review?.note && ` “${order.review.note}”`}
              </p>
            </div>
            <div className="flex gap-2">
              {review !== 'held' && (
                <Button size="sm" loading={busy === 'hold'} disabled={busy !== null} onClick={() => act('hold')}>
                  Hold
                </Button>
              )}
              {review !== 'pending' && (
                <Button size="sm" loading={busy === 'return'} disabled={busy !== null} onClick={() => act('return')}>
                  Back to queue
                </Button>
              )}
              {review !== 'rejected' && (
                <Button variant="destructive" size="sm" loading={busy === 'reject'} disabled={busy !== null} onClick={() => act('reject')}>
                  Reject
                </Button>
              )}
            </div>
          </div>
        </Card>
      )}

      {/* Actions */}
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" size="sm" loading={busy === 'submit'} disabled={!canSubmit || busy !== null} onClick={() => act('submit')}>
          {order.status === 'failed' ? 'Retry send to PowerBody' : 'Confirm & send to PowerBody'}
        </Button>
        <Button size="sm" loading={busy === 'sync'} disabled={!canSync || busy !== null} onClick={() => act('sync')}>
          Sync status
        </Button>
        {/* Both take money or an order back. `destructive` is what says so — they
            used to be secondary buttons with red text, which is the same weight
            as "Sync status" to anyone scanning the row. */}
        <Button variant="destructive" size="sm" loading={busy === 'refund'} disabled={terminal || busy !== null} onClick={() => act('refund')}>
          Refund
        </Button>
        <Button variant="destructive" size="sm" loading={busy === 'cancel'} disabled={terminal || busy !== null} onClick={() => act('cancel')}>
          Cancel
        </Button>
      </div>
      {error && (
        <p role="status" style={{ fontSize: 'var(--text-body-sm)', color: 'var(--tone-critical)' }}>
          {error}
        </p>
      )}

      {/* Lines */}
      <section>
        <h2 className="text-sm font-bold mb-2" style={{ color: 'var(--ink-1)', fontFamily: 'var(--font-display)' }}>Items</h2>
        <div className="rounded-2xl border divide-y" style={{ background: 'var(--surface-1)', borderColor: 'var(--edge)' }}>
          {order.lines.map((l, i) => (
            <div key={i} className="p-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-[var(--ink-1)] truncate">{l.title}{l.variantTitle ? <span className="text-[var(--ink-3)]"> · {l.variantTitle}</span> : null}</p>
                <p className="text-[11px] text-[var(--ink-3)]">SKU {l.sku ?? '—'} · qty {l.quantity}{l.supplierCost != null ? ` · cost ${money(l.supplierCost, order.currency)}` : ''}</p>
              </div>
              <span className="text-sm text-[var(--ink-1)] shrink-0">{money(l.unitPrice * l.quantity, order.currency)}</span>
            </div>
          ))}
          {order.partnerCode && (
            <div className="p-3 flex items-center justify-between">
              <span className="text-xs text-[var(--ink-3)]">
                Came in on <span className="font-bold" style={{ color: 'var(--accent)' }}>{order.partnerCode}</span>
                {order.partnerDiscountPct ? ` · ${Math.round(order.partnerDiscountPct * 100)}% off` : ''}
              </span>
              <span className="text-[11px] text-[var(--ink-3)]">partner order</span>
            </div>
          )}
          <div className="p-3 flex items-center justify-between">
            <span className="text-sm font-bold text-[var(--ink-1)]">Total</span>
            <span className="text-sm font-bold text-[var(--ink-1)]">{money(order.total, order.currency)}</span>
          </div>
        </div>
      </section>

      {/* Fulfilment + payment */}
      <section className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="rounded-2xl border p-3.5 text-xs space-y-1" style={{ background: 'var(--surface-1)', borderColor: 'var(--edge)' }}>
          <p className="font-bold text-[var(--ink-1)] mb-1" style={{ fontFamily: 'var(--font-display)' }}>Supplier</p>
          <p className="text-[var(--ink-3)]">Order id: <span className="text-[var(--ink-2)]">{order.supplierOrderId ?? 'not submitted'}</span></p>
          <p className="text-[var(--ink-3)]">Supplier status: <span className="text-[var(--ink-2)]">{order.supplierStatus ? statusLabel(order.supplierStatus) : '—'}</span></p>
          <p className="text-[var(--ink-3)]">Tracking: <span className="text-[var(--ink-2)]">{order.trackingNumber ?? '—'}</span></p>
        </div>
        <div className="rounded-2xl border p-3.5 text-xs space-y-1" style={{ background: 'var(--surface-1)', borderColor: 'var(--edge)' }}>
          <p className="font-bold text-[var(--ink-1)] mb-1" style={{ fontFamily: 'var(--font-display)' }}>Payment</p>
          <p className="text-[var(--ink-3)]">Stripe session: <span className="text-[var(--ink-2)] break-all">{order.stripeSessionId ?? '— (mock)'}</span></p>
          <p className="text-[var(--ink-3)]">Payment intent: <span className="text-[var(--ink-2)] break-all">{order.stripePaymentIntentId ?? '—'}</span></p>
        </div>
      </section>

      {/* Timeline */}
      <section>
        <h2 className="text-sm font-bold mb-2" style={{ color: 'var(--ink-1)', fontFamily: 'var(--font-display)' }}>Timeline</h2>
        <div className="space-y-1.5">
          {order.events.slice().reverse().map((e, i) => (
            <div key={i} className="text-[11px] text-[var(--ink-3)] flex gap-2">
              <span className="text-[var(--ink-2)] font-semibold whitespace-nowrap">{statusLabel(e.type)}</span>
              <span>{formatStamp(e.at)}</span>
              {e.detail && <span className="truncate">· {e.detail}</span>}
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
