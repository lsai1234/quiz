'use client'

import { useEffect, useState } from 'react'


interface State {
  mode: 'simulate' | 'live'
  effective: 'simulate' | 'live'
  blockedReason: string | null
}

const OPTIONS = [
  {
    mode: 'simulate' as const,
    label: 'Simulate orders',
    desc: 'Pressing Send walks the order through the whole flow and writes the audit trail, but nothing reaches PowerBody and nothing ships.',
  },
  {
    mode: 'live' as const,
    label: 'Send orders to PowerBody',
    desc: 'Pressing Send places a real dropship order. Stock is committed and the parcel goes to the customer.',
  },
]

/**
 * The simulate ↔ live switch for sending orders.
 *
 * Kept separate from the supplier source toggle, and styled more loudly than
 * it, because the two settings carry very different consequences: getting the
 * catalogue source wrong shows the wrong prices, while getting this wrong ships
 * a parcel. Turning it on asks for a confirmation; turning it off never does.
 */
export function OrderSendingToggle() {
  const [data, setData] = useState<State | null>(null)
  const [saving, setSaving] = useState(false)
  const [confirming, setConfirming] = useState(false)

  useEffect(() => {
    fetch('/api/portal/ordering-mode')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setData(d))
      .catch(() => {})
  }, [])

  async function choose(mode: 'simulate' | 'live') {
    setSaving(true)
    try {
      const res = await fetch('/api/portal/ordering-mode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode }),
      })
      if (res.ok) setData(await res.json())
    } finally {
      setSaving(false)
      setConfirming(false)
    }
  }

  if (!data) return <p className="text-sm text-[var(--ink-3)]">Loading…</p>

  const isLive = data.effective === 'live'
  const wantsLiveButSimulating = data.mode === 'live' && !isLive

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        {OPTIONS.map((o) => {
          const active = data.mode === o.mode
          const danger = o.mode === 'live'
          const tint = danger ? 'var(--tone-attention)' : 'var(--tone-positive)'
          return (
            <button
              key={o.mode}
              onClick={() => (o.mode === 'live' && !active ? setConfirming(true) : choose(o.mode))}
              disabled={saving}
              className="w-full text-left rounded-2xl border p-4 transition-all active:scale-[0.99] disabled:opacity-50"
              style={{
                background: active ? `color-mix(in srgb, ${tint} 10%, transparent)` : 'var(--surface-1)',
                borderColor: active ? `color-mix(in srgb, ${tint} 45%, transparent)` : 'var(--edge)',
              }}
            >
              <div className="flex items-center justify-between gap-2">
                <span
                  className="text-sm font-bold text-[var(--ink-1)]"
                  style={{ fontFamily: 'var(--font-display)' }}
                >
                  {o.label}
                </span>
                {active && (
                  <span className="text-[10px] font-bold uppercase whitespace-nowrap" style={{ color: tint }}>
                    Selected
                  </span>
                )}
              </div>
              <p className="text-xs text-[var(--ink-3)] mt-0.5 leading-relaxed">{o.desc}</p>
            </button>
          )
        })}
      </div>

      {confirming && (
        <div
          className="text-xs rounded-xl p-3.5 space-y-2.5"
          style={{
            background: `var(--attention-fill)`,
            border: `1px solid color-mix(in srgb, var(--tone-attention) 45%, transparent)`,
          }}
        >
          <p style={{ color: 'var(--tone-attention)' }} className="leading-relaxed">
            <strong>This arms real ordering.</strong> From now on, Send in the fulfilment queue places a genuine
            dropship order with PowerBody — stock is committed, you are invoiced, and a parcel goes to the customer.
            Orders already sent as simulations are unaffected.
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => choose('live')}
              disabled={saving}
              className="text-xs font-bold px-3 py-2 rounded-xl border disabled:opacity-40"
              style={{ background: 'var(--tone-attention)', borderColor: 'var(--tone-attention)', color: 'var(--ink-on-accent)' }}
            >
              {saving ? 'Switching…' : 'Yes, send real orders'}
            </button>
            <button
              onClick={() => setConfirming(false)}
              disabled={saving}
              className="text-xs font-bold px-3 py-2 rounded-xl border disabled:opacity-40"
              style={{ borderColor: 'var(--edge)', color: 'var(--ink-2)' }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div
        className="text-xs rounded-xl p-3.5 space-y-1.5"
        style={{ background: 'var(--surface-2)', border: '1px solid var(--edge)' }}
      >
        <p className="text-[var(--ink-2)]">
          Send will:{' '}
          <strong style={{ color: isLive ? 'var(--tone-attention)' : 'var(--tone-positive)' }}>
            {isLive ? 'place real orders with PowerBody' : 'simulate only — nothing ships'}
          </strong>
        </p>
        {wantsLiveButSimulating ? (
          <p style={{ color: 'var(--tone-critical)' }} className="leading-relaxed pt-1">
            <strong>Set to live, but still simulating.</strong> {data.blockedReason}
          </p>
        ) : (
          <p className="text-[var(--ink-3)] pt-1">
            Applies on the next send — no redeploy needed. Pulling products and stock is unaffected by this setting.
          </p>
        )}
      </div>
    </div>
  )
}

/** Shown above the fulfilment queue so the mode is visible at the moment of the
 *  click, not only in Settings. */
export function OrderingModeBanner({ ordering }: { ordering: 'simulate' | 'live' | undefined }) {
  if (!ordering) return null
  const live = ordering === 'live'
  const colour = live ? 'var(--tone-attention)' : 'var(--accent)'
  return (
    <p
      className="text-xs rounded-xl px-3 py-2 leading-relaxed"
      style={{
        background: `color-mix(in srgb, ${colour} 10%, transparent)`,
        border: `1px solid color-mix(in srgb, ${colour} 35%, transparent)`,
        color: colour,
      }}
    >
      {live ? (
        <>
          <strong>Live ordering is on.</strong> Send places a real dropship order with PowerBody and a parcel goes out.
        </>
      ) : (
        <>
          <strong>Simulation mode.</strong> Send moves orders through the flow but nothing reaches PowerBody and
          nothing ships. Change this in Settings → Order sending.
        </>
      )}
    </p>
  )
}
