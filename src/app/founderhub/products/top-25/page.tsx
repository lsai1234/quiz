'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { ProductEditor } from '@/components/portal/ProductEditor'
import type { CatalogueProduct } from '@/lib/catalogue/types'
import type { ProductReadiness, CheckStatus } from '@/lib/portal/readiness'

const DOT: Record<CheckStatus, string> = { ok: 'var(--tone-positive)', warn: 'var(--tone-attention)', fail: 'var(--tone-critical)' }

/** What the roster API reports about a product's economics. */
type PriceAudit = {
  keeps: number
  marginPct: number
  viable: boolean
  costEstimated: boolean
  scenariosOk: boolean
  problems: string[]
}

interface Slot {
  rank: number
  productId: string
  product: CatalogueProduct | null
  readiness: ProductReadiness | null
  price: PriceAudit | null
}
interface Candidate {
  id: string
  title: string
  category: string
  basePrice: number
  cost: number | null
  subscriptionEligible: boolean
  readiness: CheckStatus
}
interface Payload { limit: number; roster: Slot[]; candidates: Candidate[] }

const money = (n: number) => `£${n.toFixed(2)}`
const pct = (n: number) => `${Math.round(n * 1000) / 10}%`

export default function TopProductsPage() {
  const [data, setData] = useState<Payload | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState<CatalogueProduct | null>(null)

  const load = useCallback(() => {
    fetch('/api/portal/top-products')
      .then((r) => r.json())
      .then(setData)
      .catch(() => setError('Could not load the roster.'))
  }, [])
  useEffect(load, [load])

  const act = useCallback(
    async (body: Record<string, unknown>) => {
      setBusy(true)
      setError(null)
      try {
        const res = await fetch('/api/portal/top-products', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        const d = await res.json().catch(() => ({}))
        if (!res.ok) setError(d.error ?? 'Could not save the change.')
      } finally {
        setBusy(false)
        load()
      }
    },
    [load],
  )

  const allProducts = useMemo(
    () => (data?.roster ?? []).map((s) => s.product).filter((p): p is CatalogueProduct => p !== null),
    [data],
  )

  const candidates = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = data?.candidates ?? []
    return q ? list.filter((c) => c.title.toLowerCase().includes(q) || c.category.toLowerCase().includes(q)) : list
  }, [data, query])

  if (!data) return <p className="text-sm text-[var(--ink-3)]">{error ?? 'Loading…'}</p>

  const full = data.roster.length >= data.limit
  const problems = data.roster.filter((s) => !s.product || s.readiness?.overall === 'fail').length
  const unprofitable = data.roster.filter((s) => s.price && !s.price.viable).length

  return (
    <div className="space-y-5 pb-10">
      <div>
        <h2 className="text-lg font-black" style={{ color: 'var(--ink-1)', fontFamily: 'var(--font-display)' }}>
          Top {data.limit}
        </h2>
        <p className="text-sm text-[var(--ink-3)] mt-0.5">
          The products the quiz reaches for first. Everything we sell is still in the shop and still swappable —
          this is what the engine prefers when several products could fill the same slot, ranked so #1 wins ties over #{data.limit}.
        </p>
        <p className="text-[11px] text-[var(--ink-3)] mt-1">
          There are {data.limit} places on purpose: being here is a promise that this product&apos;s data is
          maintained, so the columns below are that promise, kept or broken.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Stat n={`${data.roster.length}/${data.limit}`} label="Places filled" colour={full ? 'var(--tone-positive)' : 'var(--accent)'} />
        <Stat n={problems} label="Not ready to sell" colour={problems > 0 ? 'var(--tone-critical)' : 'var(--tone-positive)'} />
        <Stat n={unprofitable} label="Losing money" colour={unprofitable > 0 ? 'var(--tone-critical)' : 'var(--tone-positive)'} />
      </div>

      {error && <p className="text-xs" style={{ color: 'var(--tone-critical)' }}>{error}</p>}

      {/* The roster */}
      {data.roster.length === 0 ? (
        <p className="text-sm text-[var(--ink-3)] py-6 text-center rounded-2xl border border-[var(--edge)]">
          Nothing on the roster yet. Until you pick some, the quiz scores the whole catalogue evenly.
        </p>
      ) : (
        <div className="space-y-2">
          {data.roster.map((slot, i) => {
            const p = slot.product
            const verdict = slot.price
            return (
              <div key={slot.productId} className="rounded-2xl border p-3.5"
                style={{ background: 'var(--surface-1)', borderColor: !p ? `var(--critical-line)` : 'var(--edge)' }}>
                <div className="flex items-start gap-3">
                  <span className="text-sm font-black w-6 text-right shrink-0" style={{ color: 'var(--accent)', fontFamily: 'var(--font-display)' }}>{slot.rank}</span>

                  <div className="min-w-0 flex-1">
                    {p ? (
                      <>
                        <div className="flex items-center gap-2">
                          {slot.readiness && <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: DOT[slot.readiness.overall] }} />}
                          <button onClick={() => setEditing(p)} className="text-sm font-bold text-[var(--ink-1)] truncate underline decoration-dotted" style={{ fontFamily: 'var(--font-display)' }}>
                            {p.title}
                          </button>
                        </div>
                        <p className="text-[11px] text-[var(--ink-3)] mt-0.5">
                          {p.category} · {p.subscriptionEligible ? 'subscribable' : 'one-off'} · {p.servings} servings ·{' '}
                          {money(p.basePrice)}{p.cost != null ? ` · costs ${money(p.cost)}` : ' · no cost set'}
                        </p>
                        {verdict && (
                          <p className="text-[11px] mt-1" style={{ color: !verdict.viable ? 'var(--tone-critical)' : !verdict.scenariosOk ? 'var(--tone-attention)' : 'var(--tone-positive)' }}>
                            {verdict.viable
                              ? `We keep ${money(verdict.keeps)} a month (${pct(verdict.marginPct)})`
                              : 'Loses money as a stack line'}
                            {!verdict.scenariosOk && verdict.problems.length > 0 && ` · loses on: ${verdict.problems.join(', ')}`}
                            {verdict.costEstimated && ' · cost estimated'}
                          </p>
                        )}
                        {slot.readiness && slot.readiness.overall !== 'ok' && (
                          <p className="text-[11px] mt-1" style={{ color: DOT[slot.readiness.overall] }}>
                            {slot.readiness.checks.filter((c) => c.status !== 'ok').map((c) => c.label).join(' · ')}
                          </p>
                        )}
                      </>
                    ) : (
                      <p className="text-sm font-semibold" style={{ color: 'var(--tone-critical)' }}>
                        {slot.productId} — no longer in the catalogue. Take it off.
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => act({ action: 'move', productId: slot.productId, direction: -1 })} disabled={busy || i === 0} className={ICON} aria-label="Move up">↑</button>
                    <button onClick={() => act({ action: 'move', productId: slot.productId, direction: 1 })} disabled={busy || i === data.roster.length - 1} className={ICON} aria-label="Move down">↓</button>
                    <button onClick={() => act({ action: 'remove', productId: slot.productId })} disabled={busy} className={ICON} style={{ color: 'var(--tone-critical)' }} aria-label="Remove">✕</button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Candidates */}
      <section>
        <h3 className="text-sm font-bold mb-1" style={{ color: 'var(--ink-1)', fontFamily: 'var(--font-display)' }}>
          Everything else ({data.candidates.length})
        </h3>
        <p className="text-[11px] text-[var(--ink-3)] mb-2">
          {full
            ? `The Top ${data.limit} is full — take something off before adding.`
            : `${data.limit - data.roster.length} place${data.limit - data.roster.length === 1 ? '' : 's'} left.`}
        </p>
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search the catalogue…"
          className="w-full px-3 py-2 rounded-xl text-sm outline-none mb-2"
          style={{ background: 'var(--surface-2)', border: '1px solid var(--edge)', color: 'var(--ink-1)' }} />

        <div className="space-y-1.5 max-h-96 overflow-y-auto">
          {candidates.map((c) => (
            <div key={c.id} className="flex items-center justify-between gap-3 rounded-xl border px-3 py-2"
              style={{ background: 'var(--surface-1)', borderColor: 'var(--edge)' }}>
              <div className="min-w-0 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: DOT[c.readiness] }} />
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-[var(--ink-1)] truncate">{c.title}</p>
                  <p className="text-[10px] text-[var(--ink-3)]">
                    {c.category} · {money(c.basePrice)}{c.cost == null && ' · no cost set'}
                  </p>
                </div>
              </div>
              <button onClick={() => act({ action: 'add', productId: c.id })} disabled={busy || full}
                className="text-[11px] font-bold px-2.5 py-1.5 rounded-lg border disabled:opacity-30 shrink-0"
                style={{ borderColor: `var(--accent-line)`, color: 'var(--accent)' }}>
                Add
              </button>
            </div>
          ))}
          {candidates.length === 0 && <p className="text-xs text-[var(--ink-3)] py-4 text-center">Nothing matches.</p>}
        </div>
      </section>

      {editing && (
        <ProductEditor product={editing} allProducts={allProducts} onClose={() => setEditing(null)} onSaved={load} />
      )}
    </div>
  )
}

const ICON = 'text-xs font-bold w-7 h-7 rounded-lg border border-[var(--edge)] text-[var(--ink-3)] disabled:opacity-25'

function Stat({ n, label, colour }: { n: number | string; label: string; colour: string }) {
  return (
    <div className="rounded-2xl border border-[var(--edge)] bg-[var(--surface-2)] p-4 text-center">
      <p className="text-2xl font-black" style={{ color: colour, fontFamily: 'var(--font-display)' }}>{n}</p>
      <p className="text-[11px] text-[var(--ink-3)] mt-0.5">{label}</p>
    </div>
  )
}
