'use client'

import { useCallback, useEffect, useState } from 'react'
import { setDataSourceOverride, type DataSourceMode } from '@/lib/data-source'
import { invalidateCatalogue } from '@/hooks/useCatalogueProducts'
import { Badge, Button, Card } from '@/components/system'


const OPTIONS: { mode: DataSourceMode; label: string; desc: string }[] = [
  {
    mode: 'mock',
    label: 'Mock catalogue',
    desc: 'The built-in sample products, plus anything added from PowerBody. Best while building — every journey works without adding a thing.',
  },
  {
    mode: 'real',
    label: 'Real catalogue',
    desc: 'Only the products added from the PowerBody feed. This is the shop you actually sell.',
  },
]

interface State {
  mode: DataSourceMode
  effective: DataSourceMode
  importedCount: number
}

/**
 * Which catalogue the shop serves: the sample one, or the real one curated from
 * PowerBody.
 *
 * Unlike the supplier and payment toggles there are no credentials involved, so
 * this cannot silently fall back — what it says is what is being served. The one
 * thing that can surprise you is choosing "real" before adding any products,
 * which empties the shop; that is called out rather than left to be discovered.
 */
export function DataSourceToggle() {
  const [data, setData] = useState<State | null>(null)
  const [sample, setSample] = useState<{ source: string; count: number; titles: string[]; error?: string } | null>(null)
  const [saving, setSaving] = useState(false)

  const loadSample = useCallback(() => {
    fetch('/api/portal/products')
      .then((r) => r.json())
      .then((d) =>
        setSample({
          source: d.source,
          count: d.products?.length ?? 0,
          error: d.error,
          titles: (d.products ?? []).slice(0, 3).map((p: { product: { title: string } }) => p.product.title),
        }),
      )
      .catch(() => {})
  }, [])

  useEffect(() => {
    fetch('/api/portal/data-source').then((r) => r.json()).then(setData).catch(() => {})
    loadSample()
  }, [loadSample])

  async function choose(mode: DataSourceMode) {
    setSaving(true)
    try {
      const res = await fetch('/api/portal/data-source', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode }),
      })
      if (res.ok) {
        setData(await res.json())
        // Sync the client + clear the cached catalogue so the quiz/hub/subscription
        // pick up the new source on their next mount (no hard reload needed).
        setDataSourceOverride(mode)
        invalidateCatalogue()
        loadSample()
      }
    } finally {
      setSaving(false)
    }
  }

  if (!data) return <p className="text-sm text-[var(--ink-3)]">Loading…</p>

  const isReal = data.effective === 'real'
  const realButEmpty = isReal && data.importedCount === 0

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        {OPTIONS.map((o) => {
          const active = data.mode === o.mode
          return (
            // The card carries the tint, the button inside it is the target:
            // the whole row is pressable rather than the words in it.
            <Card key={o.mode} padding="none" tone={active ? 'accent' : undefined}>
            <Button
              variant="ghost"
              fullWidth
              className="text-left justify-between items-start"
              // These are a choice with one selected. It was a coloured border
              // and the word "Selected" — neither is state a screen reader gets.
              aria-pressed={active}
              loading={saving}
              onClick={() => choose(o.mode)}
            >
              <span className="min-w-0">
                <span className="block" style={{ fontSize: 'var(--text-body-sm)', fontFamily: 'var(--font-display)', color: 'var(--ink-1)' }}>
                  {o.label}
                </span>
                <span
                  className="block"
                  style={{ fontSize: 'var(--text-body-sm)', fontWeight: 'var(--weight-body)', lineHeight: 'var(--leading-loose)', color: 'var(--ink-3)', marginTop: 'var(--space-1)' }}
                >
                  {o.desc}
                </span>
              </span>
              {active && <Badge tone="accent">Selected</Badge>}
            </Button>
            </Card>
          )
        })}
      </div>

      {/* What's actually being served */}
      <div
        className="text-xs rounded-xl p-3.5 space-y-1.5"
        style={{ background: 'var(--surface-2)', border: '1px solid var(--edge)' }}
      >
        <p className="text-[var(--ink-2)]">
          Now serving:{' '}
          <strong style={{ color: isReal ? 'var(--accent)' : 'var(--ink-1)' }}>
            {isReal ? 'Real catalogue' : 'Mock catalogue'}
          </strong>
        </p>
        {sample && (
          <p className="text-[var(--ink-3)]">
            {sample.count} product{sample.count === 1 ? '' : 's'}
            {sample.titles.length ? ` — e.g. ${sample.titles.join(', ')}` : ''}.
          </p>
        )}
        {realButEmpty ? (
          <p style={{ color: 'var(--tone-attention)' }} className="leading-relaxed pt-1">
            <strong>Nothing added yet, so the shop is empty.</strong> Go to Products → PowerBody and add the products
            you want to sell. They appear here as soon as you do.
          </p>
        ) : (
          <p className="text-[var(--ink-3)] pt-1">The quiz, hub and subscriptions use this on their next page load.</p>
        )}
      </div>
    </div>
  )
}
