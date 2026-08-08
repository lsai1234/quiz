'use client'

import { useEffect, useState } from 'react'
import type { DashboardSummary, MoneyWindow } from '@/lib/portal/dashboard'

const ACCENT = '#00D4FF'
const GREEN = '#34d399'
const AMBER = '#fbbf24'
const RED = '#f87171'

const money = (n: number) => `£${n.toFixed(2)}`
const pct = (n: number) => `${Math.round(n * 1000) / 10}%`

const WINDOWS: { key: keyof Pick<DashboardSummary, 'today' | 'last7' | 'month'>; label: string; blurb: string }[] = [
  { key: 'today', label: 'Last 24 hours', blurb: 'What today has done so far.' },
  { key: 'last7', label: 'Last 7 days', blurb: 'The rolling week — the shortest window with a shape to it.' },
  { key: 'month', label: 'This month', blurb: 'From the 1st. The number the business is actually run on.' },
]

/**
 * The money, reconciled rather than flattered.
 *
 * Revenue counts orders that were paid for and not given back; cost counts the
 * goods AND the postage we carry. Orders whose supplier cost we don't know are
 * counted in revenue but left out of the margin and said so — a margin computed
 * over half a catalogue is worse than no margin at all.
 */
export default function FinancialsPage() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/portal/dashboard')
      .then((r) => r.json())
      .then((d) => setSummary(d.summary))
      .catch(() => setError('Could not load the figures.'))
  }, [])

  if (!summary) return <p className="text-sm text-[var(--color-muted)]">{error ?? 'Loading…'}</p>

  const { subscriptions } = summary

  return (
    <div className="space-y-5 pb-10">
      <div>
        <h2 className="text-lg font-black" style={{ color: 'var(--color-text)', fontFamily: 'var(--font-display)' }}>Financials</h2>
        <p className="text-sm text-[var(--color-muted)] mt-0.5">
          What came in, what it cost, and what was left. Delivery is counted as a cost of the sale, because on a
          dropship order it is one.
        </p>
      </div>

      {/* Recurring revenue — the number that compounds. */}
      <div className="rounded-2xl border p-5" style={{ background: 'var(--color-surface)', borderColor: `color-mix(in srgb, ${ACCENT} 35%, transparent)` }}>
        <p className="text-[10px] uppercase font-bold tracking-widest text-[var(--color-muted)]">Recurring revenue</p>
        <p className="text-3xl font-black my-1" style={{ color: ACCENT, fontFamily: 'var(--font-display)' }}>{money(subscriptions.mrr)}<span className="text-base">/mo</span></p>
        <p className="text-xs text-[var(--color-text-2)]">
          {subscriptions.active} active member{subscriptions.active === 1 ? '' : 's'} · {money(subscriptions.arpu)} each
          {subscriptions.requiresAction > 0 && <span style={{ color: AMBER }}> · {subscriptions.requiresAction} needing attention</span>}
        </p>
      </div>

      {WINDOWS.map(({ key, label, blurb }) => (
        <Window key={key} label={label} blurb={blurb} w={summary[key]} />
      ))}
    </div>
  )
}

function Window({ label, blurb, w }: { label: string; blurb: string; w: MoneyWindow }) {
  const profitColour = w.grossProfit > 0 ? GREEN : w.grossProfit < 0 ? RED : 'var(--color-muted)'
  return (
    <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <div className="flex items-baseline justify-between gap-2 mb-0.5">
        <h3 className="text-sm font-bold" style={{ color: 'var(--color-text)', fontFamily: 'var(--font-display)' }}>{label}</h3>
        <span className="text-[11px] text-[var(--color-muted)]">{w.orders} order{w.orders === 1 ? '' : 's'}</span>
      </div>
      <p className="text-[11px] text-[var(--color-muted)] mb-3">{blurb}</p>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
        <Figure label="Revenue" value={money(w.revenue)} colour="var(--color-text)" />
        <Figure label="Goods" value={`−${money(w.cogs)}`} colour="var(--color-text-2)" />
        <Figure label="Delivery we carry" value={`−${money(w.delivery)}`} colour="var(--color-text-2)" />
        <Figure label="Gross profit" value={money(w.grossProfit)} colour={profitColour} note={w.revenue > 0 ? pct(w.marginPct) : undefined} />
      </div>

      <div className="text-[11px] text-[var(--color-muted)] space-y-0.5">
        <p>Average order {money(w.aov)}.</p>
        {w.refunded > 0 && (
          <p style={{ color: AMBER }}>
            {w.refunded} order{w.refunded === 1 ? '' : 's'} refunded or cancelled ({money(w.refundedValue)}) — not counted above.
          </p>
        )}
        {w.ordersWithUnknownCost > 0 && (
          <p style={{ color: AMBER }}>
            {w.ordersWithUnknownCost} order{w.ordersWithUnknownCost === 1 ? '' : 's'} have no supplier cost on every line,
            so they count towards revenue but are left out of the margin. Set their costs in Products.
          </p>
        )}
      </div>
    </section>
  )
}

function Figure({ label, value, colour, note }: { label: string; value: string; colour: string; note?: string }) {
  return (
    <div className="rounded-xl p-3" style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border)' }}>
      <p className="text-[10px] uppercase font-bold text-[var(--color-muted)]">{label}</p>
      <p className="text-lg font-black" style={{ color: colour, fontFamily: 'var(--font-display)' }}>{value}</p>
      {note && <p className="text-[10px] text-[var(--color-muted)]">{note}</p>}
    </div>
  )
}
