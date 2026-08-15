'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import type { FulfilmentQueue as Queue, QueueKind, QueueOrder } from '@/lib/orders/queue'
import { OrderingModeBanner } from './OrderSendingToggle'

/** The queue endpoint adds the current ordering mode to the queue payload. */
type QueueWithOrdering = Queue & { ordering?: 'simulate' | 'live' }


const REVIEW: Record<string, { label: string; colour: string }> = {
  pending: { label: 'Needs review', colour: 'var(--tone-attention)' },
  approved: { label: 'Ready to send', colour: 'var(--tone-positive)' },
  held: { label: 'On hold', colour: 'var(--tone-attention)' },
  rejected: { label: 'Rejected', colour: 'var(--tone-critical)' },
}

const money = (n: number, ccy = 'GBP') => `${ccy === 'GBP' ? '£' : ''}${n.toFixed(2)}`

function dayLabel(iso: string): string {
  const today = new Date().toISOString().slice(0, 10)
  const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10)
  if (iso === today) return 'Today'
  if (iso === yesterday) return 'Yesterday'
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
}

/** Why an order can't be dropshipped as it stands. */
function blockedReason(o: QueueOrder): string | null {
  // The address one first: it is the only reason that can never be fixed by us.
  if (o.undeliverableReason) return o.undeliverableReason
  if (o.linesWithoutSku > 0) return `${o.linesWithoutSku} line${o.linesWithoutSku === 1 ? '' : 's'} with no supplier SKU`
  if (!o.hasShippingAddress) return 'no delivery address'
  return null
}

