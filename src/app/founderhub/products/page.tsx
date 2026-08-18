'use client'

import { useEffect, useMemo, useState } from 'react'
import { ProductEditor } from '@/components/portal/ProductEditor'
import { AiSuggestPanel } from '@/components/portal/AiSuggestPanel'
import type { CatalogueProduct } from '@/lib/catalogue/types'
import type { ProductReadiness, CheckStatus } from '@/lib/portal/readiness'
import { Badge, Button, Card, Input } from '@/components/system'

/** Readiness status → the system's semantic tone. `Badge` owns the colours. */
const TONE: Record<CheckStatus, 'positive' | 'attention' | 'critical'> = { ok: 'positive', warn: 'attention', fail: 'critical' }

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
        <h2 style={{ fontSize: 'var(--text-title)', fontWeight: 'var(--weight-display)', fontFamily: 'var(--font-display)', color: 'var(--ink-1)' }}>
          Catalogue
        </h2>
        <Button
          variant="primary"
          size="sm"
          icon="sparkle"
          onClick={() => setShowAi(true)}
          disabled={notReady === 0}
          title={notReady === 0 ? 'Everything is already tagged' : `Get AI tag suggestions for ${notReady} product(s)`}
        >
          {`Suggest tags${notReady ? ` (${notReady})` : ''}`}
        </Button>
      </div>

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
      {/* Filters, not tabs: they narrow one list rather than switching between
          panels, so `aria-pressed` is the state that fits. */}
      <div className="flex flex-wrap gap-2 mb-4">
        {(['all', 'attention', 'sub'] as const).map((f) => (
          <Button
            key={f}
            size="sm"
            variant={filter === f ? 'primary' : 'secondary'}
            aria-pressed={filter === f}
            onClick={() => setFilter(f)}
          >
            {f === 'all' ? `All (${rows?.length ?? 0})` : f === 'attention' ? `Needs attention (${notReady})` : 'Subscription'}
          </Button>
        ))}
      </div>

      {rows === null ? (
        <p style={{ fontSize: 'var(--text-body-sm)', color: 'var(--ink-3)' }}>Loading…</p>
      ) : (
        <ul className="space-y-2">
          {filtered.map(({ product, readiness }) => (
            // `solid`: a catalogue is long and this is a scrolling list, which
            // is the case translucency is not paid for.
            <Card as="li" key={product.id} solid interactive padding="none">
              {/* The whole row is the control — `padding="none"` on the card and
                  a full-width button inside it, so the tap target is the card
                  rather than the words in the middle of it. */}
              <Button
                variant="ghost"
                fullWidth
                onClick={() => setEditing(product)}
                className="justify-between text-left"
                iconRight="chevron-right"
              >
                <span className="min-w-0">
                  <span className="flex items-center gap-2">
                    <span
                      className="truncate"
                      style={{ fontSize: 'var(--text-body-sm)', fontFamily: 'var(--font-display)', color: 'var(--ink-1)' }}
                    >
                      {product.title}
                    </span>
                    {/* Only when it is not fine. A green dot on every row in a
                        catalogue tells you nothing about which one to open. */}
                    {readiness.overall !== 'ok' && (
                      <Badge tone={TONE[readiness.overall]} dot>
                        {readiness.overall === 'fail' ? 'Not ready' : 'Needs a look'}
                      </Badge>
                    )}
                  </span>
                  <span
                    className="block"
                    style={{ fontSize: 'var(--text-meta)', fontWeight: 'var(--weight-body)', color: 'var(--ink-3)', marginTop: 'var(--space-1)' }}
                  >
                    {product.category} · {product.subscriptionEligible ? 'subscribable' : 'one-off'} · {product.servings}d
                    {product.cost == null && ' · no cost set'}
                  </span>
                </span>
              </Button>
            </Card>
          ))}
          {filtered.length === 0 && (
            <p className="text-center" style={{ fontSize: 'var(--text-body-sm)', color: 'var(--ink-3)', padding: 'var(--space-8) 0' }}>
              No products match.
            </p>
          )}
        </ul>
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
