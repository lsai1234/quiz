'use client'

import { useState } from 'react'
import { createPortal } from 'react-dom'
import { describePayout, describeTerms } from '@/lib/partners/terms'
import type { CodeTerms, PartnerCode, PartnerRecord, PartnerTerms } from '@/lib/partners/types'

const ACCENT = '#00D4FF'

interface Props {
  record: PartnerRecord
  onClose: () => void
  onSaved: () => void
}

/** Whole percents in the UI, fractions in the data. */
const pctIn = (n: number) => Math.round(n * 1000) / 10
const pctOut = (n: number) => n / 100

function toDateInput(iso: string | null): string {
  return iso ? iso.slice(0, 10) : ''
}

/**
 * One partner, everything about them.
 *
 * Three separate things that a founder thinks of as one: the account (can they
 * trade at all), the code (what a follower gets off) and the terms (what the
 * partner earns). They are edited separately because they change for different
 * reasons and at different times — suspending someone is not the same act as
 * renegotiating their rate, and the terms change is the one that leaves a
 * permanent, dated, partner-visible record.
 */
export function PartnerDetail({ record, onClose, onSaved }: Props) {
  const [tab, setTab] = useState<'code' | 'terms' | 'history'>('code')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const { partner, codes, terms, termsHistory } = record

  async function post(body: Record<string, unknown>, done: string) {
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      const res = await fetch('/api/portal/partners', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: partner.id, ...body }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(d.error ?? 'That did not work.')
        return false
      }
      onSaved()
      setNotice(done)
      return true
    } catch {
      setError('Could not reach the hub.')
      return false
    } finally {
      setBusy(false)
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
      style={{ background: 'rgba(0,0,0,0.72)' }}
    >
      <div className="w-full max-w-lg rounded-t-3xl overflow-hidden flex flex-col" style={{ background: 'var(--color-surface)', maxHeight: '92dvh' }}>
        <div className="px-5 pt-4 pb-3 flex items-start justify-between border-b border-[var(--color-border)]">
          <div className="min-w-0">
            <p className="text-[10px] font-bold tracking-widest uppercase truncate" style={{ color: ACCENT, fontFamily: 'var(--font-display)' }}>
              {partner.status}
            </p>
            <h3 className="text-lg font-black text-[var(--color-text)] truncate" style={{ fontFamily: 'var(--font-display)' }}>{partner.name}</h3>
            <p className="text-[11px] text-[var(--color-muted)] truncate">{partner.email}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center text-[var(--color-muted)] bg-[var(--color-surface-2)] flex-shrink-0">✕</button>
        </div>

        <div className="px-5 pt-3 flex gap-1">
          {(['code', 'terms', 'history'] as const).map((t) => (
            <button
              key={t}
              onClick={() => { setTab(t); setError(null); setNotice(null) }}
              className="px-3 py-1.5 rounded-full text-xs font-bold"
              style={{
                background: tab === t ? ACCENT : 'var(--color-surface-2)',
                color: tab === t ? 'var(--color-bg)' : 'var(--color-muted)',
                border: '1px solid var(--color-border)',
              }}
            >
              {t === 'code' ? 'Code' : t === 'terms' ? 'Their deal' : `History (${termsHistory.length})`}
            </button>
          ))}
        </div>

        <div className="overflow-y-auto flex-1 px-5 py-4">
          {error && <p className="text-xs font-semibold mb-3 px-3 py-2 rounded-xl" style={{ color: '#f87171', background: 'color-mix(in srgb, #f87171 12%, transparent)' }}>{error}</p>}
          {notice && <p className="text-xs font-semibold mb-3 px-3 py-2 rounded-xl" style={{ color: ACCENT, background: `color-mix(in srgb, ${ACCENT} 12%, transparent)` }}>{notice}</p>}

          {tab === 'code' && (
            <>
              <AccountPanel
                status={partner.status}
                busy={busy}
                onStatus={(status) => post({ action: 'status', status }, status === 'suspended' ? 'Suspended — their code stops working now.' : 'Reinstated.')}
              />
              {codes.map((code) => (
                <CodePanel
                  key={code.code}
                  code={code}
                  busy={busy}
                  onSave={(patch) => post({ action: 'code', targetCode: code.code, codePatch: patch }, 'Code updated.')}
                />
              ))}
            </>
          )}

          {tab === 'terms' && (
            <TermsPanel
              terms={terms}
              busy={busy}
              onSave={(next) => post({ action: 'terms', terms: next }, 'New terms recorded. The partner sees the reason.')}
            />
          )}

          {tab === 'history' && <HistoryPanel history={termsHistory} />}
        </div>
      </div>
    </div>,
    document.body,
  )
}

