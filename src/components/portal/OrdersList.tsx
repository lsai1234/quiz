'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Badge, Card, Input, Select } from '@/components/system'


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
  pending_payment: 'var(--ink-3)',
  paid: 'var(--accent)',
  submitted_to_supplier: 'var(--tone-info)',
  supplier_confirmed: 'var(--tone-info)',
  shipped: 'var(--tone-positive)',
  delivered: 'var(--tone-positive)',
  cancelled: 'var(--tone-critical)',
  refunded: 'var(--tone-critical)',
  failed: 'var(--tone-critical)',
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
  const color = STATUS_COLOR[status] ?? 'var(--ink-3)'
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

  if (!orders) return <p className="text-sm text-[var(--ink-3)]">Loading orders…</p>

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Input
          label="Search orders"
          compact
          className="flex-1 min-w-[11rem]"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search order id or email"
        />
        <Select label="Status" compact value={status} onChange={(e) => setStatus(e.target.value)}>
          {STATUSES.map((s) => <option key={s} value={s}>{s === 'all' ? 'All statuses' : statusLabel(s)}</option>)}
        </Select>
        <Select label="Channel" compact value={channel} onChange={(e) => setChannel(e.target.value)}>
          {CHANNELS.map((c) => <option key={c} value={c}>{c === 'all' ? 'All channels' : c === 'one-off' ? 'One-off (shop + quiz)' : c}</option>)}
        </Select>
      </div>

      {filtered.length === 0 ? (
        <p className="text-center" style={{ fontSize: 'var(--text-body-sm)', color: 'var(--ink-3)', padding: 'var(--space-8) 0' }}>
          No orders yet. Place a checkout in the shop or quiz to see one here.
        </p>
      ) : (
        <ul className="space-y-2">
          {filtered.map((o) => (
            // `solid`: the orders list is long and scrolls.
            <Card key={o.id} as="li" solid interactive padding="none">
            <Link href={`/founderhub/commerce/orders/${o.id}`} className="block" style={{ padding: 'var(--space-3)' }}>
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span style={{ fontSize: 'var(--text-body-sm)', fontWeight: 'var(--weight-strong)', fontFamily: 'var(--font-display)', color: 'var(--ink-1)' }}>
                      {o.reference ?? o.id}
                    </span>
                    <span style={{ fontSize: 'var(--text-micro)', fontWeight: 'var(--weight-strong)', textTransform: 'uppercase', color: 'var(--ink-3)' }}>
                      {o.channel}
                    </span>
                    {needsReview(o) && <Badge tone="attention">needs review</Badge>}
                  </div>
                  <p className="truncate" style={{ fontSize: 'var(--text-meta)', color: 'var(--ink-3)' }}>
                    {o.email ?? 'guest'} · {new Date(o.createdAt).toLocaleString()}
                  </p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span style={{ fontSize: 'var(--text-body-sm)', fontWeight: 'var(--weight-strong)', fontVariantNumeric: 'tabular-nums', color: 'var(--ink-1)' }}>
                    {money(o.total, o.currency)}
                  </span>
                  <StatusBadge status={o.status} />
                </div>
              </div>
            </Link>
            </Card>
          ))}
        </ul>
      )}
    </div>
  )
}