export function FulfilmentQueue({ kind }: { kind?: QueueKind }) {
  const [queue, setQueue] = useState<QueueWithOrdering | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    const q = kind ? `?kind=${kind}` : ''
    fetch(`/api/portal/fulfilment${q}`)
      .then((r) => r.json())
      .then(setQueue)
      .catch(() => setError('Could not load the queue.'))
  }, [kind])

  useEffect(load, [load])

  const act = useCallback(
    async (ids: string[], action: string) => {
      if (ids.length === 0) return
      setBusy(true)
      setError(null)
      setMessage(null)
      try {
        const res = await fetch('/api/portal/fulfilment', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids, action }),
        })
        const d = await res.json().catch(() => ({}))
        if (!res.ok) {
          setError(d.error ?? 'Action failed')
        } else {
          // "Sent to PowerBody" and "simulated" are the same click with very
          // different consequences, so the confirmation says which one happened.
          const simulated = d.ordering === 'simulate'
          const verb =
            simulated && (action === 'send' || action === 'approve-and-send')
              ? SIMULATED_PAST[action]
              : (PAST[action] ?? 'updated')
          setMessage(`${d.done} order${d.done === 1 ? '' : 's'} ${verb}.`)
          if (d.failures?.length) {
            setError(d.failures.map((f: { id: string; error: string }) => `${f.id}: ${f.error}`).join(' · '))
          }
          setSelected(new Set())
        }
      } finally {
        setBusy(false)
        load()
      }
    },
    [load],
  )

  const allPending = useMemo(
    () => (queue?.days ?? []).flatMap((d) => d.orders).filter((o) => o.review === 'pending').map((o) => o.id),
    [queue],
  )
  const readyIds = useMemo(
    () => (queue?.days ?? []).flatMap((d) => d.orders).filter((o) => o.review === 'approved').map((o) => o.id),
    [queue],
  )

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  if (!queue) return <p className="text-sm text-[var(--ink-3)]">Loading the queue…</p>

  const selectedIds = [...selected]

  return (
    <div className="space-y-4">
      {/* Counts */}
      <div className="grid grid-cols-3 gap-3">
        <Stat n={queue.pending} label="Need review" colour={queue.pending > 0 ? 'var(--tone-attention)' : 'var(--tone-positive)'} />
        <Stat n={queue.readyToSend} label="Ready to send" colour={queue.readyToSend > 0 ? 'var(--accent)' : 'var(--ink-3)'} />
        <Stat n={queue.held + queue.rejected} label="Held / rejected" colour={queue.held + queue.rejected > 0 ? 'var(--tone-critical)' : 'var(--ink-3)'} />
      </div>

      <OrderingModeBanner ordering={queue.ordering} />

      {queue.undeliverable > 0 && (
        <p className="text-xs rounded-xl px-3 py-2" style={{ background: `var(--critical-fill)`, border: `1px solid var(--critical-line)`, color: 'var(--tone-critical)' }}>
          <strong>{queue.undeliverable} order{queue.undeliverable === 1 ? '' : 's'} PowerBody will not ship to.</strong>{' '}
          Northern Ireland, Guernsey, Jersey and anywhere outside the UK are off-limits on a UK dropshipping account.
          These look like ordinary UK orders — refund {queue.undeliverable === 1 ? 'it' : 'them'} rather than leaving
          someone waiting for a parcel that was never coming.
        </p>
      )}

      {queue.blocked > queue.undeliverable && (
        <p className="text-xs rounded-xl px-3 py-2" style={{ background: `var(--attention-fill)`, border: `1px solid var(--attention-line)`, color: 'var(--tone-attention)' }}>
          {queue.blocked - queue.undeliverable} more can&apos;t be sent as {queue.blocked - queue.undeliverable === 1 ? 'it stands' : 'they stand'} — missing a supplier SKU or a delivery address.
        </p>
      )}

      {/* Bulk actions */}
      <div className="flex flex-wrap gap-2 items-center">
        <button onClick={() => setSelected(new Set(allPending))} disabled={allPending.length === 0} className={BTN} style={{ borderColor: 'var(--edge)', color: 'var(--ink-2)' }}>
          Select all needing review ({allPending.length})
        </button>
        <button onClick={() => act(selectedIds, 'approve')} disabled={busy || selectedIds.length === 0} className={BTN} style={{ borderColor: `var(--positive-line)`, color: 'var(--tone-positive)' }}>
          Approve {selectedIds.length || ''}
        </button>
        <button onClick={() => act(selectedIds, 'hold')} disabled={busy || selectedIds.length === 0} className={BTN} style={{ borderColor: 'var(--edge)', color: 'var(--tone-attention)' }}>
          Hold
        </button>
        <button onClick={() => act(selectedIds, 'reject')} disabled={busy || selectedIds.length === 0} className={BTN} style={{ borderColor: 'var(--edge)', color: 'var(--tone-critical)' }}>
          Reject
        </button>
        <span className="flex-1" />
        <button onClick={() => act(readyIds, 'send')} disabled={busy || readyIds.length === 0} className={BTN} style={{ background: 'var(--accent)', borderColor: 'var(--accent)', color: 'var(--ink-on-accent)' }}>
          {busy
            ? 'Working…'
            : queue.ordering === 'simulate'
              ? `Simulate sending ${readyIds.length} approved`
              : `Send ${readyIds.length} approved to PowerBody`}
        </button>
      </div>

      {message && <p className="text-xs text-[var(--ink-3)]">{message}</p>}
      {error && <p className="text-xs" style={{ color: 'var(--tone-critical)' }}>{error}</p>}

      {/* Days */}
      {queue.days.length === 0 ? (
        <p className="text-sm text-[var(--ink-3)] py-8 text-center">
          Nothing waiting. Every paid order has been reviewed and sent.
        </p>
      ) : (
        queue.days.map((day) => (
          <section key={day.date}>
            <div className="flex items-baseline justify-between gap-2 mb-2">
              <h2 className="text-sm font-bold" style={{ color: 'var(--ink-1)', fontFamily: 'var(--font-display)' }}>
                {dayLabel(day.date)}
              </h2>
              <p className="text-[11px] text-[var(--ink-3)]">
                {day.orders.length} order{day.orders.length === 1 ? '' : 's'} · {money(day.total)}
                {day.pending > 0 && <span style={{ color: 'var(--tone-attention)' }}> · {day.pending} to review</span>}
              </p>
            </div>

            <div className="space-y-2">
              {day.orders.map((o) => {
                const blocked = blockedReason(o)
                const meta = REVIEW[o.review] ?? REVIEW.pending
                return (
                  <div key={o.id} className="rounded-2xl border p-3.5" style={{ background: 'var(--surface-1)', borderColor: blocked && o.review === 'pending' ? `var(--critical-line)` : 'var(--edge)' }}>
                    <div className="flex items-start gap-3">
                      <input type="checkbox" checked={selected.has(o.id)} onChange={() => toggle(o.id)} className="mt-1 shrink-0" aria-label={`Select ${o.reference ?? o.id}`} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Link href={`/founderhub/commerce/orders/${o.id}`} className="text-sm font-bold text-[var(--ink-1)] underline" style={{ fontFamily: 'var(--font-display)' }}>
                            {o.reference ?? o.id}
                          </Link>
                          <span className="text-[10px] font-semibold uppercase text-[var(--ink-3)]">
                            {o.kind === 'subscription' ? 'subscription' : o.channel}
                          </span>
                          <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full whitespace-nowrap"
                            style={{ color: meta.colour, background: `color-mix(in srgb, ${meta.colour} 14%, transparent)` }}>
                            {meta.label}
                          </span>
                        </div>
                        <p className="text-[11px] text-[var(--ink-3)] mt-0.5 truncate">
                          {o.email ?? 'guest'} · {o.itemCount} item{o.itemCount === 1 ? '' : 's'} · {new Date(o.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          {o.deliveryZone === 'uk-2' && (
                            <span style={{ color: 'var(--tone-attention)' }}>
                              {' '}
                              · Highlands rate
                              {/* They picked their own zone at checkout, before Stripe knew
                                  the postcode. This is where a mainland pick on a Highlands
                                  address surfaces instead of vanishing into the margin. */}
                              {o.deliveryShortfall != null && ` · ${money(o.deliveryShortfall, o.currency)} short on postage`}
                            </span>
                          )}
                          {o.supplierCost != null && ` · costs us ${money(o.supplierCost, o.currency)}`}
                        </p>
                        {blocked && <p className="text-[11px] mt-1" style={{ color: 'var(--tone-critical)' }}>Can&apos;t send — {blocked}.</p>}
                        {o.reviewNote && <p className="text-[11px] mt-1 text-[var(--ink-2)]">“{o.reviewNote}”</p>}
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-bold text-[var(--ink-1)]">{money(o.total, o.currency)}</p>
                        <div className="flex gap-1.5 mt-1.5 justify-end">
                          {o.review === 'pending' && (
                            <button onClick={() => act([o.id], 'approve')} disabled={busy} className={SMALL} style={{ color: 'var(--tone-positive)', borderColor: `var(--positive-line)` }}>Approve</button>
                          )}
                          {o.review === 'approved' && (
                            <button onClick={() => act([o.id], 'send')} disabled={busy} className={SMALL} style={{ color: 'var(--ink-on-accent)', background: 'var(--accent)', borderColor: 'var(--accent)' }}>Send</button>
                          )}
                          {(o.review === 'held' || o.review === 'rejected') && (
                            <button onClick={() => act([o.id], 'return')} disabled={busy} className={SMALL} style={{ color: 'var(--ink-2)', borderColor: 'var(--edge)' }}>Reopen</button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </section>
        ))
      )}
    </div>
  )
}

const BTN = 'text-xs font-bold px-3 py-2 rounded-xl border disabled:opacity-40'
const SMALL = 'text-[11px] font-bold px-2.5 py-1.5 rounded-lg border disabled:opacity-40'

const PAST: Record<string, string> = {
  approve: 'approved',
  hold: 'put on hold',
  reject: 'rejected',
  return: 'returned to the queue',
  send: 'sent to PowerBody',
  'approve-and-send': 'approved and sent',
}

/** What actually happened when ordering is in simulate mode. */
const SIMULATED_PAST: Record<string, string> = {
  send: 'simulated — nothing was sent to PowerBody',
  'approve-and-send': 'approved and simulated — nothing was sent to PowerBody',
}

function Stat({ n, label, colour }: { n: number; label: string; colour: string }) {
  return (
    <div className="rounded-2xl border border-[var(--edge)] bg-[var(--surface-2)] p-4 text-center">
      <p className="text-2xl font-black" style={{ color: colour, fontFamily: 'var(--font-display)' }}>{n}</p>
      <p className="text-[11px] text-[var(--ink-3)] mt-0.5">{label}</p>
    </div>
  )
}