function Group({ title, desc, children }: { title: string; desc?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-[var(--color-border)] p-4 mb-3" style={{ background: 'var(--color-surface-2)' }}>
      <p className="text-xs font-black text-[var(--color-text)] mb-0.5" style={{ fontFamily: 'var(--font-display)' }}>{title}</p>
      {desc && <p className="text-[11px] text-[var(--color-muted)] mb-3 leading-snug">{desc}</p>}
      {children}
    </div>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block mb-3">
      <span className="text-[11px] font-bold text-[var(--color-muted)] block mb-1">{label}</span>
      {children}
      {hint && <span className="text-[10px] text-[var(--color-muted)] block mt-1 leading-snug">{hint}</span>}
    </label>
  )
}

const inputStyle = {
  background: 'var(--color-surface)',
  border: '1px solid var(--color-border)',
  color: 'var(--color-text)',
} as const

const INPUT = 'w-full px-3 py-2 rounded-xl text-sm outline-none'
const BTN = 'text-xs font-bold px-3 py-2 rounded-xl active:scale-95 transition-all disabled:opacity-40'

function AccountPanel({ status, busy, onStatus }: { status: PartnerRecord['partner']['status']; busy: boolean; onStatus: (s: 'active' | 'suspended') => void }) {
  return (
    <Group
      title="Account"
      desc={
        status === 'invited'
          ? 'Created but never signed in — they hold no password yet. Their code still works.'
          : status === 'suspended'
            ? 'Suspended. Their code is refused at checkout and no new commission accrues.'
            : 'Active.'
      }
    >
      {status === 'suspended' ? (
        <button disabled={busy} onClick={() => onStatus('active')} className={BTN} style={{ background: ACCENT, color: 'var(--color-bg)' }}>
          Reinstate
        </button>
      ) : (
        <button disabled={busy} onClick={() => onStatus('suspended')} className={BTN} style={{ background: 'var(--color-surface)', color: '#f87171', border: '1px solid var(--color-border)' }}>
          Suspend
        </button>
      )}
    </Group>
  )
}

function CodePanel({ code, busy, onSave }: { code: PartnerCode; busy: boolean; onSave: (patch: { discountPct?: number; terms?: CodeTerms; status?: 'active' | 'paused' | 'expired' }) => void }) {
  const [discount, setDiscount] = useState(String(pctIn(code.discountPct)))
  const [status, setStatus] = useState(code.status)
  const [t, setT] = useState<CodeTerms>({ ...code.terms })

  const setTerms = (patch: Partial<CodeTerms>) => setT((p) => ({ ...p, ...patch }))
  const num = (v: string): number | null => (v.trim() === '' ? null : Number(v))

  return (
    <Group title={code.code} desc={`Used ${code.terms.uses} time${code.terms.uses === 1 ? '' : 's'}. Created ${code.createdAt.slice(0, 10)}.`}>
      <Field label="Discount (%)" hint="What a follower gets off. This is the only extra discount on the site.">
        <input className={INPUT} style={inputStyle} inputMode="decimal" value={discount} onChange={(e) => setDiscount(e.target.value)} />
      </Field>

      <Field label="Status">
        <select className={INPUT} style={inputStyle} value={status} onChange={(e) => setStatus(e.target.value as PartnerCode['status'])}>
          <option value="active">Active</option>
          <option value="paused">Paused</option>
          <option value="expired">Expired</option>
        </select>
      </Field>

      <label className="flex items-start gap-2 mb-3">
        <input type="checkbox" className="mt-0.5" checked={t.firstOrderOnly} onChange={(e) => setTerms({ firstOrderOnly: e.target.checked })} />
        <span className="text-[11px] text-[var(--color-muted)] leading-snug">
          <span className="font-bold text-[var(--color-text)]">First order only.</span> Leave this on unless you mean it —
          without it the code is a permanent site-wide discount the moment it reaches a deal site.
        </span>
      </label>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Max uses" hint="Blank = uncapped.">
          <input className={INPUT} style={inputStyle} inputMode="numeric" value={t.maxUses ?? ''} onChange={(e) => setTerms({ maxUses: num(e.target.value) })} />
        </Field>
        <Field label="Min spend (£)" hint="Blank = none.">
          <input className={INPUT} style={inputStyle} inputMode="decimal" value={t.minSpend ?? ''} onChange={(e) => setTerms({ minSpend: num(e.target.value) })} />
        </Field>
        <Field label="Starts">
          <input type="date" className={INPUT} style={inputStyle} value={toDateInput(t.startsAt)} onChange={(e) => setTerms({ startsAt: e.target.value ? new Date(e.target.value).toISOString() : null })} />
        </Field>
        <Field label="Ends">
          <input type="date" className={INPUT} style={inputStyle} value={toDateInput(t.endsAt)} onChange={(e) => setTerms({ endsAt: e.target.value ? new Date(e.target.value).toISOString() : null })} />
        </Field>
      </div>

      <button
        disabled={busy}
        onClick={() => onSave({ discountPct: pctOut(Number(discount) || 0), status, terms: t })}
        className={BTN}
        style={{ background: ACCENT, color: 'var(--color-bg)' }}
      >
        {busy ? 'Saving…' : 'Save code'}
      </button>
    </Group>
  )
}

