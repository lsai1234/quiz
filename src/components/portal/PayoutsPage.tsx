'use client'

import { useCallback, useEffect, useState } from 'react'
import type { PartnerBalance, PartnerPayout } from '@/lib/partners/types'
import type { SelfBilledInvoice } from '@/lib/partners/invoice'


const money = (n: number) => `£${n.toFixed(2)}`

interface DueRow {
  partnerId: string
  name: string
  email: string
  status: string
  balance: PartnerBalance
  minimum: number
  wouldPay: boolean
}

interface PayoutRow extends PartnerPayout {
  partnerName: string
  invoice: SelfBilledInvoice | null
}

interface Data {
  period: string
  due: DueRow[]
  payouts: PayoutRow[]
  totals: { readyToPay: number; heldUnderMinimum: number; raisedThisPeriod: number; unpaid: number }
}

/** Runs are in arrears — the month just gone. */
function previousMonth(): string {
  const d = new Date()
  d.setUTCDate(1)
  d.setUTCMonth(d.getUTCMonth() - 1)
  return d.toISOString().slice(0, 7)
}

/**
 * Payouts — "what do we owe, and to whom", in one place.
 *
 * Two halves that are deliberately not the same number. What is **waiting** is
 * commission past its return window that no run has picked up. What is
 * **raised** is a payout that exists as an obligation but whose money may not
 * have left yet. Collapsing them would make the screen claim the bank has moved
 * when only a button has.
 */
