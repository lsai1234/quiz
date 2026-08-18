'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { ProductEditor } from '@/components/portal/ProductEditor'
import type { CatalogueProduct } from '@/lib/catalogue/types'
import type { ProductReadiness, CheckStatus } from '@/lib/portal/readiness'
import { Badge, Button, Card, Input } from '@/components/system'

/** Readiness status → the system's semantic tone. `Badge` owns the colours. */
const TONE: Record<CheckStatus, 'positive' | 'attention' | 'critical'> = { ok: 'positive', warn: 'attention', fail: 'critical' }

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
              <Card key={slot.productId} solid padding="tight" tone={!p ? 'critical' : undefined}>
                <div className="flex items-start gap-3">
  <span className="w-6 text-right shrink-0" style={{ fontSize: 'var(--text-body-sm)', fontWeight: 'var(--weight-display)', fontFamily: 'var(--font-display)', fontVariantNumeric: 'tabular-nums', color: 'var(--accent)' }}>
                    {slot.rank}
                  </span>

                  <div className="min-w-0 flex-1">
                    {p ? (
                      <>
                        <div className="flex items-center gap-2">
                          <Button variant="ghost" size="sm" className="min-w-0" aria-label={`Edit ${p.title}`} onClick={() => setEditing(p)}>
                            <span className="truncate">{p.title}</span>
                          </Button>
                          {/* Only when it is not fine: a green dot on every row
                              says nothing about which one needs opening. */}
                          {slot.readiness && slot.readiness.overall !== 'ok' && (
                            <Badge tone={TONE[slot.readiness.overall]} dot>
                              {slot.readiness.overall === 'fail' ? 'Not ready' : 'Needs a look'}
                            </Badge>
                          )}
                        </div>
                        <p style={{ fontSize: 'var(--text-meta)', color: 'var(--ink-3)', marginTop: 'var(--space-1)' }}>
                          {p.category} · {p.subscriptionEligible ? 'subscribable' : 'one-off'} · {p.servings} servings ·{' '}
                          {money(p.basePrice)}{p.cost != null ? ` · costs ${money(p.cost)}` : ' · no cost set'}
                        </p>
                        {verdict && (
                          <p style={{ fontSize: 'var(--text-meta)', marginTop: 'var(--space-1)', color: !verdict.viable ? 'var(--tone-critical)' : !verdict.scenariosOk ? 'var(--tone-attention)' : 'var(--tone-positive)' }}>
                            {verdict.viable
                              ? `We keep ${money(verdict.keeps)} a month (${pct(verdict.marginPct)})`
                              : 'Loses money as a stack line'}
                            {!verdict.scenariosOk && verdict.problems.length > 0 && ` · loses on: ${verdict.problems.join(', ')}`}
                            {verdict.costEstimated && ' · cost estimated'}
                          </p>
                        )}
                        {slot.readiness && slot.readiness.overall !== 'ok' && (
                          <p style={{ fontSize: 'var(--text-meta)', marginTop: 'var(--space-1)', color: slot.readiness.overall === 'fail' ? 'var(--tone-critical)' : 'var(--tone-attention)' }}>
                            {slot.readiness.checks.filter((c) => c.status !== 'ok').map((c) => c.label).join(' · ')}
                          </p>
                        )}
                      </>
                    ) : (
                      <p style={{ fontSize: 'var(--text-body-sm)', fontWeight: 'var(--weight-strong)', color: 'var(--tone-critical)' }}>
                        {slot.productId} — no longer in the catalogue. Take it off.
                      </p>
                    )}
                  </div>

                  {/* Named by what they move. Twenty-five rows of "Move up" is
                      a list a screen-reader user cannot work in. */}
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="sm"
                      icon="chevron-up"
                      aria-label={`Move ${p?.title ?? slot.productId} up`}
                      disabled={busy || i === 0}
                      onClick={() => act({ action: 'move', productId: slot.productId, direction: -1 })}
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      icon="chevron-down"
                      aria-label={`Move ${p?.title ?? slot.productId} down`}
                      disabled={busy || i === data.roster.length - 1}
                      onClick={() => act({ action: 'move', productId: slot.productId, direction: 1 })}
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      icon="x"
                      aria-label={`Take ${p?.title ?? slot.productId} off the roster`}
                      disabled={busy}
                      onClick={() => act({ action: 'remove', productId: slot.productId })}
                    />
                  </div>
                </div>
              </Card>
            )
          })}
        </div>
      )}

      {/* Candidates */}
      <section>
        <h3 style={{ fontSize: 'var(--text-body-sm)', fontWeight: 'var(--weight-display)', fontFamily: 'var(--font-display)', color: 'var(--ink-1)', marginBottom: 'var(--space-1)' }}>
          Everything else ({data.candidates.length})
        </h3>
        <p style={{ fontSize: 'var(--text-meta)', color: 'var(--ink-3)', marginBottom: 'var(--space-2)' }}>
          {full
            ? `The Top ${data.limit} is full — take something off before adding.`
            : `${data.limit - data.roster.length} place${data.limit - data.roster.length === 1 ? '' : 's'} left.`}
        </p>
        <div className="mb-2">
          <Input
            label="Search the catalogue"
            compact
            className="w-full"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search the catalogue…"
          />
        </div>

        <div className="space-y-1.5 max-h-96 overflow-y-auto">
          {candidates.map((c) => (
            // `solid`: this list scrolls inside its own box, and translucency
            // over a scrolling parent is the case that is not paid for.
            <Card key={c.id} solid padding="tight" className="flex items-center justify-between gap-3">
              <div className="min-w-0 flex items-center gap-2">
                <div className="min-w-0">
                  <p className="truncate" style={{ fontSize: 'var(--text-body-sm)', fontWeight: 'var(--weight-strong)', color: 'var(--ink-1)' }}>
                    {c.title}
                  </p>
                  <p style={{ fontSize: 'var(--text-meta)', color: 'var(--ink-3)' }}>
                    {c.category} · {money(c.basePrice)}{c.cost == null && ' · no cost set'}
                  </p>
                </div>
                {c.readiness !== 'ok' && (
                  <Badge tone={TONE[c.readiness]} dot>
                    {c.readiness === 'fail' ? 'Not ready' : 'Needs a look'}
                  </Badge>
                )}
              </div>
              <Button
                size="sm"
                icon="plus"
                aria-label={`Add ${c.title} to the roster`}
                disabled={busy || full}
                onClick={() => act({ action: 'add', productId: c.id })}
              >
                Add
              </Button>
            </Card>
          ))}
          {candidates.length === 0 && (
            <p className="text-center" style={{ fontSize: 'var(--text-body-sm)', color: 'var(--ink-3)', padding: 'var(--space-4) 0' }}>
              Nothing matches.
            </p>
          )}
        </div>
      </section>

      {editing && (
        <ProductEditor product={editing} allProducts={allProducts} onClose={() => setEditing(null)} onSaved={load} />
      )}
    </div>
  )
}

function Stat({ n, label, colour }: { n: number | string; label: string; colour: string }) {
  return (
    <Card elevation={2} className="text-center">
      <p style={{ fontSize: 'var(--text-display)', fontWeight: 'var(--weight-display)', fontFamily: 'var(--font-display)', fontVariantNumeric: 'tabular-nums', color: colour }}>
        {n}
      </p>
      <p style={{ fontSize: 'var(--text-meta)', color: 'var(--ink-3)', marginTop: 'var(--space-1)' }}>{label}</p>
    </Card>
  )
}
