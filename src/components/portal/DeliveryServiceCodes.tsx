'use client'

import { useEffect, useState } from 'react'
import { Badge, Button, Input, Note } from '@/components/system'
import type { CarrierCode, TransportCodes } from '@/lib/supplier/transport'
import type { DeliveryCarrier } from '@/lib/stack-blueprint/pricing'

type State = TransportCodes & { source: string; error?: string }

const ROWS: { carrier: DeliveryCarrier; label: string; when: string }[] = [
  { carrier: 'royal-mail', label: 'Royal Mail Tracked 48', when: 'Parcels up to 7 kg: almost every order.' },
  { carrier: 'dpd', label: 'DPD Two Day', when: 'Parcels over 7 kg.' },
]

const META = { fontSize: 'var(--text-meta)', lineHeight: 'var(--leading-snug)', color: 'var(--ink-3)' } as const

/**
 * Settings → Supplier → Delivery services: the code each order asks PowerBody
 * for. Read off the account when the supplier is live; a founder can choose one.
 */
export function DeliveryServiceCodes() {
  const [state, setState] = useState<State | null>(null)
  const [drafts, setDrafts] = useState<Partial<Record<DeliveryCarrier, string>>>({})
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    fetch('/api/portal/supplier/shipping-methods', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: State | null) => d && setState(d))
      .catch(() => {})
  }, [])

  async function save(carrier: DeliveryCarrier, code: string) {
    setBusy(true)
    const res = await fetch('/api/portal/supplier/shipping-methods', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ carrier, code }),
    }).catch(() => null)
    if (res?.ok) {
      setState((await res.json()) as State)
      setDrafts((d) => ({ ...d, [carrier]: undefined }))
    }
    setBusy(false)
  }

  if (!state) return <p style={META}>Loading the delivery services…</p>

  return (
    <div style={{ display: 'grid', gap: 'var(--space-3)' }} data-delivery-codes>
      {ROWS.map((row) => {
        const current: CarrierCode = state.codes[row.carrier]
        const draft = drafts[row.carrier] ?? current.code ?? ''
        return (
          <div key={row.carrier} style={{ display: 'grid', gap: 'var(--space-1)' }} data-delivery-code={row.carrier}>
            <div className="flex flex-wrap items-center" style={{ gap: 'var(--space-2)' }}>
              <span style={{ color: 'var(--ink-1)', fontSize: 'var(--text-body)', fontWeight: 'var(--weight-strong)' }}>{row.label}</span>
              <Badge tone={current.code ? 'positive' : 'attention'} dot>
                {current.code ? (current.source === 'set' ? 'Chosen here' : 'Read from PowerBody') : 'No code yet'}
              </Badge>
            </div>
            <p style={META}>{row.when}</p>
            <div className="flex flex-wrap items-end" style={{ gap: 'var(--space-2)' }}>
              <Input
                label={`PowerBody code for ${row.label}`}
                hideLabel
                compact
                className="w-48"
                value={draft}
                placeholder="Code"
                list={`delivery-methods-${row.carrier}`}
                onChange={(e) => setDrafts((d) => ({ ...d, [row.carrier]: e.target.value }))}
              />
              <datalist id={`delivery-methods-${row.carrier}`}>
                {state.methods.map((m) => (
                  <option key={m.code} value={m.code}>
                    {m.name}
                  </option>
                ))}
              </datalist>
              <Button size="sm" variant="secondary" disabled={busy || draft === (current.code ?? '')} onClick={() => void save(row.carrier, draft)}>
                Save
              </Button>
              {current.source === 'set' && (
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => void save(row.carrier, '')}>
                  Use PowerBody&apos;s
                </Button>
              )}
            </div>
          </div>
        )
      })}
      {state.methods.length > 0 && (
        <p style={META}>
          On the account: {state.methods.map((m) => `${m.name} (${m.code})`).join(' · ')}
        </p>
      )}
      {state.error && (
        <Note tone="attention" icon="alert-triangle">
          PowerBody didn&apos;t list the services: {state.error}. Until a code is set, orders go with it empty and PowerBody choose.
        </Note>
      )}
      {state.source !== 'powerbody' && (
        <p style={META}>The supplier is set to the sample feed, so there is no account to read the codes from. Switch to Live PowerBody above, or set them here.</p>
      )}
    </div>
  )
}
