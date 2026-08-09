'use client'

import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { describePayout, describeTerms } from '@/lib/partners/terms'
import type {
  CodeTerms,
  PartnerBalance,
  PartnerCode,
  PartnerCommission,
  PartnerPayout,
  PartnerRecord,
  PartnerTerms,
} from '@/lib/partners/types'

const money = (n: number) => `£${n.toFixed(2)}`

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
  const [tab, setTab] = useState<'code' | 'money' | 'terms' | 'history'>('code')
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
          {(['code', 'money', 'terms', 'history'] as const).map((t) => (
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
              {t === 'code' ? 'Code' : t === 'money' ? 'Money' : t === 'terms' ? 'Their deal' : `History (${termsHistory.length})`}
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
                partnerId={partner.id}
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

          {tab === 'money' && (
            <MoneyPanel
              partnerId={partner.id}
              busy={busy}
              onSettle={(ignoreMinimum) =>
                post({ action: 'settle', ignoreMinimum }, 'Payout raised. Mark it paid once the money has gone.')
              }
            />
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

function AccountPanel({
  status,
  busy,
  partnerId,
  onStatus,
}: {
  status: PartnerRecord['partner']['status']
  busy: boolean
  partnerId: string
  onStatus: (s: 'active' | 'suspended') => void
}) {
  return (
    <Group
      title="Account"
      desc={
        status === 'invited'
          ? 'Created but never signed in — they hold no password yet. Their code still works.'
          : status === 'suspended'
            ? 'Suspended. Their code is refused at checkout, no new commission accrues, and they are signed out.'
            : 'Active.'
      }
    >
      <div className="flex flex-wrap gap-2 mb-3">
        {status === 'suspended' ? (
          <button disabled={busy} onClick={() => onStatus('active')} className={BTN} style={{ background: ACCENT, color: 'var(--color-bg)' }}>
            Reinstate
          </button>
        ) : (
          <button disabled={busy} onClick={() => onStatus('suspended')} className={BTN} style={{ background: 'var(--color-surface)', color: '#f87171', border: '1px solid var(--color-border)' }}>
            Suspend
          </button>
        )}
      </div>
      <InviteLink partnerId={partnerId} isNew={status === 'invited'} />
    </Group>
  )
}

/**
 * Mint a single-use link for a partner to set their password.
 *
 * Shown once and never recoverable — the store keeps only a hash, so nobody
 * including us can read an outstanding invite back out of the database. Losing
 * it means issuing another, which is the right trade: an invite that could be
 * looked up later would be a standing key to somebody's account.
 */
function InviteLink({ partnerId, isNew }: { partnerId: string; isNew: boolean }) {
  const [link, setLink] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  async function mint() {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/portal/partners', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'invite', id: partnerId }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(d.error ?? 'Could not create a link.')
        return
      }
      setLink(`${window.location.origin}/partner/set-password?token=${encodeURIComponent(d.token)}`)
    } catch {
      setError('Could not reach the hub.')
    } finally {
      setBusy(false)
    }
  }

  if (!link) {
    return (
      <div>
        <button
          disabled={busy}
          onClick={mint}
          className={BTN}
          style={{ background: 'var(--color-surface)', color: ACCENT, border: '1px solid var(--color-border)' }}
        >
          {busy ? 'Creating…' : isNew ? 'Create sign-in link' : 'Create a password-reset link'}
        </button>
        {error && <p className="text-[11px] mt-1.5" style={{ color: '#f87171' }}>{error}</p>}
        <p className="text-[10px] text-[var(--color-muted)] leading-snug mt-1.5">
          Send it to them yourself. It works once and expires in 7 days.
        </p>
      </div>
    )
  }

  return (
    <div>
      <span className="text-[11px] font-bold text-[var(--color-muted)] block mb-1">Send them this — you won’t see it again</span>
      <div className="flex gap-2">
        <input readOnly value={link} onFocus={(e) => e.currentTarget.select()} className={INPUT} style={{ ...inputStyle, fontSize: '11px' }} />
        <button
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(link)
              setCopied(true)
              setTimeout(() => setCopied(false), 1500)
            } catch {
              /* clipboard blocked — the field is selectable, which is the fallback */
            }
          }}
          className={BTN}
          style={{ background: ACCENT, color: 'var(--color-bg)' }}
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <p className="text-[10px] text-[var(--color-muted)] leading-snug mt-1.5">
        Only a hash is stored, so this cannot be looked up later — if it goes missing, issue another.
      </p>
    </div>
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
      <ShareLink code={code.code} />

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

/**
 * The link a partner actually posts.
 *
 * A code typed at checkout works, but expecting someone's followers to remember
 * it three screens later is where attribution goes missing. `?ref=` banks it in
 * a cookie on arrival (see `middleware.ts`) and the basket applies it by itself.
 */
function ShareLink({ code }: { code: string }) {
  const [copied, setCopied] = useState(false)
  // Read at render rather than hard-coded: the hub runs on preview domains too,
  // and a link to the wrong host is worse than no link.
  const url = typeof window === 'undefined' ? `/?ref=${code}` : `${window.location.origin}/?ref=${code}`

  return (
    <div className="mb-3">
      <span className="text-[11px] font-bold text-[var(--color-muted)] block mb-1">Their link</span>
      <div className="flex gap-2">
        <input
          readOnly
          value={url}
          onFocus={(e) => e.currentTarget.select()}
          className={INPUT}
          style={{ ...inputStyle, fontSize: '11px' }}
        />
        <button
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(url)
              setCopied(true)
              setTimeout(() => setCopied(false), 1500)
            } catch {
              /* clipboard blocked — the field is selectable, which is the fallback */
            }
          }}
          className={BTN}
          style={{ background: 'var(--color-surface)', color: ACCENT, border: '1px solid var(--color-border)' }}
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      {/* The 30 days is the LINK's memory — how long a browser holds the
          referral — not how long the code works. Read the other way round it
          says a partner's deal expires in a month. */}
      <span className="text-[10px] text-[var(--color-muted)] block mt-1 leading-snug">
        Anyone following this gets the code applied at checkout without typing it. Their browser remembers it for 30
        days. The code itself does not expire — it works while the partner is active, unless you cap or end it above.
      </span>
    </div>
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

/**
 * What a partner has earned, and how settled it is.
 *
 * The split is the whole point. Money brought in is not money owed: an accrual
 * inside the return window can still be refunded away, so only `confirmed` is
 * ever presented as payable. Reversals are shown rather than netted off in
 * silence — a founder asking "why is this smaller than last month" deserves the
 * answer on the same screen.
 */
function MoneyPanel({
  partnerId,
  busy,
  onSettle,
}: {
  partnerId: string
  busy: boolean
  onSettle: (ignoreMinimum: boolean) => Promise<boolean>
}) {
  const [data, setData] = useState<{
    balance: PartnerBalance
    commissions: PartnerCommission[]
    payouts: PartnerPayout[]
  } | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/portal/partners/${partnerId}`, { cache: 'no-store' })
      const d = await res.json().catch(() => ({}))
      if (res.ok) setData({ balance: d.balance, commissions: d.commissions ?? [], payouts: d.payouts ?? [] })
    } catch {
      /* the panel simply stays on its loading line */
    }
  }, [partnerId])

  useEffect(() => { void load() }, [load])

  if (!data) return <p className="text-sm text-[var(--color-muted)]">Loading…</p>

  const { balance, commissions, payouts } = data

  return (
    <>
      <Group
        title="Owed"
        desc="Only money past the return window is payable. Anything newer could still be refunded away."
      >
        <div className="grid grid-cols-2 gap-2 mb-3">
          <Figure label="Payable now" value={balance.payableNow} tone={balance.payableNow > 0 ? ACCENT : undefined} />
          <Figure label="In the window" value={balance.accrued} />
          <Figure label="Paid to date" value={balance.paid} />
          <Figure label="Reversed" value={balance.reversed} tone={balance.reversed > 0 ? '#f87171' : undefined} />
        </div>
        <div className="flex gap-2">
          <button
            disabled={busy || balance.payableNow <= 0}
            onClick={async () => { if (await onSettle(false)) await load() }}
            className={BTN}
            style={{ background: ACCENT, color: 'var(--color-bg)' }}
          >
            {busy ? 'Working…' : 'Raise a payout'}
          </button>
          <button
            disabled={busy || balance.payableNow <= 0}
            onClick={async () => { if (await onSettle(true)) await load() }}
            className={BTN}
            style={{ background: 'var(--color-surface)', color: 'var(--color-muted)', border: '1px solid var(--color-border)' }}
            title="Pay it even though it is under their agreed minimum"
          >
            Ignore the minimum
          </button>
        </div>
      </Group>

      <Group title={`Payouts (${payouts.length})`} desc="Raised here; marked paid once the money has actually gone.">
        {payouts.length === 0 ? (
          <p className="text-[11px] text-[var(--color-muted)]">None yet.</p>
        ) : (
          <div className="space-y-1.5">
            {payouts.map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-2 text-[11px]">
                <span className="text-[var(--color-text-2)]">{p.period} · {money(p.amount)}</span>
                <span
                  className="font-bold px-2 py-0.5 rounded-full"
                  style={{
                    color: p.state === 'paid' ? '#34d399' : '#fbbf24',
                    background: `color-mix(in srgb, ${p.state === 'paid' ? '#34d399' : '#fbbf24'} 14%, transparent)`,
                  }}
                >
                  {p.state === 'paid' ? 'paid' : 'due'}
                </span>
              </div>
            ))}
          </div>
        )}
      </Group>

      <Group title={`Commissions (${commissions.length})`} desc="The rate stored is the one that applied on the day, not today's.">
        {commissions.length === 0 ? (
          <p className="text-[11px] text-[var(--color-muted)]">Nothing earned yet.</p>
        ) : (
          <div className="space-y-1.5">
            {commissions.slice(0, 40).map((c) => (
              <div key={c.id} className="flex items-center justify-between gap-2 text-[11px]">
                <span className="text-[var(--color-text-2)] truncate">
                  {c.createdAt.slice(0, 10)} · {c.kind} · {Math.round(c.rate * 100)}% of {money(c.netBasis)}
                </span>
                <span className="flex items-center gap-2 flex-shrink-0">
                  <span
                    className="font-semibold"
                    style={{ color: c.state === 'reversed' ? '#f87171' : 'var(--color-text)', textDecoration: c.state === 'reversed' ? 'line-through' : undefined }}
                  >
                    {money(c.amount)}
                  </span>
                  <span className="text-[10px] text-[var(--color-muted)]">{c.state}</span>
                </span>
              </div>
            ))}
          </div>
        )}
      </Group>
    </>
  )
}

function Figure({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div className="rounded-xl px-3 py-2" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
      <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--color-muted)]">{label}</p>
      <p className="text-sm font-black" style={{ color: tone ?? 'var(--color-text)', fontFamily: 'var(--font-display)' }}>
        {money(value)}
      </p>
    </div>
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
