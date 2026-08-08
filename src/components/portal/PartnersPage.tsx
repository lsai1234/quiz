'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { PartnerDetail } from './PartnerDetail'
import { suggestCode } from '@/lib/partners/codes'
import { describeTerms } from '@/lib/partners/terms'
import { PRICING_CONFIG } from '@/lib/stack-blueprint/pricing'
import type { PartnerRecord } from '@/lib/partners/types'
import type { PartnerPerformance } from '@/lib/partners/performance'

const ACCENT = '#00D4FF'

const STATUS_COLOUR: Record<string, string> = {
  active: '#34d399',
  invited: '#fbbf24',
  suspended: '#f87171',
}

interface PerfRow { partnerId: string; codes: PartnerPerformance[] }

/** One partner's codes added together. */
function totals(rows: PartnerPerformance[] | undefined) {
  if (!rows?.length) return null
  return rows.reduce(
    (t, r) => ({
      orders: t.orders + r.orders,
      revenue: Math.round((t.revenue + r.revenue) * 100) / 100,
      subscriptions: t.subscriptions + r.subscriptions,
      reversed: t.reversed + r.reversed,
    }),
    { orders: 0, revenue: 0, subscriptions: 0, reversed: 0 },
  )
}

/**
 * Partners — the influencer programme, from the founders' side.
 *
 * Creating a partner makes three things at once: the account, their code, and
 * the deal they are on. All three, because a partner with no code cannot bring
 * in an order and a partner with no terms row has no answer to "what am I on" —
 * which is the question the programme has to be able to answer at any moment,
 * including to them.
 */
export function PartnersPage() {
  const [records, setRecords] = useState<PartnerRecord[] | null>(null)
  const [performance, setPerformance] = useState<PerfRow[]>([])
  const [open, setOpen] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [query, setQuery] = useState('')

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/portal/partners', { cache: 'no-store' })
      const d = await res.json().catch(() => ({}))
      setRecords(d.partners ?? [])
      setPerformance(d.performance ?? [])
    } catch {
      setRecords([])
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const taken = useMemo(() => (records ?? []).flatMap((r) => r.codes.map((c) => c.code)), [records])
  const filtered = useMemo(() => {
    const rs = records ?? []
    if (!query.trim()) return rs
    const q = query.toLowerCase()
    return rs.filter((r) =>
      r.partner.name.toLowerCase().includes(q) ||
      r.partner.email.toLowerCase().includes(q) ||
      r.codes.some((c) => c.code.toLowerCase().includes(q)),
    )
  }, [records, query])

  const selected = (records ?? []).find((r) => r.partner.id === open) ?? null

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-1">
        <h2 className="text-lg font-black" style={{ color: 'var(--color-text)', fontFamily: 'var(--font-display)' }}>Partners</h2>
        <button
          onClick={() => setCreating((c) => !c)}
          className="text-xs font-bold px-3 py-2 rounded-xl active:scale-95 transition-all"
          style={{ background: creating ? 'var(--color-surface-2)' : ACCENT, color: creating ? 'var(--color-muted)' : 'var(--color-bg)', border: '1px solid var(--color-border)', fontFamily: 'var(--font-display)' }}
        >
          {creating ? 'Cancel' : '+ New partner'}
        </button>
      </div>
      <p className="text-[11px] text-[var(--color-muted)] leading-snug mb-4">
        Influencers who bring people in on their own code, and earn on what those people spend. Their code is the only
        extra discount on the site.
      </p>

      {creating && (
        <CreatePartner
          taken={taken}
          onCreated={async (id) => {
            await load()
            setCreating(false)
            setOpen(id)
          }}
        />
      )}

      {records && records.length > 3 && (
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search name, email or code…"
          className="w-full px-3 py-2 rounded-xl text-sm outline-none mb-3"
          style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }}
        />
      )}

      {records === null ? (
        <p className="text-sm text-[var(--color-muted)]">Loading…</p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-[var(--color-muted)] text-center py-8">
          {records.length === 0 ? 'No partners yet. Create one to generate their code.' : 'Nobody matches.'}
        </p>
      ) : (
        <div className="space-y-2">
          {filtered.map((r) => {
            const code = r.codes[0]
            return (
              <button
                key={r.partner.id}
                onClick={() => setOpen(r.partner.id)}
                className="w-full text-left rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 active:scale-[0.99] transition-all"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: STATUS_COLOUR[r.partner.status] ?? 'var(--color-muted)' }} />
                      <p className="text-sm font-bold text-[var(--color-text)] truncate" style={{ fontFamily: 'var(--font-display)' }}>{r.partner.name}</p>
                      {code && (
                        <span className="text-[10px] font-black tracking-wide px-2 py-0.5 rounded-full flex-shrink-0"
                          style={{ color: ACCENT, background: `color-mix(in srgb, ${ACCENT} 14%, transparent)` }}>
                          {code.code}
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-[var(--color-muted)] mt-0.5 truncate">
                      {code ? `${Math.round(code.discountPct * 100)}% off` : 'no code'} · {describeTerms(r.terms)}
                    </p>
                    {(() => {
                      const t = totals(performance.find((p) => p.partnerId === r.partner.id)?.codes)
                      if (!t) return null
                      return (
                        <p className="text-[11px] mt-1 font-semibold" style={{ color: t.orders > 0 ? ACCENT : 'var(--color-muted)' }}>
                          {t.orders === 0
                            ? 'No orders yet'
                            : `${t.orders} order${t.orders === 1 ? '' : 's'} · £${t.revenue.toFixed(2)}` +
                              (t.subscriptions > 0 ? ` · ${t.subscriptions} subscribed` : '') +
                              (t.reversed > 0 ? ` · ${t.reversed} refunded` : '')}
                        </p>
                      )
                    })()}
                  </div>
                  <span className="text-xs font-bold text-[var(--color-muted)] flex-shrink-0">Manage →</span>
                </div>
              </button>
            )
          })}
        </div>
      )}

      {selected && (
        <PartnerDetail
          record={selected}
          onClose={() => setOpen(null)}
          onSaved={load}
        />
      )}
    </div>
  )
}

