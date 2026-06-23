'use client'

import { useEffect, useState } from 'react'

const ACCENT = '#00D4FF'
const OPTIONS: { mode: 'mock' | 'auto' | 'shopify'; label: string; desc: string }[] = [
  { mode: 'mock', label: 'Mock data', desc: 'Always use the local catalogue. Best while building.' },
  { mode: 'auto', label: 'Auto', desc: 'Use Shopify when credentials exist, otherwise mock.' },
  { mode: 'shopify', label: 'Live Shopify', desc: 'Always use Shopify. Falls back to mock if no credentials.' },
]

export function DataSourceToggle() {
  const [data, setData] = useState<{ mode: string; effective: string; hasCredentials: boolean } | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetch('/api/portal/data-source').then((r) => r.json()).then(setData).catch(() => {})
  }, [])

  async function choose(mode: string) {
    setSaving(true)
    const res = await fetch('/api/portal/data-source', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode }),
    })
    if (res.ok) {
      const updated = await res.json()
      setData((d) => ({ hasCredentials: d?.hasCredentials ?? false, ...updated }))
    }
    setSaving(false)
  }

  if (!data) return <p className="text-sm text-[var(--color-muted)]">Loading…</p>

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
              className="w-full text-left rounded-2xl border p-4 transition-all active:scale-[0.99]"
              style={{
                background: active ? `color-mix(in srgb, ${ACCENT} 8%, transparent)` : 'var(--color-surface)',
                borderColor: active ? `color-mix(in srgb, ${ACCENT} 40%, transparent)` : 'var(--color-border)',
              }}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-[var(--color-text)]" style={{ fontFamily: 'var(--font-display)' }}>{o.label}</span>
                {active && <span className="text-[10px] font-bold uppercase" style={{ color: ACCENT }}>Selected</span>}
              </div>
              <p className="text-xs text-[var(--color-muted)] mt-0.5">{o.desc}</p>
            </button>
          )
        })}
      </div>

      <div className="text-xs text-[var(--color-text-2)] rounded-xl p-3" style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border)' }}>
        Currently serving: <strong style={{ color: data.effective === 'shopify' ? ACCENT : 'var(--color-text)' }}>{data.effective === 'shopify' ? 'Live Shopify' : 'Mock data'}</strong>
        {' · '}credentials {data.hasCredentials ? 'present' : 'not set'}.
        {data.mode === 'shopify' && !data.hasCredentials && (
          <span className="block mt-1 text-[var(--color-red)]">Shopify selected but no credentials — still serving mock. Add NEXT_PUBLIC_SHOPIFY_* to go live.</span>
        )}
      </div>
    </div>
  )
}
