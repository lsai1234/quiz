'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'

const ACCENT = '#00D4FF'

interface OrderRow {
  id: string
  reference?: string | null
  channel: string
  status: string
  email: string | null
  total: number
  currency: string
  review?: { state: string } | null
  supplierOrderId: string | null
  supplierStatus: string | null
  createdAt: string
}

export const STATUS_COLOR: Record<string, string> = {
  pending_payment: 'var(--color-muted)',
  paid: ACCENT,
  submitted_to_supplier: '#a78bfa',
  supplier_confirmed: '#a78bfa',
  shipped: '#34d399',
  delivered: '#34d399',
  cancelled: 'var(--color-red)',
  refunded: 'var(--color-red)',
  failed: 'var(--color-red)',
}

export function statusLabel(s: string): string {
  return s.replace(/_/g, ' ')
}

const money = (n: number, ccy: string) => `${ccy === 'GBP' ? '£' : ''}${n.toFixed(2)}`

/** Paid, never sent, and nobody has decided on it yet — see the review queue. */
function needsReview(o: OrderRow): boolean {
  if (o.supplierOrderId) return false
  if (o.status !== 'paid' && o.status !== 'failed') return false
  return (o.review?.state ?? 'pending') === 'pending'
}

export function StatusBadge({ status }: { status: string }) {
  const color = STATUS_COLOR[status] ?? 'var(--color-muted)'
  return (
    <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full whitespace-nowrap"
      style={{ color, background: `color-mix(in srgb, ${color} 14%, transparent)`, border: `1px solid color-mix(in srgb, ${color} 35%, transparent)` }}>
      {statusLabel(status)}
    </span>
  )
}

const STATUSES = ['all', 'pending_payment', 'paid', 'submitted_to_supplier', 'shipped', 'delivered', 'cancelled', 'refunded', 'failed']
/** `one-off` is a view, not a channel: shop + quiz, i.e. everything not a renewal. */
const CHANNELS = ['all', 'one-off', 'shop', 'quiz', 'subscription']

export function OrdersList({ defaultChannel = 'all' }: { defaultChannel?: string } = {}) {
  const [orders, setOrders] = useState<OrderRow[] | null>(null)
  const [status, setStatus] = useState('all')
  const [channel, setChannel] = useState(defaultChannel)
  const [query, setQuery] = useState('')

  useEffect(() => {
    const p = new URLSearchParams()
    if (status !== 'all') p.set('status', status)
    // `one-off` spans two channels, so it is filtered client-side rather than
    // pushed into a query the API would have to grow a special case for.
    if (channel !== 'all' && channel !== 'one-off') p.set('channel', channel)
    fetch(`/api/portal/orders?${p.toString()}`)
      .then((r) => r.json())
      .then((d) => setOrders(d.orders ?? []))
      .catch(() => setOrders([]))
  }, [status, channel])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return (orders ?? [])
      .filter((o) => channel !== 'one-off' || o.channel !== 'subscription')
      .filter((o) => !q || `${o.id} ${o.reference ?? ''} ${o.email ?? ''}`.toLowerCase().includes(q))
  }, [orders, query, channel])

  if (!orders) return <p className="text-sm text-[var(--color-muted)]">Loading orders…</p>

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search order id or email"
          className="flex-1 min-w-[180px] text-sm rounded-xl px-3 py-2 border" style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }} />
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="text-sm rounded-xl px-3 py-2 border" style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}>
          {STATUSES.map((s) => <option key={s} value={s}>{s === 'all' ? 'All statuses' : statusLabel(s)}</option>)}
        </select>
        <select value={channel} onChange={(e) => setChannel(e.target.value)} className="text-sm rounded-xl px-3 py-2 border" style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}>
          {CHANNELS.map((c) => <option key={c} value={c}>{c === 'all' ? 'All channels' : c === 'one-off' ? 'One-off (shop + quiz)' : c}</option>)}
        </select>
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-[var(--color-muted)] py-8 text-center">No orders yet. Place a checkout in the shop or quiz to see one here.</p>
      ) : (
        <div className="space-y-2">
          {filtered.map((o) => (
            <Link key={o.id} href={`/portal/commerce/orders/${o.id}`} className="block rounded-2xl border p-3.5" style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)' }}>
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-bold text-[var(--color-text)]" style={{ fontFamily: 'var(--font-display)' }}>{o.reference ?? o.id}</span>
                    <span className="text-[10px] font-semibold uppercase text-[var(--color-muted)]">{o.channel}</span>
                    {needsReview(o) && (
                      <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full whitespace-nowrap"
                        style={{ color: '#fbbf24', background: 'color-mix(in srgb, #fbbf24 14%, transparent)' }}>
                        needs review
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-[var(--color-muted)] truncate">{o.email ?? 'guest'} · {new Date(o.createdAt).toLocaleString()}</p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-sm font-bold text-[var(--color-text)]">{money(o.total, o.currency)}</span>
                  <StatusBadge status={o.status} />
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
