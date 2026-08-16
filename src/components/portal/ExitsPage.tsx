'use client'

import { useEffect, useState } from 'react'
import { formatGBP } from '@/lib/stack-blueprint/pricing'
import { refundForReturnedValue } from '@/lib/recharge/exit'
import type { ExitQueue, ExitRow, ExitState } from '@/lib/portal/exits'

const MUTED = 'var(--ink-3)'

const STATE_LABEL: Record<ExitState, string> = {
  owed: 'Owed',
  collected: 'Collected',
  waived: 'Waived',
  'written-off': 'Written off',
  'refund-due': 'Refund due',
  'return-due': 'Return coming back',
}

const STATE_COLOUR: Record<ExitState, string> = {
  owed: 'var(--tone-attention)',
  collected: 'var(--tone-positive)',
  waived: MUTED,
  'written-off': MUTED,
  'refund-due': 'var(--accent)',
  'return-due': 'var(--accent)',
}

/** The automatic waivers, in language a founder can repeat to a member. */
const WAIVER_LABEL: Record<string, string> = {
  'consent-not-given': 'joined under the old terms',
  'price-increase-notice': 'left during a price-rise notice',
  'we-changed-your-plan': 'we changed their plan',
  'nothing-owed': 'nothing outstanding',
  'founder-waived': 'waived by hand',
}

/**
 * Every plan that has ended, and what it left behind.
 *
 * The queue exists because an invoiced-and-declined settlement is money owed on
 * a cancelled plan nobody would otherwise open again. `owed` at the top is the
 * number that says whether this feature is working — a big one means we are
 * billing balances we cannot collect, which is worse than not billing them.
 */
