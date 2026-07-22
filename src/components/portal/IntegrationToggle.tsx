'use client'

import { useEffect, useState } from 'react'

const ACCENT = '#00D4FF'

export interface IntegrationOption {
  mode: string
  label: string
  desc: string
}

interface Props {
  /** GET/POST endpoint returning { mode, effective, hasCredentials }. */
  endpoint: string
  options: IntegrationOption[]
  /** Label shown for the live (non-mock) effective state, e.g. "Live PowerBody". */
  liveLabel: string
  /** Guidance shown when a live mode is chosen but credentials are missing. */
  credentialsHint: React.ReactNode
}

interface State {
  mode: string
  effective: string
  hasCredentials: boolean
}

/**
 * Generic mock ↔ live source toggle for the Founders Hub, shared by the
 * supplier (PowerBody) and payments (Stripe) integrations. Mirrors the
 * data-source toggle: the persisted choice is stored server-side and the app
 * resolves the effective source from it plus whether credentials are present.
 */
export function IntegrationToggle({ endpoint, options, liveLabel, credentialsHint }: Props) {
  const [data, setData] = useState<State | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetch(endpoint).then((r) => (r.ok ? r.json() : null)).then((d) => d && setData(d)).catch(() => {})
  }, [endpoint])

  async function choose(mode: string) {
    setSaving(true)
    const res = await fetch(endpoint, {
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

  const live = data.effective !== 'mock'
  const wantsLiveButMock = data.mode !== 'mock' && !live

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        {options.map((o) => {
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

      <div className="text-xs rounded-xl p-3.5 space-y-1.5" style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border)' }}>
        <p className="text-[var(--color-text-2)]">
          Now using: <strong style={{ color: live ? ACCENT : 'var(--color-text)' }}>{live ? liveLabel : 'Mock'}</strong>
        </p>
        {wantsLiveButMock ? (
          <p className="text-[var(--color-red)] leading-relaxed pt-1">{credentialsHint}</p>
        ) : (
          <p className="text-[var(--color-muted)] pt-1">Applies on the next request — no redeploy needed.</p>
        )}
      </div>
    </div>
  )
}
