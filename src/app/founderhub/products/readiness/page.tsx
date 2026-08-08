'use client'

import { useEffect, useMemo, useState } from 'react'
import { ProductEditor } from '@/components/portal/ProductEditor'
import type { CatalogueProduct } from '@/lib/catalogue/types'
import type { ProductReadiness, CheckStatus } from '@/lib/portal/readiness'

const DOT: Record<CheckStatus, string> = { ok: '#34d399', warn: '#fbbf24', fail: '#f87171' }
const RANK: Record<CheckStatus, number> = { fail: 0, warn: 1, ok: 2 }

interface Row { product: CatalogueProduct; readiness: ProductReadiness }

export default function ReadinessPage() {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [editing, setEditing] = useState<CatalogueProduct | null>(null)

  function load() {
    fetch('/api/portal/products').then((r) => r.json()).then((d) => setRows(d.products ?? [])).catch(() => setRows([]))
  }
  useEffect(load, [])

  const allProducts = useMemo(() => rows?.map((r) => r.product) ?? [], [rows])
  const sorted = useMemo(() => [...(rows ?? [])].sort((a, b) => RANK[a.readiness.overall] - RANK[b.readiness.overall]), [rows])
  const counts = {
    ok: (rows ?? []).filter((r) => r.readiness.overall === 'ok').length,
    warn: (rows ?? []).filter((r) => r.readiness.overall === 'warn').length,
    fail: (rows ?? []).filter((r) => r.readiness.overall === 'fail').length,
  }

  return (
    <div>
      <h2 className="text-lg font-black mb-1" style={{ color: 'var(--color-text)', fontFamily: 'var(--font-display)' }}>Readiness</h2>
      <p className="text-sm text-[var(--color-muted)] mb-4">Launch-readiness across your catalogue. Tap a product to fix it.</p>

      <div className="grid grid-cols-3 gap-3 mb-5">
        {([['Ready', counts.ok, '#34d399'], ['Warnings', counts.warn, '#fbbf24'], ['Blocking', counts.fail, '#f87171']] as const).map(([l, n, c]) => (
          <div key={l} className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-2)] p-4 text-center">
            <p className="text-2xl font-black" style={{ color: c, fontFamily: 'var(--font-display)' }}>{rows === null ? '…' : n}</p>
            <p className="text-[11px] text-[var(--color-muted)] mt-0.5">{l}</p>
          </div>
        ))}
      </div>

      {rows === null ? (
        <p className="text-sm text-[var(--color-muted)]">Loading…</p>
      ) : (
        <div className="space-y-2">
          {sorted.map(({ product, readiness }) => (
            <button key={product.id} onClick={() => setEditing(product)} className="w-full text-left rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 active:scale-[0.99] transition-all">
              <div className="flex items-center gap-2 mb-2">
                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: DOT[readiness.overall] }} />
                <p className="text-sm font-bold text-[var(--color-text)] truncate" style={{ fontFamily: 'var(--font-display)' }}>{product.title}</p>
              </div>
              <div className="space-y-1">
                {readiness.checks.map((c) => (
                  <div key={c.id} className="flex items-center gap-2 text-[11px]">
                    <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: DOT[c.status] }} />
                    <span className="text-[var(--color-text-2)]">{c.label}</span>
                    {c.detail && <span className="text-[var(--color-muted)]">— {c.detail}</span>}
                  </div>
                ))}
              </div>
            </button>
          ))}
        </div>
      )}

      {editing && <ProductEditor product={editing} allProducts={allProducts} onClose={() => setEditing(null)} onSaved={load} />}
    </div>
  )
}