export function ExitsPage() {
  const [queue, setQueue] = useState<ExitQueue | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [filter, setFilter] = useState<ExitState | 'all'>('owed')

  async function load() {
    const res = await fetch('/api/portal/exits')
    if (res.ok) setQueue(await res.json())
  }
  useEffect(() => { void load() }, [])

  async function act(row: ExitRow, action: string, prompt: string) {
    const note = window.prompt(prompt)
    // A cancelled prompt is a cancelled decision. An empty note is allowed —
    // some write-offs genuinely have nothing to say — but the founder has to
    // have been asked.
    if (note === null) return
    setBusy(row.userId)
    await fetch('/api/portal/exits', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: row.userId, action, note }),
    })
    await load()
    setBusy(null)
  }

  if (!queue) return <p className="text-sm text-[var(--ink-3)]">Loading…</p>

  const rows = filter === 'all' ? queue.rows : queue.rows.filter((r) => r.state === filter)

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        <Stat label="Owed" value={queue.owed} tone={queue.owed > 0 ? 'var(--tone-attention)' : MUTED} hint="Invoiced, not paid" />
        <Stat label="Collected" value={queue.collected} tone={'var(--tone-positive)'} hint="Settlements taken" />
        <Stat label="Waived" value={queue.waived} tone={MUTED} hint="Never charged" />
        <Stat label="Refunds due" value={queue.refundsDue} tone={queue.refundsDue > 0 ? 'var(--accent)' : MUTED} hint="We owe them" />
        <Stat
          label="Returns coming"
          value={queue.returnsAwaiting}
          tone={queue.returnsAwaiting > 0 ? 'var(--accent)' : MUTED}
          hint={`${queue.returnsAwaitingCount} parcel${queue.returnsAwaitingCount === 1 ? '' : 's'}, at most`}
        />
      </div>

      <div className="flex gap-1.5 flex-wrap">
        {(['return-due', 'owed', 'refund-due', 'collected', 'waived', 'written-off', 'all'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className="px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap"
            style={{
              background: filter === f ? 'var(--accent)' : 'var(--surface-2)',
              color: filter === f ? 'var(--ground-base)' : 'var(--ink-3)',
              border: '1px solid var(--edge)',
            }}
          >
            {f === 'all' ? 'Everything' : STATE_LABEL[f]}
          </button>
        ))}
      </div>

      {rows.length === 0 && (
        <p className="text-sm text-[var(--ink-3)] rounded-2xl border border-[var(--edge)] p-6 text-center">
          {filter === 'owed'
            ? 'Nothing outstanding. Every settlement has been collected or waived.'
            : filter === 'return-due'
              ? 'No parcels on their way back.'
              : 'Nothing here.'}
        </p>
      )}

      <div className="space-y-2">
        {rows.map((row) => (
          <div key={row.userId + row.at} className="rounded-2xl border border-[var(--edge)] bg-[var(--surface-1)] p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-bold text-[var(--ink-1)] truncate">{row.email ?? row.userId}</p>
                <p className="text-[11px] text-[var(--ink-3)] mt-0.5">
                  Left {new Date(row.at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                  {row.reason ? ` · “${row.reason}”` : ''}
                  {/* Where the figure came from. A forecast-sourced exit is one
                      whose history we could not read, and is worth a second look
                      before chasing anyone for it. */}
                  {row.source === 'forecast' && <span style={{ color: 'var(--tone-attention)' }}> · from forecast, not ledger</span>}
                </p>
                {row.waiver && (
                  <p className="text-[11px] mt-0.5" style={{ color: MUTED }}>
                    {WAIVER_LABEL[row.waiver] ?? row.waiver}
                  </p>
                )}
                {row.note && <p className="text-[11px] text-[var(--ink-2)] mt-1">“{row.note}”</p>}
              </div>
              <div className="text-right shrink-0">
                <p className="text-sm font-black" style={{ color: STATE_COLOUR[row.state], fontFamily: 'var(--font-display)' }}>
                  {/* A return shows its CEILING, and says so — the settlement on
                      one is zero, and printing £0.00 beside "return coming back"
                      reads as nothing to do. */}
                  {row.state === 'return-due'
                    ? `up to ${formatGBP(row.refundCeiling)}`
                    : formatGBP(row.state === 'refund-due' ? row.overpayment : row.settlement)}
                </p>
                <p className="text-[10px] font-bold uppercase tracking-wide" style={{ color: STATE_COLOUR[row.state] }}>
                  {STATE_LABEL[row.state]}
                </p>
              </div>
            </div>

            {row.state === 'return-due' && <ReturnPanel row={row} onDone={load} />}

            {(row.state === 'owed' || row.state === 'refund-due') && (
              <div className="flex gap-1.5 mt-3 flex-wrap">
                {row.state === 'owed' && (
                  <>
                    <Action label="Mark paid" tone={'var(--tone-positive)'} busy={busy === row.userId}
                      onClick={() => act(row, 'mark-paid', 'How was it paid? (bank transfer, invoice link…)')} />
                    <Action label="Waive" tone={MUTED} busy={busy === row.userId}
                      onClick={() => act(row, 'waive', 'Why are you waiving this?')} />
                    <Action label="Write off" tone={'var(--tone-critical)'} busy={busy === row.userId}
                      onClick={() => act(row, 'write-off', 'Why are you writing this off?')} />
                  </>
                )}
                {row.state === 'refund-due' && (
                  <Action label="Mark refunded" tone={'var(--accent)'} busy={busy === row.userId}
                    onClick={() => act(row, 'mark-refunded', 'How was it refunded?')} />
                )}
                {row.invoiceId && (
                  <span className="text-[10px] text-[var(--ink-3)] self-center ml-1">{row.invoiceId}</span>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function Stat({ label, value, tone, hint }: { label: string; value: number; tone: string; hint: string }) {
  return (
    <div className="rounded-2xl border border-[var(--edge)] bg-[var(--surface-1)] p-3">
      <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--ink-3)]">{label}</p>
      <p className="text-xl font-black mt-0.5" style={{ color: tone, fontFamily: 'var(--font-display)' }}>{formatGBP(value)}</p>
      <p className="text-[10px] text-[var(--ink-3)] mt-0.5">{hint}</p>
    </div>
  )
}

function Action({ label, tone, busy, onClick }: { label: string; tone: string; busy: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={busy}
      className="px-3 py-1.5 rounded-lg text-xs font-bold disabled:opacity-50"
      style={{ background: `color-mix(in srgb, ${tone} 14%, transparent)`, color: tone, border: `1px solid color-mix(in srgb, ${tone} 30%, transparent)` }}
    >
      {label}
    </button>
  )
}

/**
 * Settling one returned parcel.
 *
 * The whole job is here because it is one job: open the box, tick what came back
 * unopened, see what that refunds, pay it. Splitting it across a list and a
 * modal would put the goods on one screen and the money on another, which is
 * exactly where a mistake gets made.
 *
 * Everything we sent is listed, priced, and unticked by default. Unticked means
 * "not refunded" — the safe direction, and the one that matches the Terms:
 * opened supplements are not refundable on hygiene grounds unless they arrived
 * faulty. A founder ticks what they can actually see in front of them.
 *
 * The figure updates live so the decision is visible before it is made, but it
 * is only ever a PREVIEW: the server recomputes it from the statement stored on
 * the exit and pays out its own number, because this one arrives over the wire.
 */
function ReturnPanel({ row, onDone }: { row: ExitRow; onDone: () => Promise<void> }) {
  const [ticked, setTicked] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ refunded: number; shortfall: number; payoutError: string | null } | null>(null)

  const returnedValue =
    Math.round(row.returnItems.filter((i) => ticked.has(i.key)).reduce((s, i) => s + i.value, 0) * 100) / 100
  const preview = refundForReturnedValue({
    paidTotal: row.paidTotal,
    shippedTotal: row.shippedTotal,
    returnedValue,
  })
  const allTicked = ticked.size === row.returnItems.length && row.returnItems.length > 0

  function toggle(key: string) {
    setTicked((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  async function settle() {
    const note = window.prompt(
      `Refund ${formatGBP(preview)} for ${ticked.size} item${ticked.size === 1 ? '' : 's'} returned unopened. Anything to record? (condition, faulty items, postage)`,
    )
    if (note === null) return
    setBusy(true)
    const res = await fetch('/api/portal/exits', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: row.userId,
        action: 'refund-return',
        returnedKeys: [...ticked],
        note,
      }),
    })
    const data = await res.json().catch(() => null)
    setBusy(false)
    if (data?.ok) {
      setResult({ refunded: data.refunded, shortfall: data.shortfall, payoutError: data.payoutError })
      await onDone()
      return
    }
    setResult({ refunded: 0, shortfall: preview, payoutError: data?.error ?? 'That did not go through.' })
  }

  return (
    <div className="mt-3 rounded-xl border border-[var(--edge)] bg-[var(--surface-2)] p-3">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-xs font-bold text-[var(--ink-1)]">What came back unopened?</p>
        <button
          type="button"
          onClick={() => setTicked(allTicked ? new Set() : new Set(row.returnItems.map((i) => i.key)))}
          className="text-[10px] font-semibold underline"
          style={{ color: MUTED }}
        >
          {allTicked ? 'Clear all' : 'Whole box'}
        </button>
      </div>
      <p className="text-[10px] mt-0.5 leading-relaxed" style={{ color: MUTED }}>
        Leave opened items unticked — they aren&apos;t refundable unless they arrived faulty. If something was
        faulty, tick it and say so in the note.
      </p>

      {row.returnItems.length === 0 ? (
        <p className="text-[11px] mt-2" style={{ color: 'var(--tone-attention)' }}>
          No itemised statement was stored for this exit, so there is nothing to tick. Refund it in Stripe by
          hand and mark it refunded.
        </p>
      ) : (
        <div className="mt-2 space-y-1">
          {row.returnItems.map((item) => (
            <label
              key={item.key}
              className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 cursor-pointer"
              style={{ background: 'var(--surface-1)', border: '1px solid var(--edge)' }}
            >
              <input
                type="checkbox"
                checked={ticked.has(item.key)}
                onChange={() => toggle(item.key)}
                style={{ accentColor: 'var(--accent)' }}
              />
              <span className="text-xs text-[var(--ink-1)] flex-1 min-w-0 truncate">
                {item.title}
                {item.quantity > 1 && <span style={{ color: MUTED }}> ×{item.quantity}</span>}
              </span>
              <span className="text-[11px] font-bold shrink-0" style={{ color: MUTED }}>
                {formatGBP(item.value)}
              </span>
            </label>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between gap-3 mt-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wide" style={{ color: MUTED }}>
            Refund
          </p>
          <p className="text-lg font-black" style={{ color: preview > 0 ? 'var(--accent)' : MUTED, fontFamily: 'var(--font-display)' }}>
            {formatGBP(preview)}
          </p>
          {/* Why it is not simply the value of what came back: they paid a
              smoothed, discounted monthly, so the refund is their PAYMENTS
              apportioned to the share of goods returned. */}
          <p className="text-[10px]" style={{ color: MUTED }}>
            {formatGBP(returnedValue)} of {formatGBP(row.shippedTotal)} returned · they paid {formatGBP(row.paidTotal)}
          </p>
        </div>
        <button
          type="button"
          onClick={settle}
          disabled={busy || row.returnItems.length === 0}
          className="px-3 py-2 rounded-lg text-xs font-bold disabled:opacity-50"
          style={{
            background: `var(--accent-fill)`,
            color: 'var(--accent)',
            border: `1px solid var(--accent-line)`,
          }}
        >
          {busy ? 'Refunding…' : preview > 0 ? `Refund ${formatGBP(preview)}` : 'Refund nothing & close'}
        </button>
      </div>

      {result && (
        <p
          className="text-[11px] mt-2 leading-relaxed"
          role="status"
          style={{ color: result.payoutError ? 'var(--tone-attention)' : 'var(--tone-positive)' }}
        >
          {result.payoutError
            ? `${formatGBP(result.refunded)} refunded, ${formatGBP(result.shortfall)} still owed. ${result.payoutError}`
            : `${formatGBP(result.refunded)} refunded to their card. This return is closed.`}
        </p>
      )}
    </div>
  )
}