function TermsPanel({ terms, busy, onSave }: { terms: PartnerTerms; busy: boolean; onSave: (next: Record<string, unknown>) => void }) {
  const [first, setFirst] = useState(String(pctIn(terms.firstOrderPct)))
  const [renewal, setRenewal] = useState(String(pctIn(terms.renewalPct)))
  const [months, setMonths] = useState(String(terms.renewalMonths))
  const [payout, setPayout] = useState({ ...terms.payout })
  // "Now" is deliberately not a pre-filled date field. A date picker resolves to
  // midnight and a datetime picker drops the seconds, so a change meant to apply
  // immediately can land *before* the row it is replacing — and then it is
  // superseded on arrival and quietly changes nothing. Asking which one you mean
  // removes the whole class of mistake.
  const [when, setWhen] = useState<'now' | 'date'>('now')
  const [on, setOn] = useState('')
  const [note, setNote] = useState('')

  return (
    <>
      <Group title="In force now" desc={`Since ${terms.effectiveFrom.slice(0, 10)}${terms.createdBy ? `, set by ${terms.createdBy}` : ''}.`}>
        <p className="text-sm text-[var(--color-text)] leading-snug mb-1">{describeTerms(terms)}</p>
        <p className="text-[11px] text-[var(--color-muted)] leading-snug">{describePayout(terms.payout)}</p>
      </Group>

      <Group
        title="Change the deal"
        desc="This writes a new dated row rather than editing this one. The old terms stay readable, and the partner sees both the change and the reason."
      >
        <div className="grid grid-cols-3 gap-3">
          <Field label="First order %">
            <input className={INPUT} style={inputStyle} inputMode="decimal" value={first} onChange={(e) => setFirst(e.target.value)} />
          </Field>
          <Field label="Renewal %">
            <input className={INPUT} style={inputStyle} inputMode="decimal" value={renewal} onChange={(e) => setRenewal(e.target.value)} />
          </Field>
          <Field label="For (months)">
            <input className={INPUT} style={inputStyle} inputMode="numeric" value={months} onChange={(e) => setMonths(e.target.value)} />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Payout cadence">
            <select className={INPUT} style={inputStyle} value={payout.cadence} onChange={(e) => setPayout({ ...payout, cadence: e.target.value as 'monthly' | 'quarterly' })}>
              <option value="monthly">Monthly</option>
              <option value="quarterly">Quarterly</option>
            </select>
          </Field>
          <Field label="Minimum payout (£)" hint="Below this the balance carries forward.">
            <input className={INPUT} style={inputStyle} inputMode="decimal" value={payout.minimum} onChange={(e) => setPayout({ ...payout, minimum: Number(e.target.value) || 0 })} />
          </Field>
        </div>

        <label className="flex items-center gap-2 mb-2">
          <input type="checkbox" checked={payout.selfBilled} onChange={(e) => setPayout({ ...payout, selfBilled: e.target.checked })} />
          <span className="text-[11px] text-[var(--color-muted)]">We raise the invoice for them (self-billed)</span>
        </label>
        <label className="flex items-center gap-2 mb-3">
          <input type="checkbox" checked={payout.chargesVat} onChange={(e) => setPayout({ ...payout, chargesVat: e.target.checked })} />
          <span className="text-[11px] text-[var(--color-muted)]">
            VAT-registered — their commission costs 20% more than the rate says
          </span>
        </label>

        {/* Not a <Field>: that renders a <label>, and a <button> inside a label
            is invalid markup that hands clicks to the wrong control. */}
        <div className="mb-3">
          <span className="text-[11px] font-bold text-[var(--color-muted)] block mb-1">Takes effect</span>
          <div className="flex gap-2 mb-2">
            {(['now', 'date'] as const).map((w) => (
              <button
                key={w}
                type="button"
                onClick={() => setWhen(w)}
                className="px-3 py-1.5 rounded-full text-xs font-bold"
                style={{
                  background: when === w ? ACCENT : 'var(--color-surface)',
                  color: when === w ? 'var(--color-bg)' : 'var(--color-muted)',
                  border: '1px solid var(--color-border)',
                }}
              >
                {w === 'now' ? 'Immediately' : 'On a date'}
              </button>
            ))}
          </div>
          {when === 'date' && (
            <input type="date" className={INPUT} style={inputStyle} value={on} onChange={(e) => setOn(e.target.value)} />
          )}
          <span className="text-[10px] text-[var(--color-muted)] block mt-1 leading-snug">
            Cannot start before commission already earned at the current rate, or before the terms already recorded.
          </span>
        </div>

        <Field label="Reason" hint="Required. The partner reads this in their account.">
          <textarea className={INPUT} style={inputStyle} rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Negotiated up for the January campaign." />
        </Field>

        <button
          disabled={busy || !note.trim() || (when === 'date' && !on)}
          onClick={() =>
            onSave({
              firstOrderPct: pctOut(Number(first) || 0),
              renewalPct: pctOut(Number(renewal) || 0),
              renewalMonths: Number(months) || 0,
              payout,
              // Resolved at the moment of saving, so "immediately" is genuinely
              // after everything already recorded.
              effectiveFrom: when === 'now' ? new Date().toISOString() : new Date(on).toISOString(),
              note,
            })
          }
          className={BTN}
          style={{ background: ACCENT, color: 'var(--color-bg)' }}
        >
          {busy ? 'Saving…' : 'Record new terms'}
        </button>
      </Group>
    </>
  )
}