function CreatePartner({ taken, onCreated }: { taken: string[]; onCreated: (id: string) => void }) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [discount, setDiscount] = useState(String(Math.round(PRICING_CONFIG.partners.introFloorPct * 100)))
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Shown live so a founder can see the code before committing to it — it goes
  // on someone's story and cannot quietly change afterwards.
  const suggested = useMemo(
    () => (name.trim() ? suggestCode(name, (Number(discount) || 0) / 100, taken) : ''),
    [name, discount, taken],
  )

  async function create() {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/portal/partners', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create',
          name,
          email,
          discountPct: (Number(discount) || 0) / 100,
          code: code.trim() || undefined,
        }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(d.error ?? 'Could not create that partner.')
        return
      }
      onCreated(d.partner.partner.id)
    } catch {
      setError('Could not reach the hub.')
    } finally {
      setBusy(false)
    }
  }

  const input = 'w-full px-3 py-2 rounded-xl text-sm outline-none'
  const style = { background: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-text)' } as const

  return (
    <div className="rounded-2xl border border-[var(--color-border)] p-4 mb-4" style={{ background: 'var(--color-surface-2)' }}>
      <p className="text-xs font-black text-[var(--color-text)] mb-3" style={{ fontFamily: 'var(--font-display)' }}>New partner</p>

      <div className="grid grid-cols-2 gap-3 mb-3">
        <label className="block">
          <span className="text-[11px] font-bold text-[var(--color-muted)] block mb-1">Name</span>
          <input className={input} style={style} value={name} onChange={(e) => setName(e.target.value)} placeholder="Sarah Jones" />
        </label>
        <label className="block">
          <span className="text-[11px] font-bold text-[var(--color-muted)] block mb-1">Email</span>
          <input className={input} style={style} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="sarah@example.com" />
        </label>
        <label className="block">
          <span className="text-[11px] font-bold text-[var(--color-muted)] block mb-1">Follower discount (%)</span>
          <input className={input} style={style} inputMode="decimal" value={discount} onChange={(e) => setDiscount(e.target.value)} />
        </label>
        <label className="block">
          <span className="text-[11px] font-bold text-[var(--color-muted)] block mb-1">Code</span>
          <input className={input} style={style} value={code} onChange={(e) => setCode(e.target.value)} placeholder={suggested || 'auto'} />
        </label>
      </div>

      <p className="text-[11px] text-[var(--color-muted)] leading-snug mb-3">
        {suggested && !code.trim() ? <>Their code will be <strong className="text-[var(--color-text)]">{suggested}</strong>. </> : null}
        They start on the standard deal — {describeTerms({
          firstOrderPct: PRICING_CONFIG.partners.firstOrderPct,
          renewalPct: PRICING_CONFIG.partners.renewalPct,
          renewalMonths: PRICING_CONFIG.partners.renewalMonths,
        })} Change it per partner once they exist.
      </p>

      {error && <p className="text-xs font-semibold mb-3 px-3 py-2 rounded-xl" style={{ color: '#f87171', background: 'color-mix(in srgb, #f87171 12%, transparent)' }}>{error}</p>}

      <button
        disabled={busy || !name.trim() || !email.trim()}
        onClick={create}
        className="text-xs font-bold px-3 py-2 rounded-xl active:scale-95 transition-all disabled:opacity-40"
        style={{ background: ACCENT, color: 'var(--color-bg)', fontFamily: 'var(--font-display)' }}
      >
        {busy ? 'Creating…' : 'Create partner & code'}
      </button>
    </div>
  )
}
