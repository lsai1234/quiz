'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/system'
import type { FulfilmentQueue as Queue, InFlightOrder, QueueKind, QueueOrder } from '@/lib/orders/queue'
import { OrderingModeBanner } from './OrderSendingToggle'
import { Checkbox } from '@/components/system'

/**
 * The queue endpoint adds the current ordering mode and the orders already sent
 * to the queue payload.
 */
type QueueWithOrdering = Queue & { ordering?: 'simulate' | 'live'; inFlight?: InFlightOrder[] }


const REVIEW: Record<string, { label: string; colour: string }> = {
  pending: { label: 'Needs review', colour: 'var(--tone-attention)' },
  approved: { label: 'Ready to send', colour: 'var(--tone-positive)' },
  held: { label: 'On hold', colour: 'var(--tone-attention)' },
  rejected: { label: 'Rejected', colour: 'var(--tone-critical)' },
}

const money = (n: number, ccy = 'GBP') => `${ccy === 'GBP' ? '£' : ''}${n.toFixed(2)}`

/** 1 → "1st", 22 → "22nd". Dispatch days are 1–28, so no need to handle beyond. */
function ordinal(n: number): string {
  if (n >= 11 && n <= 13) return `${n}th`
  return `${n}${['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`
}

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

  /**
   * Ask the supplier what has happened to everything already sent.
   *
   * The daily job does this on its own; this is the same read on demand, for
   * the founder who has just pressed Send and wants to see it acknowledged
   * rather than wait until tomorrow to find out it wasn't.
   */
  const checkAll = useCallback(async () => {
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const res = await fetch('/api/portal/fulfilment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'check-all' }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(d.error ?? 'Could not check with the supplier.')
      } else {
        setMessage(
          d.checked === 0
            ? 'Nothing is with the supplier to check.'
            : `Checked ${d.checked} order${d.checked === 1 ? '' : 's'} — ${d.updated} had moved${d.delivered ? `, ${d.delivered} delivered` : ''}.`,
        )
        if (d.failures?.length) {
          setError(d.failures.map((f: { id: string; error: string }) => `${f.id}: ${f.error}`).join(' · '))
        }
      }
    } finally {
      setBusy(false)
      load()
    }
  }, [load])

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

      {/* First boxes get their own call-out rather than being left to spot in the
          list. Approving one is not "send a parcel" — it is accepting a member
          onto a recurring charge, and the monthly total is what that decision is
          actually worth. */}
      {queue.firstBoxes > 0 && (
        <p className="text-xs rounded-xl px-3 py-2" style={{ background: 'var(--info-fill)', border: '1px solid var(--info-line)', color: 'var(--tone-info)' }}>
          <strong>{queue.firstBoxes} first subscription box{queue.firstBoxes === 1 ? '' : 'es'} waiting.</strong>{' '}
          {queue.firstBoxes === 1 ? 'This is a new member’s opening delivery' : 'These are new members’ opening deliveries'} —
          approving {queue.firstBoxes === 1 ? 'it commits them' : 'them commits'} to {money(queue.firstBoxMonthly)} a month
          from here on. Check the plan and the price before waving {queue.firstBoxes === 1 ? 'it' : 'them'} through.
        </p>
      )}

      {queue.blocked > queue.undeliverable && (
        <p className="text-xs rounded-xl px-3 py-2" style={{ background: `var(--attention-fill)`, border: `1px solid var(--attention-line)`, color: 'var(--tone-attention)' }}>
          {queue.blocked - queue.undeliverable} more can&apos;t be sent as {queue.blocked - queue.undeliverable === 1 ? 'it stands' : 'they stand'} — missing a supplier SKU or a delivery address.
        </p>
      )}

      {/* Bulk actions */}
      <div className="flex flex-wrap gap-2 items-center">
        <Button variant="secondary" size="sm" onClick={() => setSelected(new Set(allPending))} disabled={allPending.length === 0}>
          Select all needing review ({allPending.length})
        </Button>
        <Button variant="secondary" size="sm" onClick={() => act(selectedIds, 'approve')} disabled={busy || selectedIds.length === 0}>
          Approve {selectedIds.length || ''}
        </Button>
        <Button variant="secondary" size="sm" onClick={() => act(selectedIds, 'hold')} disabled={busy || selectedIds.length === 0}>
          Hold
        </Button>
        <Button variant="destructive" size="sm" onClick={() => act(selectedIds, 'reject')} disabled={busy || selectedIds.length === 0}>
          Reject
        </Button>
        <span className="flex-1" />
        <Button variant="primary" size="sm" onClick={() => act(readyIds, 'send')} disabled={busy || readyIds.length === 0}>
          {busy
            ? 'Working…'
            : queue.ordering === 'simulate'
              ? `Simulate sending ${readyIds.length} approved`
              : `Send ${readyIds.length} approved to PowerBody`}
        </Button>
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
                      <Checkbox
                        label={`Select ${o.reference ?? o.id}`}
                        hideLabel
                        className="mt-1 shrink-0"
                        checked={selected.has(o.id)}
                        onChange={() => toggle(o.id)}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Link href={`/founderhub/commerce/orders/${o.id}`} className="text-sm font-bold text-[var(--ink-1)] underline" style={{ fontFamily: 'var(--font-display)' }}>
                            {o.reference ?? o.id}
                          </Link>
                          <span className="text-[10px] font-semibold uppercase text-[var(--ink-3)]">
                            {o.kind === 'subscription' ? 'subscription' : o.channel}
                          </span>
                          {/* Which delivery on the plan this is. A first box is
                              the approval that starts a recurring charge, so it
                              gets the emphasis rather than a quiet "cycle 0". */}
                          {o.subscription && (
                            <span
                              className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full whitespace-nowrap"
                              style={
                                o.subscription.isFirstBox
                                  ? { color: 'var(--tone-info)', background: 'var(--info-fill)' }
                                  : { color: 'var(--ink-3)', background: 'var(--surface-2)' }
                              }
                            >
                              {o.subscription.isFirstBox ? 'First box' : `Month ${o.subscription.cycle + 1}`}
                            </span>
                          )}
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
                        {/* What the member is actually on. The box's own value
                            (shown on the right) is not the plan's price — on a
                            smoothed plan they differ by design — so the monthly
                            rate, the term and what this cycle billed are spelled
                            out rather than inferred from the total. */}
                        {o.subscription && (
                          <p className="text-[11px] mt-1 text-[var(--ink-2)]">
                            {money(o.subscription.monthly, o.currency)}/month
                            {o.subscription.minMonths > 1 && ` · ${o.subscription.minMonths}-month minimum`}
                            {` · ships on the ${ordinal(o.subscription.dispatchDayOfMonth)}`}
                            {o.subscription.billed != null &&
                              ` · billed ${money(o.subscription.billed, o.currency)} this cycle`}
                            {o.subscription.isFirstBox && o.subscription.introDiscountRate
                              ? ` · ${Math.round(o.subscription.introDiscountRate * 100)}% first-month intro discount`
                              : ''}
                          </p>
                        )}
                        {blocked && <p className="text-[11px] mt-1" style={{ color: 'var(--tone-critical)' }}>Can&apos;t send — {blocked}.</p>}
                        {o.reviewNote && <p className="text-[11px] mt-1 text-[var(--ink-2)]">“{o.reviewNote}”</p>}
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-bold text-[var(--ink-1)]">{money(o.total, o.currency)}</p>
                        <div className="flex gap-1.5 mt-1.5 justify-end">
                          {o.review === 'pending' && (
                            <Button variant="secondary" size="sm" onClick={() => act([o.id], 'approve')} disabled={busy}>Approve</Button>
                          )}
                          {o.review === 'approved' && (
                            <Button variant="primary" size="sm" onClick={() => act([o.id], 'send')} disabled={busy}>Send</Button>
                          )}
                          {(o.review === 'held' || o.review === 'rejected') && (
                            <Button variant="secondary" size="sm" onClick={() => act([o.id], 'return')} disabled={busy}>Reopen</Button>
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

      <InFlight orders={queue.inFlight ?? []} busy={busy} onCheck={checkAll} />
    </div>
  )
}