export function PayoutsPage() {
  const [period, setPeriod] = useState(previousMonth())
  const [data, setData] = useState<Data | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/portal/payouts?period=${encodeURIComponent(period)}`, { cache: 'no-store' })
      const d = await res.json().catch(() => ({}))
      if (res.ok) setData(d)
      else setError(d.error ?? 'Could not load payouts.')
    } catch {
      setError('Could not reach the hub.')
    }
  }, [period])

  useEffect(() => { void load() }, [load])

  async function run(ignoreMinimum: boolean) {
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      const res = await fetch('/api/portal/partners', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'run-payouts', period, ignoreMinimum }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(d.error ?? 'The run did not complete.')
        return
      }
      const r = d.report
      setNotice(
        r.paid.length === 0
          ? `Nothing to pay for ${period}.${r.skipped.length ? ` ${r.skipped.length} held under their minimum.` : ''}`
          : `Raised ${r.paid.length} payout${r.paid.length === 1 ? '' : 's'} totalling ${money(r.total)}.` +
            (r.skipped.length ? ` ${r.skipped.length} held under their minimum.` : ''),
      )
      await load()
    } catch {
      setError('Could not reach the hub.')
    } finally {
      setBusy(false)
    }
  }

  async function markPaid(payoutId: string, partnerName: string) {
    const reference = window.prompt(`Bank reference for ${partnerName}'s payout (optional but recommended):`)
    // Cancel returns null; an empty string is a deliberate "no reference".
    if (reference === null) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/portal/partners', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'mark-paid', payoutId, reference }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(d.error ?? 'Could not mark it paid.')
        return
      }
      setNotice(`Marked paid — ${d.rows} commission row${d.rows === 1 ? '' : 's'} settled.`)
      await load()
    } finally {
      setBusy(false)
    }
  }

  if (!data) {
    return <p className="text-sm text-[var(--ink-3)]">{error ?? 'Loading…'}</p>
  }

  const waiting = data.due.filter((d) => d.balance.payableNow > 0)

  return (
    <div>
      <div className="flex items-center justify-end gap-3 mb-1 flex-wrap">
        <input
          type="month"
          value={period}
          onChange={(e) => setPeriod(e.target.value)}
          className="px-3 py-1.5 rounded-xl text-xs outline-none"
          style={{ background: 'var(--surface-2)', border: '1px solid var(--edge)', color: 'var(--ink-1)' }}
        />
      </div>
      <p className="text-[11px] text-[var(--ink-3)] leading-snug mb-4">
        Monthly, in arrears. Commission becomes payable once its order is past the 14-day return window, and each
        partner is judged against their own agreed minimum.{' '}
        {/* Worth being explicit: a run sweeps everything cleared, whenever it
            was earned. The period is the label the payout carries, not a filter
            on what goes into it — a founder assuming otherwise would run twice
            looking for money that was already in the first run. */}
        <strong className="text-[var(--ink-2)]">A run sweeps everything cleared</strong>, whenever it was earned;
        the month above is the label the payout carries.
      </p>

      {error && <p className="text-xs font-semibold mb-3 px-3 py-2 rounded-xl" style={{ color: 'var(--tone-critical)', background: 'color-mix(in srgb, var(--tone-critical) 12%, transparent)' }}>{error}</p>}
      {notice && <p className="text-xs font-semibold mb-3 px-3 py-2 rounded-xl" style={{ color: 'var(--accent)', background: `var(--accent-fill)` }}>{notice}</p>}

      <div className="grid grid-cols-2 gap-2 mb-4">
        <Figure label="Ready to pay" value={money(data.totals.readyToPay)} tone={data.totals.readyToPay > 0 ? 'var(--tone-positive)' : undefined} />
        <Figure label="Held under minimum" value={money(data.totals.heldUnderMinimum)} note="Carries forward" />
        <Figure label={`Raised for ${data.period}`} value={money(data.totals.raisedThisPeriod)} />
        <Figure label="Raised, not yet sent" value={money(data.totals.unpaid)} tone={data.totals.unpaid > 0 ? 'var(--tone-attention)' : undefined} />
      </div>

      <div className="flex flex-wrap gap-2 mb-5">
        <button
          disabled={busy || data.totals.readyToPay <= 0}
          onClick={() => run(false)}
          className="text-xs font-bold px-3 py-2 rounded-xl active:scale-95 transition-all disabled:opacity-40"
          style={{ background: 'var(--accent)', color: 'var(--ink-on-accent)', fontFamily: 'var(--font-display)' }}
        >
          {busy ? 'Running…' : `Run ${data.period}`}
        </button>
        <button
          disabled={busy || data.totals.heldUnderMinimum <= 0}
          onClick={() => run(true)}
          className="text-xs font-bold px-3 py-2 rounded-xl active:scale-95 transition-all disabled:opacity-40"
          style={{ background: 'var(--surface-2)', color: 'var(--ink-3)', border: '1px solid var(--edge)' }}
          title="Pay everyone, including balances under their agreed minimum"
        >
          Run, ignoring minimums
        </button>
      </div>

      <Section title={`Waiting for a run (${waiting.length})`} desc="Cleared the return window; not yet on a payout.">
        {waiting.length === 0 ? (
          <p className="text-[11px] text-[var(--ink-3)]">Nobody is waiting.</p>
        ) : (
          <div className="space-y-2">
            {waiting.map((d) => (
              <div key={d.partnerId} className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-[var(--ink-1)] truncate" style={{ fontFamily: 'var(--font-display)' }}>{d.name}</p>
                  <p className="text-[11px] text-[var(--ink-3)]">
                    {d.wouldPay
                      ? `Over their ${money(d.minimum)} minimum`
                      : `Under their ${money(d.minimum)} minimum — carries forward`}
                    {d.balance.accrued > 0 && ` · ${money(d.balance.accrued)} still in the window`}
                  </p>
                </div>
                <span className="text-sm font-black flex-shrink-0" style={{ color: d.wouldPay ? 'var(--tone-positive)' : 'var(--ink-3)', fontFamily: 'var(--font-display)' }}>
                  {money(d.balance.payableNow)}
                </span>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title={`Raised for ${data.period} (${data.payouts.length})`} desc="An obligation until the money actually goes.">
        {data.payouts.length === 0 ? (
          <p className="text-[11px] text-[var(--ink-3)]">Nothing raised for this period yet.</p>
        ) : (
          <div className="space-y-3">
            {data.payouts.map((p) => (
              <div key={p.id} className="rounded-xl p-3" style={{ background: 'var(--surface-1)', border: '1px solid var(--edge)' }}>
                <div className="flex items-start justify-between gap-3 mb-1">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-[var(--ink-1)] truncate" style={{ fontFamily: 'var(--font-display)' }}>{p.partnerName}</p>
                    {p.invoice && (
                      <p className="text-[10px] text-[var(--ink-3)] truncate">
                        {p.invoice.number}
                        {p.invoice.vat > 0 && ` · ${money(p.invoice.net)} + ${money(p.invoice.vat)} VAT`}
                        {p.invoice.selfBilled && ' · self-billed'}
                      </p>
                    )}
                    {p.reference && <p className="text-[10px] text-[var(--ink-3)]">Ref {p.reference}</p>}
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-sm font-black" style={{ color: 'var(--ink-1)', fontFamily: 'var(--font-display)' }}>
                      {money(p.invoice?.gross ?? p.amount)}
                    </p>
                    <span
                      className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                      style={{
                        color: p.state === 'paid' ? 'var(--tone-positive)' : 'var(--tone-attention)',
                        background: `color-mix(in srgb, ${p.state === 'paid' ? 'var(--tone-positive)' : 'var(--tone-attention)'} 14%, transparent)`,
                      }}
                    >
                      {p.state === 'paid' ? 'paid' : 'due'}
                    </span>
                  </div>
                </div>
                {p.state === 'due' && (
                  <button
                    disabled={busy}
                    onClick={() => markPaid(p.id, p.partnerName)}
                    className="text-xs font-bold px-3 py-1.5 rounded-xl active:scale-95 transition-all disabled:opacity-40 mt-1"
                    style={{ background: 'var(--surface-2)', color: 'var(--accent)', border: '1px solid var(--edge)' }}
                  >
                    Mark paid
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </Section>
    </div>
  )
}

function Section({ title, desc, children }: { title: string; desc?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-[var(--edge)] p-4 mb-3" style={{ background: 'var(--surface-2)' }}>
      <h3 className="text-xs font-black text-[var(--ink-1)] mb-0.5" style={{ fontFamily: 'var(--font-display)' }}>{title}</h3>
      {desc && <p className="text-[11px] text-[var(--ink-3)] mb-3 leading-snug">{desc}</p>}
      {children}
    </section>
  )
}

function Figure({ label, value, tone, note }: { label: string; value: string; tone?: string; note?: string }) {
  return (
    <div className="rounded-xl px-3 py-2.5" style={{ background: 'var(--surface-1)', border: '1px solid var(--edge)' }}>
      <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--ink-3)]">{label}</p>
      <p className="text-lg font-black" style={{ color: tone ?? 'var(--ink-1)', fontFamily: 'var(--font-display)' }}>{value}</p>
      {note && <p className="text-[10px] text-[var(--ink-3)] mt-0.5">{note}</p>}
    </div>
  )
}