function HistoryPanel({ history }: { history: PartnerTerms[] }) {
  // Two changes on one day are common — a rate agreed and then corrected — and
  // a list of identical dates is unreadable. Show the time only when it is what
  // tells two rows apart.
  const sameDay = (iso: string) => history.filter((h) => h.effectiveFrom.slice(0, 10) === iso.slice(0, 10)).length > 1
  const when = (iso: string) => (sameDay(iso) ? iso.slice(0, 16).replace('T', ' ') : iso.slice(0, 10))

  return (
    <div className="space-y-2">
      <p className="text-[11px] text-[var(--color-muted)] leading-snug mb-1">
        Every deal this partner has been on, newest first. Nothing here is ever edited or removed — it is what we told a
        counterparty, and they can read the same list.
      </p>
      {history.map((t, i) => (
        <div key={t.id} className="rounded-2xl border border-[var(--color-border)] p-4" style={{ background: 'var(--color-surface-2)' }}>
          <div className="flex items-center justify-between gap-2 mb-1">
            <p className="text-xs font-black text-[var(--color-text)]" style={{ fontFamily: 'var(--font-display)' }}>
              From {when(t.effectiveFrom)}
            </p>
            {i === 0 && new Date(t.effectiveFrom) <= new Date() && (
              <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full" style={{ color: ACCENT, background: `color-mix(in srgb, ${ACCENT} 14%, transparent)` }}>
                In force
              </span>
            )}
            {i === 0 && new Date(t.effectiveFrom) > new Date() && (
              <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full" style={{ color: '#fbbf24', background: 'color-mix(in srgb, #fbbf24 14%, transparent)' }}>
                Starts later
              </span>
            )}
          </div>
          <p className="text-[12px] text-[var(--color-text)] leading-snug">{describeTerms(t)}</p>
          <p className="text-[11px] text-[var(--color-muted)] leading-snug mt-1">{describePayout(t.payout)}</p>
          {t.note && <p className="text-[11px] text-[var(--color-muted)] leading-snug mt-2 italic">“{t.note}”</p>}
          {t.createdBy && <p className="text-[10px] text-[var(--color-muted)] mt-1">— {t.createdBy}</p>}
        </div>
      ))}
    </div>
  )
}
