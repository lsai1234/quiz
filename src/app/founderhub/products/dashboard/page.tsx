'use client'

import { useEffect, useMemo, useState } from 'react'
import type { CatalogueProduct } from '@/lib/catalogue/types'
import type { ProductReadiness, CheckStatus } from '@/lib/portal/readiness'

const DOT: Record<CheckStatus, string> = { ok: 'var(--tone-positive)', warn: 'var(--tone-attention)', fail: 'var(--tone-critical)' }

interface Row { product: CatalogueProduct; readiness: ProductReadiness }

function priceLabel(p: CatalogueProduct): string {
  const base = `£${p.basePrice.toFixed(2)}`
  return p.compareAtPrice ? `${base}  (was £${p.compareAtPrice.toFixed(2)})` : base
}

export default function DashboardPage() {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [source, setSource] = useState<'mock' | 'real'>('mock')
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('all')
  const [removing, setRemoving] = useState<string | null>(null)
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  function load() {
    fetch('/api/portal/products')
      .then((r) => r.json())
      .then((d) => { setRows(d.products ?? []); setSource(d.source ?? 'mock') })
      .catch(() => setRows([]))
  }
  useEffect(load, [])

  const categories = useMemo(() => {
    const set = new Set((rows ?? []).map((r) => r.product.category))
    return ['all', ...[...set].sort()]
  }, [rows])

  const filtered = useMemo(() => {
    let r = rows ?? []
    if (query) r = r.filter((x) => x.product.title.toLowerCase().includes(query.toLowerCase()))
    if (category !== 'all') r = r.filter((x) => x.product.category === category)
    return r
  }, [rows, query, category])

  async function remove(id: string) {
    setRemoving(id)
    setError(null)
    try {
      const res = await fetch('/api/portal/products', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        setError(d.detail || d.error || 'Failed to remove product')
      } else {
        setRows((prev) => (prev ? prev.filter((x) => x.product.id !== id) : prev))
      }
    } finally {
      setRemoving(null)
      setConfirmId(null)
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-1">
        <h2 className="text-lg font-black" style={{ color: 'var(--ink-1)', fontFamily: 'var(--font-display)' }}>Product dashboard</h2>
        <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-1 rounded-full" style={{ color: source === 'real' ? 'var(--accent)' : 'var(--ink-3)', background: 'var(--surface-2)', border: '1px solid var(--edge)' }}>
          {source === 'real' ? '● Real catalogue' : '● Mock catalogue'}
        </span>
      </div>
      <p className="text-sm text-[var(--ink-3)] mb-4">
        Browse the catalogue and remove products. Removing hides a product everywhere — the shop, the quiz and the hub.
      </p>

      {error && (
        <div className="mb-3 text-xs rounded-xl px-3 py-2" style={{ background: 'color-mix(in srgb, var(--tone-critical) 12%, transparent)', border: '1px solid color-mix(in srgb, var(--tone-critical) 30%, transparent)', color: 'var(--tone-critical)' }}>
          {error}
        </div>
      )}

      <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search products…" className="w-full px-3 py-2 rounded-xl text-sm outline-none mb-2" style={{ background: 'var(--surface-2)', border: '1px solid var(--edge)', color: 'var(--ink-1)' }} />
      <div className="flex flex-wrap gap-2 mb-4">
        {categories.map((c) => (
          <button key={c} onClick={() => setCategory(c)} className="px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap"
            style={{ background: category === c ? 'var(--accent)' : 'var(--surface-2)', color: category === c ? 'var(--ground-base)' : 'var(--ink-3)', border: '1px solid var(--edge)' }}>
            {c === 'all' ? `All (${rows?.length ?? 0})` : c}
          </button>
        ))}
      </div>

      {rows === null ? (
        <p className="text-sm text-[var(--ink-3)]">Loading…</p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-[var(--ink-3)]">No products match.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {filtered.map(({ product: p, readiness }) => {
            const flavours = p.variants.map((v) => v.flavour).filter(Boolean) as string[]
            const skus = p.variants.map((v) => v.sku).filter(Boolean) as string[]
            return (
              <div key={p.id} className="rounded-2xl border border-[var(--edge)] bg-[var(--surface-1)] p-3 flex gap-3">
                <div className="w-16 h-16 rounded-xl flex-shrink-0 overflow-hidden flex items-center justify-center" style={{ background: 'var(--surface-2)', border: '1px solid var(--edge)' }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {p.imageUrl ? <img src={p.imageUrl} alt={p.title} className="w-full h-full object-cover" /> : <span className="text-[10px] text-[var(--ink-3)]">No image</span>}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-bold truncate" style={{ color: 'var(--ink-1)', fontFamily: 'var(--font-display)' }}>{p.title}</p>
                      <p className="text-[11px] text-[var(--ink-3)]">{p.category}</p>
                    </div>
                    <span className="w-2.5 h-2.5 rounded-full flex-shrink-0 mt-1" style={{ background: DOT[readiness.overall] }} title={`Readiness: ${readiness.overall}`} />
                  </div>
                  <p className="text-xs mt-1" style={{ color: 'var(--ink-1)' }}>{priceLabel(p)}</p>
                  {flavours.length > 0 && <p className="text-[11px] text-[var(--ink-3)] mt-1 truncate">{flavours.length} flavour{flavours.length > 1 ? 's' : ''}: {flavours.join(', ')}</p>}
                  {skus.length > 0 && <p className="text-[11px] text-[var(--ink-3)] truncate">SKU: {skus.join(', ')}</p>}

                  {confirmId === p.id ? (
                    <div className="flex gap-2 mt-2">
                      <button onClick={() => remove(p.id)} disabled={removing === p.id} className="text-[11px] font-bold px-2.5 py-1.5 rounded-lg text-white active:scale-95 transition-all disabled:opacity-50" style={{ background: 'var(--tone-critical)' }}>
                        {removing === p.id ? 'Removing…' : 'Confirm remove'}
                      </button>
                      <button onClick={() => setConfirmId(null)} className="text-[11px] font-semibold px-2.5 py-1.5 rounded-lg text-[var(--ink-3)]" style={{ border: '1px solid var(--edge)' }}>Cancel</button>
                    </div>
                  ) : (
                    <button onClick={() => { setConfirmId(p.id); setError(null) }} className="text-[11px] font-bold mt-2 inline-block" style={{ color: 'var(--tone-critical)' }}>Remove →</button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
