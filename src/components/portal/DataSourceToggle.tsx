'use client'

import { useCallback, useEffect, useState } from 'react'
import { setDataSourceOverride } from '@/lib/data-source'
import { invalidateCatalogue } from '@/hooks/useCatalogueProducts'

const ACCENT = '#00D4FF'
const OPTIONS: { mode: 'mock' | 'auto' | 'shopify'; label: string; desc: string }[] = [
  { mode: 'mock', label: 'Mock data', desc: 'Always use the local catalogue. Best while building.' },
  { mode: 'auto', label: 'Auto', desc: 'Use Shopify when credentials exist, otherwise mock.' },
  { mode: 'shopify', label: 'Live Shopify', desc: 'Always use Shopify. Falls back to mock if no credentials.' },
]

export function DataSourceToggle() {
  const [data, setData] = useState<{ mode: string; effective: string; hasCredentials: boolean } | null>(null)
  const [sample, setSample] = useState<{ source: string; count: number; titles: string[]; error?: string } | null>(null)
  const [saving, setSaving] = useState(false)

  const loadSample = useCallback(() => {
    fetch('/api/portal/products')
      .then((r) => r.json())
      .then((d) => setSample({ source: d.source, count: d.products?.length ?? 0, error: d.error, titles: (d.products ?? []).slice(0, 3).map((p: { product: { title: string } }) => p.product.title) }))
      .catch(() => {})
  }, [])

  useEffect(() => {
    fetch('/api/portal/data-source').then((r) => r.json()).then(setData).catch(() => {})
    loadSample()
  }, [loadSample])

  async function choose(mode: string) {
    setSaving(true)
    const res = await fetch('/api/portal/data-source', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode }) })
    if (res.ok) {
      const updated = await res.json()
      setData((d) => ({ hasCredentials: d?.hasCredentials ?? false, ...updated }))
      // Sync the client + clear the cached catalogue so the quiz/hub/subscription
      // pick up the new source on their next mount (no hard reload needed).
      setDataSourceOverride(mode as 'auto' | 'mock' | 'shopify')
      invalidateCatalogue()
      loadSample()
    }
    setSaving(false)
  }

  if (!data) return <p className="text-sm text-[var(--color-muted)]">Loading…</p>

  const wantsShopifyButMock = data.mode !== 'mock' && data.effective !== 'shopify'

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        {OPTIONS.map((o) => {
          const active = data.mode === o.mode
          return (
            <button key={o.mode} onClick={() => choose(o.mode)} disabled={saving}
              className="w-full text-left rounded-2xl border p-4 transition-all active:scale-[0.99]"
              style={{ background: active ? `color-mix(in srgb, ${ACCENT} 8%, transparent)` : 'var(--color-surface)', borderColor: active ? `color-mix(in srgb, ${ACCENT} 40%, transparent)` : 'var(--color-border)' }}>
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-[var(--color-text)]" style={{ fontFamily: 'var(--font-display)' }}>{o.label}</span>
                {active && <span className="text-[10px] font-bold uppercase" style={{ color: ACCENT }}>Selected</span>}
              </div>
              <p className="text-xs text-[var(--color-muted)] mt-0.5">{o.desc}</p>
            </button>
          )
        })}
      </div>

      {/* What's actually being served */}
      <div className="text-xs rounded-xl p-3.5 space-y-1.5" style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border)' }}>
        <p className="text-[var(--color-text-2)]">
          Now serving: <strong style={{ color: data.effective === 'shopify' ? ACCENT : 'var(--color-text)' }}>{data.effective === 'shopify' ? 'Live Shopify' : 'Mock data'}</strong>
        </p>
        {sample && (
          <p className="text-[var(--color-muted)]">
            {sample.count} products{sample.titles.length ? ` — e.g. ${sample.titles.join(', ')}` : ''}.
          </p>
        )}
        {wantsShopifyButMock ? (
          <p className="text-[var(--color-red)] leading-relaxed pt-1">
            <strong>Can’t switch to Shopify yet.</strong>{' '}
            {sample?.error
              ? `Shopify connection failed: ${sample.error}`
              : !data.hasCredentials
                ? <>No Storefront credentials are set. Add <code>NEXT_PUBLIC_SHOPIFY_STORE_DOMAIN</code> and <code>NEXT_PUBLIC_SHOPIFY_STOREFRONT_TOKEN</code>, then seed tags via <code>scripts/seed-shopify-tags.mjs</code>.</>
                : 'Still serving mock.'}
          </p>
        ) : (
          <p className="text-[var(--color-muted)] pt-1">The quiz, hub and subscriptions use this on their next page load.</p>
        )}
      </div>
    </div>
  )
}
