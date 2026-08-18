'use client'

import { useEffect, useMemo, useState } from 'react'
import type { CatalogueProduct } from '@/lib/catalogue/types'
import type { ProductReadiness, CheckStatus } from '@/lib/portal/readiness'
import { Badge, Button, Card, Input } from '@/components/system'

/** Readiness status → the system's semantic tone. `Badge` owns the colours. */
const TONE: Record<CheckStatus, 'positive' | 'attention' | 'critical'> = { ok: 'positive', warn: 'attention', fail: 'critical' }

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
        <h2 style={{ fontSize: 'var(--text-title)', fontWeight: 'var(--weight-display)', fontFamily: 'var(--font-display)', color: 'var(--ink-1)' }}>
          Product dashboard
        </h2>
        <Badge tone={source === 'real' ? 'accent' : 'neutral'} dot>
          {source === 'real' ? 'Real catalogue' : 'Mock catalogue'}
        </Badge>
      </div>
      <p style={{ fontSize: 'var(--text-body-sm)', color: 'var(--ink-3)', marginBottom: 'var(--space-4)' }}>
        Browse the catalogue and remove products. Removing hides a product everywhere — the shop, the quiz and the hub.
      </p>

      {error && (
        <div className="mb-3">
          <Card tone="critical" padding="tight">
            <p role="status" style={{ fontSize: 'var(--text-body-sm)', color: 'var(--tone-critical)' }}>
              {error}
            </p>
          </Card>
        </div>
      )}

      <div className="mb-2">
        <Input
          label="Search products"
          compact
          className="w-full"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search products…"
        />
      </div>
      <div className="flex flex-wrap gap-2 mb-4">
        {categories.map((c) => (
          <Button
            key={c}
            size="sm"
            variant={category === c ? 'primary' : 'secondary'}
            aria-pressed={category === c}
            onClick={() => setCategory(c)}
          >
            {c === 'all' ? `All (${rows?.length ?? 0})` : c}
          </Button>
        ))}
      </div>

      {rows === null ? (
        <p style={{ fontSize: 'var(--text-body-sm)', color: 'var(--ink-3)' }}>Loading…</p>
      ) : filtered.length === 0 ? (
        <p style={{ fontSize: 'var(--text-body-sm)', color: 'var(--ink-3)' }}>No products match.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {filtered.map(({ product: p, readiness }) => {
            const flavours = p.variants.map((v) => v.flavour).filter(Boolean) as string[]
            const skus = p.variants.map((v) => v.sku).filter(Boolean) as string[]
            return (
              <Card key={p.id} solid padding="tight" className="flex gap-3">
                <div className="w-16 h-16 rounded-xl flex-shrink-0 overflow-hidden flex items-center justify-center" style={{ background: 'var(--surface-2)', border: '1px solid var(--edge)' }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {p.imageUrl ? <img src={p.imageUrl} alt={p.title} className="w-full h-full object-cover" /> : <span style={{ fontSize: 'var(--text-micro)', color: 'var(--ink-3)' }}>No image</span>}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate" style={{ fontSize: 'var(--text-body-sm)', fontWeight: 'var(--weight-strong)', fontFamily: 'var(--font-display)', color: 'var(--ink-1)' }}>
                        {p.title}
                      </p>
                      <p style={{ fontSize: 'var(--text-meta)', color: 'var(--ink-3)' }}>{p.category}</p>
                    </div>
                    {/* Was a bare coloured dot with a `title` — invisible to a
                        screen reader and to anyone not hovering it. */}
                    <Badge tone={TONE[readiness.overall]} dot>
                      {readiness.overall === 'ok' ? 'Ready' : readiness.overall === 'warn' ? 'Needs a look' : 'Not ready'}
                    </Badge>
                  </div>
                  <p style={{ fontSize: 'var(--text-body-sm)', color: 'var(--ink-1)', marginTop: 'var(--space-1)' }}>{priceLabel(p)}</p>
                  {flavours.length > 0 && (
                    <p className="truncate" style={{ fontSize: 'var(--text-meta)', color: 'var(--ink-3)', marginTop: 'var(--space-1)' }}>
                      {flavours.length} flavour{flavours.length > 1 ? 's' : ''}: {flavours.join(', ')}
                    </p>
                  )}
                  {skus.length > 0 && (
                    <p className="truncate" style={{ fontSize: 'var(--text-meta)', color: 'var(--ink-3)' }}>SKU: {skus.join(', ')}</p>
                  )}

                  {confirmId === p.id ? (
                    <div className="flex gap-2 mt-2">
                      <Button variant="destructive" size="sm" loading={removing === p.id} onClick={() => remove(p.id)}>
                        Confirm remove
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setConfirmId(null)}>
                        Cancel
                      </Button>
                    </div>
                  ) : (
                    <div className="mt-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => { setConfirmId(p.id); setError(null) }}
                        // Named per row: fifteen buttons all called "Remove" is
                        // a list a screen-reader user cannot navigate.
                        aria-label={`Remove ${p.title}`}
                      >
                        Remove
                      </Button>
                    </div>
                  )}
                </div>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
