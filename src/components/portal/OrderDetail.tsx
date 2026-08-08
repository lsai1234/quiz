'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { StatusBadge, statusLabel } from './OrdersList'

const ACCENT = '#00D4FF'

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

const BACK_HREF = '/portal/commerce/orders'

const REVIEW_LABEL: Record<string, string> = {
  pending: 'Waiting on your review',
  approved: 'Approved — ready to send',
  held: 'On hold',
  rejected: 'Rejected — will not be fulfilled',
}
const REVIEW_COLOUR: Record<string, string> = {
  pending: '#fbbf24',
  approved: '#34d399',
  held: '#fbbf24',
  rejected: '#f87171',
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

  if (notFound) return <p className="text-sm text-[var(--color-muted)]">Order not found. <Link href={BACK_HREF} className="underline">Back to orders</Link></p>
  if (!order) return <p className="text-sm text-[var(--color-muted)]">Loading…</p>

  const canSubmit = order.status === 'paid' || order.status === 'failed'
  const canSync = !!order.supplierOrderId
  const terminal = ['refunded', 'cancelled'].includes(order.status)
  const btn = 'text-xs font-bold px-3 py-2 rounded-xl border disabled:opacity-40'
  const review = order.review?.state ?? 'pending'
  const awaitingReview = !order.supplierOrderId && canSubmit

  return (
    <div className="space-y-5">
      <Link href={BACK_HREF} className="text-xs text-[var(--color-muted)] underline">← All orders</Link>

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-black" style={{ color: 'var(--color-text)', fontFamily: 'var(--font-display)' }}>{order.id}</h1>
          <p className="text-[11px] text-[var(--color-muted)]">{order.channel} · {order.email ?? 'guest'} · {new Date(order.createdAt).toLocaleString()}</p>
        </div>
        <StatusBadge status={order.status} />
      </div>

      {/* Fulfilment review — nothing reaches PowerBody until this says approved. */}
      {awaitingReview && (
        <div className="rounded-2xl border p-3.5" style={{ background: 'var(--color-surface)', borderColor: `color-mix(in srgb, ${REVIEW_COLOUR[review] ?? ACCENT} 35%, transparent)` }}>
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div>
              <p className="text-sm font-bold" style={{ color: REVIEW_COLOUR[review] ?? ACCENT, fontFamily: 'var(--font-display)' }}>
                {REVIEW_LABEL[review] ?? review}
              </p>
              <p className="text-[11px] text-[var(--color-muted)] mt-0.5">
                We ask PowerBody for nothing until you confirm it.
                {order.review?.by && ` Last set by ${order.review.by}.`}
                {order.review?.note && ` “${order.review.note}”`}
              </p>
            </div>
            <div className="flex gap-2">
              {review !== 'held' && <button onClick={() => act('hold')} disabled={busy !== null} className={btn} style={{ borderColor: 'var(--color-border)', color: '#fbbf24' }}>Hold</button>}
              {review !== 'pending' && <button onClick={() => act('return')} disabled={busy !== null} className={btn} style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-2)' }}>Back to queue</button>}
              {review !== 'rejected' && <button onClick={() => act('reject')} disabled={busy !== null} className={btn} style={{ borderColor: 'var(--color-border)', color: 'var(--color-red)' }}>Reject</button>}
            </div>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-wrap gap-2">
        <button onClick={() => act('submit')} disabled={!canSubmit || busy !== null} className={btn} style={{ borderColor: `color-mix(in srgb, ${ACCENT} 40%, transparent)`, color: ACCENT }}>
          {busy === 'submit' ? 'Sending…' : order.status === 'failed' ? 'Retry send to PowerBody' : 'Confirm & send to PowerBody'}
        </button>
        <button onClick={() => act('sync')} disabled={!canSync || busy !== null} className={btn} style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-2)' }}>
          {busy === 'sync' ? 'Syncing…' : 'Sync status'}
        </button>
        <button onClick={() => act('refund')} disabled={terminal || busy !== null} className={btn} style={{ borderColor: 'var(--color-border)', color: 'var(--color-red)' }}>Refund</button>
        <button onClick={() => act('cancel')} disabled={terminal || busy !== null} className={btn} style={{ borderColor: 'var(--color-border)', color: 'var(--color-red)' }}>Cancel</button>
      </div>
      {error && <p className="text-xs" style={{ color: 'var(--color-red)' }}>{error}</p>}

      {/* Lines */}
      <section>
        <h2 className="text-sm font-bold mb-2" style={{ color: 'var(--color-text)', fontFamily: 'var(--font-display)' }}>Items</h2>
        <div className="rounded-2xl border divide-y" style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)' }}>
          {order.lines.map((l, i) => (
            <div key={i} className="p-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-[var(--color-text)] truncate">{l.title}{l.variantTitle ? <span className="text-[var(--color-muted)]"> · {l.variantTitle}</span> : null}</p>
                <p className="text-[11px] text-[var(--color-muted)]">SKU {l.sku ?? '—'} · qty {l.quantity}{l.supplierCost != null ? ` · cost ${money(l.supplierCost, order.currency)}` : ''}</p>
              </div>
              <span className="text-sm text-[var(--color-text)] shrink-0">{money(l.unitPrice * l.quantity, order.currency)}</span>
            </div>
          ))}
          {order.partnerCode && (
            <div className="p-3 flex items-center justify-between">
              <span className="text-xs text-[var(--color-muted)]">
                Came in on <span className="font-bold" style={{ color: ACCENT }}>{order.partnerCode}</span>
                {order.partnerDiscountPct ? ` · ${Math.round(order.partnerDiscountPct * 100)}% off` : ''}
              </span>
              <span className="text-[11px] text-[var(--color-muted)]">partner order</span>
            </div>
          )}
          <div className="p-3 flex items-center justify-between">
            <span className="text-sm font-bold text-[var(--color-text)]">Total</span>
            <span className="text-sm font-bold text-[var(--color-text)]">{money(order.total, order.currency)}</span>
          </div>
        </div>
      </section>

      {/* Fulfilment + payment */}
      <section className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="rounded-2xl border p-3.5 text-xs space-y-1" style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)' }}>
          <p className="font-bold text-[var(--color-text)] mb-1" style={{ fontFamily: 'var(--font-display)' }}>Supplier</p>
          <p className="text-[var(--color-muted)]">Order id: <span className="text-[var(--color-text-2)]">{order.supplierOrderId ?? 'not submitted'}</span></p>
          <p className="text-[var(--color-muted)]">Supplier status: <span className="text-[var(--color-text-2)]">{order.supplierStatus ? statusLabel(order.supplierStatus) : '—'}</span></p>
          <p className="text-[var(--color-muted)]">Tracking: <span className="text-[var(--color-text-2)]">{order.trackingNumber ?? '—'}</span></p>
        </div>
        <div className="rounded-2xl border p-3.5 text-xs space-y-1" style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)' }}>
          <p className="font-bold text-[var(--color-text)] mb-1" style={{ fontFamily: 'var(--font-display)' }}>Payment</p>
          <p className="text-[var(--color-muted)]">Stripe session: <span className="text-[var(--color-text-2)] break-all">{order.stripeSessionId ?? '— (mock)'}</span></p>
          <p className="text-[var(--color-muted)]">Payment intent: <span className="text-[var(--color-text-2)] break-all">{order.stripePaymentIntentId ?? '—'}</span></p>
        </div>
      </section>

      {/* Timeline */}
      <section>
        <h2 className="text-sm font-bold mb-2" style={{ color: 'var(--color-text)', fontFamily: 'var(--font-display)' }}>Timeline</h2>
        <div className="space-y-1.5">
          {order.events.slice().reverse().map((e, i) => (
            <div key={i} className="text-[11px] text-[var(--color-muted)] flex gap-2">
              <span className="text-[var(--color-text-2)] font-semibold whitespace-nowrap">{statusLabel(e.type)}</span>
              <span>{new Date(e.at).toLocaleString()}</span>
              {e.detail && <span className="truncate">· {e.detail}</span>}
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
