'use client'

import { useEffect, useState } from 'react'
import { Badge, Button, Card } from '@/components/system'


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

  if (!data) return <p style={{ fontSize: 'var(--text-body-sm)', color: 'var(--ink-3)' }}>Loading…</p>

  const isLive = data.effective === 'live'
  const wantsLiveButSimulating = data.mode === 'live' && !isLive

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        {OPTIONS.map((o) => {
          const active = data.mode === o.mode
          const tone = o.mode === 'live' ? 'attention' : 'positive'
          return (
            // The card carries the tint; the button inside it is the target, so
            // the whole row is pressable rather than just the words.
            <Card key={o.mode} padding="none" tone={active ? tone : undefined}>
              <Button
                variant="ghost"
                fullWidth
                className="text-left justify-between items-start"
                // `aria-pressed`, because these are a choice with one selected —
                // it was a coloured border and the word "Selected", neither of
                // which a screen reader reports as state.
                aria-pressed={active}
                loading={saving}
                onClick={() => (o.mode === 'live' && !active ? setConfirming(true) : choose(o.mode))}
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
                {active && <Badge tone={tone}>Selected</Badge>}
              </Button>
            </Card>
          )
        })}
      </div>

      {confirming && (
        <Card tone="attention" padding="tight" className="space-y-2.5">
          <p style={{ fontSize: 'var(--text-body-sm)', lineHeight: 'var(--leading-loose)', color: 'var(--tone-attention)' }}>
            <strong>This arms real ordering.</strong> From now on, Send in the fulfilment queue places a genuine
            dropship order with PowerBody — stock is committed, you are invoiced, and a parcel goes to the customer.
            Orders already sent as simulations are unaffected.
          </p>
          <div className="flex gap-2">
            <Button variant="destructive" size="sm" loading={saving} onClick={() => choose('live')}>
              Yes, send real orders
            </Button>
            <Button size="sm" disabled={saving} onClick={() => setConfirming(false)}>
              Cancel
            </Button>
          </div>
        </Card>
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
