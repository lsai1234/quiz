'use client'

import { useCallback, useEffect, useState } from 'react'
import { setDataSourceOverride, type DataSourceMode } from '@/lib/data-source'
import { invalidateCatalogue } from '@/hooks/useCatalogueProducts'

const ACCENT = '#00D4FF'
const AMBER = '#fbbf24'

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

  if (!data) return <p className="text-sm text-[var(--color-muted)]">Loading…</p>

  const isReal = data.effective === 'real'
  const realButEmpty = isReal && data.importedCount === 0

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        {OPTIONS.map((o) => {
          const active = data.mode === o.mode
          return (
            <button
              key={o.mode}
              onClick={() => choose(o.mode)}
              disabled={saving}
              className="w-full text-left rounded-2xl border p-4 transition-all active:scale-[0.99] disabled:opacity-50"
              style={{
                background: active ? `color-mix(in srgb, ${ACCENT} 8%, transparent)` : 'var(--color-surface)',
                borderColor: active ? `color-mix(in srgb, ${ACCENT} 40%, transparent)` : 'var(--color-border)',
              }}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-bold text-[var(--color-text)]" style={{ fontFamily: 'var(--font-display)' }}>
                  {o.label}
                </span>
                {active && (
                  <span className="text-[10px] font-bold uppercase whitespace-nowrap" style={{ color: ACCENT }}>
                    Selected
                  </span>
                )}
              </div>
              <p className="text-xs text-[var(--color-muted)] mt-0.5 leading-relaxed">{o.desc}</p>
            </button>
          )
        })}
      </div>

      {/* What's actually being served */}
      <div
        className="text-xs rounded-xl p-3.5 space-y-1.5"
        style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border)' }}
      >
        <p className="text-[var(--color-text-2)]">
          Now serving:{' '}
          <strong style={{ color: isReal ? ACCENT : 'var(--color-text)' }}>
            {isReal ? 'Real catalogue' : 'Mock catalogue'}
          </strong>
        </p>
        {sample && (
          <p className="text-[var(--color-muted)]">
            {sample.count} product{sample.count === 1 ? '' : 's'}
            {sample.titles.length ? ` — e.g. ${sample.titles.join(', ')}` : ''}.
          </p>
        )}
        {realButEmpty ? (
          <p style={{ color: AMBER }} className="leading-relaxed pt-1">
            <strong>Nothing added yet, so the shop is empty.</strong> Go to Products → PowerBody and add the products
            you want to sell. They appear here as soon as you do.
          </p>
        ) : (
          <p className="text-[var(--color-muted)] pt-1">The quiz, hub and subscriptions use this on their next page load.</p>
        )}
      </div>
    </div>
  )
}
