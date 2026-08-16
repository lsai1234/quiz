'use client'

import { useEffect, useMemo, useState } from 'react'
import { ProductEditor } from '@/components/portal/ProductEditor'
import { AiSuggestPanel } from '@/components/portal/AiSuggestPanel'
import type { CatalogueProduct } from '@/lib/catalogue/types'
import type { ProductReadiness, CheckStatus } from '@/lib/portal/readiness'

const DOT: Record<CheckStatus, string> = { ok: 'var(--tone-positive)', warn: 'var(--tone-attention)', fail: 'var(--tone-critical)' }

interface Row { product: CatalogueProduct; readiness: ProductReadiness }

export default function ProductsPage() {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<'all' | 'attention' | 'sub'>('all')
  const [editing, setEditing] = useState<CatalogueProduct | null>(null)
  const [showAi, setShowAi] = useState(false)

  function load() {
    fetch('/api/portal/products').then((r) => r.json()).then((d) => setRows(d.products ?? [])).catch(() => setRows([]))
  }
  useEffect(load, [])

  const notReady = (rows ?? []).filter((r) => r.readiness.overall !== 'ok').length

  const allProducts = useMemo(() => rows?.map((r) => r.product) ?? [], [rows])
  const filtered = useMemo(() => {
    let r = rows ?? []
    if (query) r = r.filter((x) => x.product.title.toLowerCase().includes(query.toLowerCase()))
    if (filter === 'attention') r = r.filter((x) => x.readiness.overall !== 'ok')
    if (filter === 'sub') r = r.filter((x) => x.product.subscriptionEligible)
    return r
  }, [rows, query, filter])

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-3">
        <h2 className="text-lg font-black" style={{ color: 'var(--ink-1)', fontFamily: 'var(--font-display)' }}>Catalogue</h2>
        <button
          onClick={() => setShowAi(true)}
          disabled={notReady === 0}
          className="text-xs font-bold px-3 py-2 rounded-xl bg-[var(--accent)] text-[var(--ink-on-accent)] active:scale-95 transition-all disabled:opacity-40"
          style={{ fontFamily: 'var(--font-display)' }}
          title={notReady === 0 ? 'Everything is already tagged' : `Get AI tag suggestions for ${notReady} product(s)`}
        >
          {`✨ Suggest tags${notReady ? ` (${notReady})` : ''}`}
        </button>
      </div>

      <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search products…" className="w-full px-3 py-2 rounded-xl text-sm outline-none mb-2" style={{ background: 'var(--surface-2)', border: '1px solid var(--edge)', color: 'var(--ink-1)' }} />
      <div className="flex flex-wrap gap-2 mb-4">
        {(['all', 'attention', 'sub'] as const).map((f) => (
          <button key={f} onClick={() => setFilter(f)} className="px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap"
            style={{ background: filter === f ? 'var(--accent)' : 'var(--surface-2)', color: filter === f ? 'var(--ground-base)' : 'var(--ink-3)', border: '1px solid var(--edge)' }}>
            {f === 'all' ? `All (${rows?.length ?? 0})` : f === 'attention' ? `Needs attention (${notReady})` : 'Subscription'}
          </button>
        ))}
      </div>

      {rows === null ? (
        <p className="text-sm text-[var(--ink-3)]">Loading…</p>
      ) : (
        <div className="space-y-2">
          {filtered.map(({ product, readiness }) => (
            <button key={product.id} onClick={() => setEditing(product)} className="w-full text-left rounded-2xl border border-[var(--edge)] bg-[var(--surface-1)] p-4 active:scale-[0.99] transition-all">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: DOT[readiness.overall] }} />
                    <p className="text-sm font-bold text-[var(--ink-1)] truncate" style={{ fontFamily: 'var(--font-display)' }}>{product.title}</p>
                  </div>
                  <p className="text-[11px] text-[var(--ink-3)] mt-0.5">
                    {product.category} · {product.subscriptionEligible ? 'subscribable' : 'one-off'} · {product.servings}d
                    {product.cost == null && ' · no cost set'}
                  </p>
                </div>
                <span className="text-xs font-bold text-[var(--ink-3)]">Edit →</span>
              </div>
            </button>
          ))}
          {filtered.length === 0 && <p className="text-sm text-[var(--ink-3)] text-center py-8">No products match.</p>}
        </div>
      )}

      {editing && (
        <ProductEditor
          product={editing}
          allProducts={allProducts}
          onClose={() => setEditing(null)}
          onSaved={load}
        />
      )}

      {showAi && <AiSuggestPanel onClose={() => setShowAi(false)} onApplied={load} />}
    </div>
  )
}
