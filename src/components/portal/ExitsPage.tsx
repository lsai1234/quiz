'use client'

import { useEffect, useState } from 'react'
import { formatGBP } from '@/lib/stack-blueprint/pricing'
import type { ExitQueue, ExitRow, ExitState } from '@/lib/portal/exits'

const ACCENT = '#00D4FF'
const GREEN = '#34d399'
const AMBER = '#fbbf24'
const RED = '#f87171'
const MUTED = 'var(--color-muted)'

const STATE_LABEL: Record<ExitState, string> = {
  owed: 'Owed',
  collected: 'Collected',
  waived: 'Waived',
  'written-off': 'Written off',
  'refund-due': 'Refund due',
}

const STATE_COLOUR: Record<ExitState, string> = {
  owed: AMBER,
  collected: GREEN,
  waived: MUTED,
  'written-off': MUTED,
  'refund-due': ACCENT,
}

/** The automatic waivers, in language a founder can repeat to a member. */
const WAIVER_LABEL: Record<string, string> = {
  'consent-not-given': 'joined under the old terms',
  'cooling-off': 'within 14 days',
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

  if (!queue) return <p className="text-sm text-[var(--color-muted)]">Loading…</p>

  const rows = filter === 'all' ? queue.rows : queue.rows.filter((r) => r.state === filter)

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Stat label="Owed" value={queue.owed} tone={queue.owed > 0 ? AMBER : MUTED} hint="Invoiced, not paid" />
        <Stat label="Collected" value={queue.collected} tone={GREEN} hint="Settlements taken" />
        <Stat label="Waived" value={queue.waived} tone={MUTED} hint="Never charged" />
        <Stat label="Refunds due" value={queue.refundsDue} tone={queue.refundsDue > 0 ? ACCENT : MUTED} hint="We owe them" />
      </div>

      <div className="flex gap-1.5 flex-wrap">
        {(['owed', 'refund-due', 'collected', 'waived', 'written-off', 'all'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className="px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap"
            style={{
              background: filter === f ? 'var(--color-accent)' : 'var(--color-surface-2)',
              color: filter === f ? 'var(--color-bg)' : 'var(--color-muted)',
              border: '1px solid var(--color-border)',
            }}
          >
            {f === 'all' ? 'Everything' : STATE_LABEL[f]}
          </button>
        ))}
      </div>

      {rows.length === 0 && (
        <p className="text-sm text-[var(--color-muted)] rounded-2xl border border-[var(--color-border)] p-6 text-center">
          {filter === 'owed' ? 'Nothing outstanding. Every settlement has been collected or waived.' : 'Nothing here.'}
        </p>
      )}

      <div className="space-y-2">
        {rows.map((row) => (
          <div key={row.userId + row.at} className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-bold text-[var(--color-text)] truncate">{row.email ?? row.userId}</p>
                <p className="text-[11px] text-[var(--color-muted)] mt-0.5">
                  Left {new Date(row.at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                  {row.reason ? ` · “${row.reason}”` : ''}
                  {/* Where the figure came from. A forecast-sourced exit is one
                      whose history we could not read, and is worth a second look
                      before chasing anyone for it. */}
                  {row.source === 'forecast' && <span style={{ color: AMBER }}> · from forecast, not ledger</span>}
                </p>
                {row.waiver && (
                  <p className="text-[11px] mt-0.5" style={{ color: MUTED }}>
                    {WAIVER_LABEL[row.waiver] ?? row.waiver}
                  </p>
                )}
                {row.note && <p className="text-[11px] text-[var(--color-text-2)] mt-1">“{row.note}”</p>}
              </div>
              <div className="text-right shrink-0">
                <p className="text-sm font-black" style={{ color: STATE_COLOUR[row.state], fontFamily: 'var(--font-display)' }}>
                  {formatGBP(row.state === 'refund-due' ? row.overpayment : row.settlement)}
                </p>
                <p className="text-[10px] font-bold uppercase tracking-wide" style={{ color: STATE_COLOUR[row.state] }}>
                  {STATE_LABEL[row.state]}
                </p>
              </div>
            </div>

            {(row.state === 'owed' || row.state === 'refund-due') && (
              <div className="flex gap-1.5 mt-3 flex-wrap">
                {row.state === 'owed' && (
                  <>
                    <Action label="Mark paid" tone={GREEN} busy={busy === row.userId}
                      onClick={() => act(row, 'mark-paid', 'How was it paid? (bank transfer, invoice link…)')} />
                    <Action label="Waive" tone={MUTED} busy={busy === row.userId}
                      onClick={() => act(row, 'waive', 'Why are you waiving this?')} />
                    <Action label="Write off" tone={RED} busy={busy === row.userId}
                      onClick={() => act(row, 'write-off', 'Why are you writing this off?')} />
                  </>
                )}
                {row.state === 'refund-due' && (
                  <Action label="Mark refunded" tone={ACCENT} busy={busy === row.userId}
                    onClick={() => act(row, 'mark-refunded', 'How was it refunded?')} />
                )}
                {row.invoiceId && (
                  <span className="text-[10px] text-[var(--color-muted)] self-center ml-1">{row.invoiceId}</span>
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
    <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
      <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--color-muted)]">{label}</p>
      <p className="text-xl font-black mt-0.5" style={{ color: tone, fontFamily: 'var(--font-display)' }}>{formatGBP(value)}</p>
      <p className="text-[10px] text-[var(--color-muted)] mt-0.5">{hint}</p>
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