/**
 * What has already been sent, and whether the supplier has admitted to it.
 *
 * Approving and sending is only half the job — the other half is knowing the
 * order was accepted, and until this existed the only evidence of that was the
 * Send button not erroring. Sits below the queue because it is the thing you
 * look at after clearing it, not before.
 */
function InFlight({
  orders,
  busy,
  onCheck,
}: {
  orders: InFlightOrder[]
  busy: boolean
  onCheck: () => void
}) {
  const stalled = orders.filter((o) => o.stalled).length

  return (
    <section className="pt-2">
      <div className="flex items-baseline justify-between gap-2 mb-2 flex-wrap">
        <div>
          <h2 className="text-sm font-bold" style={{ color: 'var(--ink-1)', fontFamily: 'var(--font-display)' }}>
            With the supplier
          </h2>
          <p className="text-[11px] text-[var(--ink-3)]">
            Sent and not yet delivered. Checked automatically once a day.
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={onCheck} disabled={busy}>
          {busy ? 'Checking…' : 'Check status now'}
        </Button>
      </div>

      {stalled > 0 && (
        <p className="text-xs rounded-xl px-3 py-2 mb-2" style={{ background: 'var(--attention-fill)', border: '1px solid var(--attention-line)', color: 'var(--tone-attention)' }}>
          <strong>{stalled} order{stalled === 1 ? '' : 's'} the supplier has not picked up.</strong>{' '}
          Still sitting at “received” two days after being sent — worth chasing before the customer does.
        </p>
      )}

      {orders.length === 0 ? (
        <p className="text-sm text-[var(--ink-3)] py-6 text-center">
          Nothing with the supplier right now.
        </p>
      ) : (
        <div className="space-y-2">
          {orders.map((o) => (
            <div
              key={o.id}
              className="rounded-2xl border p-3 flex items-start gap-3"
              style={{ background: 'var(--surface-1)', borderColor: o.stalled ? 'var(--attention-line)' : 'var(--edge)' }}
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <Link href={`/founderhub/commerce/orders/${o.id}`} className="text-sm font-bold text-[var(--ink-1)] underline" style={{ fontFamily: 'var(--font-display)' }}>
                    {o.reference ?? o.id}
                  </Link>
                  <span className="text-[10px] font-semibold uppercase text-[var(--ink-3)]">{o.kind}</span>
                  {/* Says plainly that nothing left the building. A simulated
                      order looks identical to a real one everywhere else. */}
                  {o.simulated && (
                    <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full" style={{ color: 'var(--tone-attention)', background: 'var(--attention-fill)' }}>
                      Simulated
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-[var(--ink-3)] mt-0.5 truncate">
                  {o.email ?? 'guest'}
                  {o.supplierOrderId && ` · supplier ref ${o.supplierOrderId}`}
                  {o.trackingNumber && ` · tracking ${o.trackingNumber}`}
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-xs font-bold" style={{ color: o.stalled ? 'var(--tone-attention)' : 'var(--ink-1)' }}>
                  {SUPPLIER_STATE[o.supplierStatus ?? ''] ?? o.supplierStatus ?? 'Awaiting confirmation'}
                </p>
                <p className="text-[11px] text-[var(--ink-3)] mt-0.5">
                  {o.daysWaiting == null
                    ? money(o.total, o.currency)
                    : `${money(o.total, o.currency)} · ${waitLabel(o.daysWaiting)}`}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

/** The supplier's own words, in ours. */
const SUPPLIER_STATE: Record<string, string> = {
  received: 'Received',
  processing: 'Being packed',
  shipped: 'Shipped',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
}

function waitLabel(days: number): string {
  if (days <= 0) return 'sent today'
  if (days === 1) return 'sent yesterday'
  return `sent ${days} days ago`
}


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
