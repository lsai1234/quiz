'use client'

import { useEffect, useMemo, useState } from 'react'
import { ProductEditor } from '@/components/portal/ProductEditor'
import type { CatalogueProduct } from '@/lib/catalogue/types'
import type { ProductReadiness, CheckStatus } from '@/lib/portal/readiness'
import { Badge, Button, Card } from '@/components/system'

/** Readiness status → the system's semantic tone. `Badge` owns the colours. */
const TONE: Record<CheckStatus, 'positive' | 'attention' | 'critical'> = { ok: 'positive', warn: 'attention', fail: 'critical' }
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
      <h2 className="text-lg font-black mb-1" style={{ color: 'var(--ink-1)', fontFamily: 'var(--font-display)' }}>Readiness</h2>
      <p className="text-sm text-[var(--ink-3)] mb-4">Launch-readiness across your catalogue. Tap a product to fix it.</p>

      <div className="grid grid-cols-3 gap-3 mb-5">
        {([['Ready', counts.ok, 'var(--tone-positive)'], ['Warnings', counts.warn, 'var(--tone-attention)'], ['Blocking', counts.fail, 'var(--tone-critical)']] as const).map(([l, n, c]) => (
          <div key={l} className="rounded-2xl border border-[var(--edge)] bg-[var(--surface-2)] p-4 text-center">
            <p className="text-2xl font-black" style={{ color: c, fontFamily: 'var(--font-display)' }}>{rows === null ? '…' : n}</p>
            <p className="text-[11px] text-[var(--ink-3)] mt-0.5">{l}</p>
          </div>
        ))}
      </div>

      {rows === null ? (
        <p style={{ fontSize: 'var(--text-body-sm)', color: 'var(--ink-3)' }}>Loading…</p>
      ) : (
        <div className="space-y-2">
          {sorted.map(({ product, readiness }) => (
            <Card key={product.id} solid interactive padding="none">
            <Button
              variant="ghost"
              fullWidth
              className="text-left justify-start items-start"
              aria-label={`Edit ${product.title}`}
              onClick={() => setEditing(product)}
            >
              <span className="min-w-0">
                <span className="flex items-center gap-2">
                  <Badge tone={TONE[readiness.overall]} dot>
                    {readiness.overall === 'ok' ? 'Ready' : readiness.overall === 'warn' ? 'Needs a look' : 'Not ready'}
                  </Badge>
                  <span className="truncate" style={{ fontSize: 'var(--text-body-sm)', fontFamily: 'var(--font-display)', color: 'var(--ink-1)' }}>
                    {product.title}
                  </span>
                </span>
                <span className="block space-y-1" style={{ marginTop: 'var(--space-2)' }}>
                  {readiness.checks.map((c) => (
                    <span key={c.id} className="flex items-center gap-2" style={{ fontSize: 'var(--text-meta)', fontWeight: 'var(--weight-body)' }}>
                      <Badge tone={TONE[c.status]} dot>
                        {c.label}
                      </Badge>
                      {c.detail && <span style={{ color: 'var(--ink-3)' }}>{c.detail}</span>}
                    </span>
                  ))}
                </span>
              </span>
            </Button>
            </Card>
          ))}
        </div>
      )}

      {editing && <ProductEditor product={editing} allProducts={allProducts} onClose={() => setEditing(null)} onSaved={load} />}
    </div>
  )
}
