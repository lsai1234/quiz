'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { Badge, Button, Card, Input, Note } from '@/components/system'
import type { HubMetrics } from '@/lib/hub/metrics'
import type { MemberDealSettings, ServiceSettings } from '@/lib/offer/settings'

/**
 * Settings → Member hub: deal sizes by kind, the top-up box's free-delivery
 * line, what every product's member price comes to at those sizes (after
 * the floor), and the hub's numbers. A size is a ceiling: each deal is the
 * deepest percent up to it that keeps the floor (Pricing → Last-chance offer).
 */

interface View {
  services: ServiceSettings
  memberDeals: MemberDealSettings
  kinds: { kind: string; products: number }[]
  previews: { productId: string; title: string; kind: string; sizePct: number; viable: boolean; line: string; total: number | null; normalTotal: number | null }[]
  metrics: HubMetrics
}

const HEADING = { fontSize: 'var(--text-title)', fontWeight: 'var(--weight-strong)', fontFamily: 'var(--font-display)', color: 'var(--ink-1)' } as const
const META = { fontSize: 'var(--text-meta)', lineHeight: 'var(--leading-snug)', color: 'var(--ink-3)' } as const
const BODY = { fontSize: 'var(--text-body-sm)', lineHeight: 'var(--leading-snug)', color: 'var(--ink-2)' } as const
const money = (n: number | null) => (n == null ? '—' : `£${n.toFixed(2)}`)
const pretty = (kind: string) => kind.replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase())

export function MemberHubSettings() {
  const [view, setView] = useState<View | null>(null)
  const [draft, setDraft] = useState<{ defaultPct: string; freeOver: string; pct: Record<string, string> } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const load = useCallback((v: View) => {
    setView(v)
    setDraft({
      defaultPct: String(Math.round(v.memberDeals.defaultPct * 100)),
      freeOver: String(v.memberDeals.topUpFreeOver),
      pct: Object.fromEntries(v.kinds.map((k) => [k.kind, v.memberDeals.pct[k.kind as keyof MemberDealSettings['pct']] != null ? String(Math.round((v.memberDeals.pct[k.kind as keyof MemberDealSettings['pct']] ?? 0) * 100)) : ''])),
    })
  }, [])

  useEffect(() => {
    fetch('/api/portal/member-hub')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error())))
      .then(load)
      .catch(() => setError('Could not load the member hub settings. Reload the page to try again.'))
  }, [load])

  async function save() {
    if (!draft) return
    setSaving(true)
    setError(null)
    const pct: Record<string, number> = {}
    for (const [k, v] of Object.entries(draft.pct)) if (v.trim() !== '' && Number.isFinite(Number(v))) pct[k] = Number(v) / 100
    try {
      const res = await fetch('/api/portal/member-hub', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memberDeals: { defaultPct: Number(draft.defaultPct) / 100, topUpFreeOver: Number(draft.freeOver), pct } }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error ?? 'save failed')
      load(data as View)
    } catch (err) {
      setError(`That did not save. ${err instanceof Error && err.message !== 'save failed' ? err.message : 'Try again.'}`)
    } finally {
      setSaving(false)
    }
  }

  if (error && !view) return <Note tone="critical" icon="alert-triangle">{error}</Note>
  if (!view || !draft) return <Note tone="neutral" icon="clock">Reading the member hub…</Note>
  const m = view.metrics
  const viable = view.previews.filter((p) => p.viable).length

  return (
    <div style={{ display: 'grid', gap: 'var(--space-6)' }} data-member-hub-settings>
      {error && (
        <Note tone="critical" icon="alert-triangle" live="assertive">
          {error}
        </Note>
      )}

      <Card elevation={1}>
        <div style={{ display: 'grid', gap: 'var(--space-4)' }}>
          <h2 style={HEADING}>How the hub is doing</h2>
          <div className="grid grid-cols-2" style={{ gap: 'var(--space-4)' }}>
            {[
              ['Open hubs', String(m.openHubs), 'Ordered in the last 90 days, or on a plan'],
              ['Used it this week', String(m.activeThisWeek), 'Opened their hub in the last 7 days'],
              ['Deals used, 30 days', String(m.dealsUsed30), `${money(m.dealOrdersValue30)} of orders`],
              ['Given in deals, 30 days', money(m.dealSavings30), 'Against the ordinary checkout, delivered'],
              ['Full-price reorders, 30 days', String(m.fullPriceReorders30), 'Members buying again without a deal'],
              ['Deal emails, 30 days', String(m.dealEmailsSent30), 'A member price opened'],
              ['Training plans', String(m.trainingPlans), `${m.trainingActiveThisWeek} trained this week`],
            ].map(([label, value, note]) => (
              <div key={label}>
                <p style={META}>{label}</p>
                <p style={{ ...HEADING, fontSize: 'var(--text-display)', fontVariantNumeric: 'tabular-nums' }}>{value}</p>
                <p style={META}>{note}</p>
              </div>
            ))}
          </div>
          <p style={META}>
            Deals pay when they replace a full-price order somewhere else, not one we’d have had anyway: watch deals used against full-price reorders, and size by
            kind below.
          </p>
        </div>
      </Card>

      <Card elevation={1}>
        <div style={{ display: 'grid', gap: 'var(--space-4)' }}>
          <div className="flex flex-wrap items-center" style={{ gap: 'var(--space-3)' }}>
            <h2 style={HEADING}>Member deal sizes</h2>
            <Badge tone={view.services.deals ? 'positive' : 'neutral'} dot>
              {view.services.deals ? 'On' : 'Off'}
            </Badge>
          </div>
          <p style={BODY}>
            The deepest percent off each kind may take. Each deal is still worked out product by product: free delivery first, then the deepest whole percent
            up to this that keeps your floor (<Link href="/founderhub/pricing" style={{ textDecoration: 'underline' }}>Pricing → Last-chance offer</Link>). Blank
            uses the default. The switch is in{' '}
            <Link href="/founderhub/settings/offer" style={{ textDecoration: 'underline' }}>
              Offer → Box services
            </Link>
            .
          </p>
          <div className="grid grid-cols-2" style={{ gap: 'var(--space-3)' }}>
            <Input label="Default size" suffix="%" type="number" inputMode="numeric" min={0} max={50} value={draft.defaultPct} onChange={(e) => setDraft({ ...draft, defaultPct: e.target.value })} />
            <Input label="Top-up box ships free from" prefix="£" type="number" inputMode="decimal" min={0} value={draft.freeOver} onChange={(e) => setDraft({ ...draft, freeOver: e.target.value })} />
          </div>
          <div className="grid grid-cols-2" style={{ gap: 'var(--space-3)' }}>
            {view.kinds.map((k) => (
              <Input
                key={k.kind}
                label={`${pretty(k.kind)} (${k.products})`}
                suffix="%"
                type="number"
                inputMode="numeric"
                min={0}
                max={50}
                placeholder={draft.defaultPct}
                value={draft.pct[k.kind] ?? ''}
                onChange={(e) => setDraft({ ...draft, pct: { ...draft.pct, [k.kind]: e.target.value } })}
              />
            ))}
          </div>
          <div>
            <Button variant="primary" loading={saving} onClick={save}>
              Save sizes
            </Button>
          </div>
        </div>
      </Card>

      <Card elevation={1}>
        <div style={{ display: 'grid', gap: 'var(--space-3)' }}>
          <h2 style={HEADING}>What each product gets</h2>
          <p style={META}>
            At the sizes above, after the floor, on its own. {viable} of {view.previews.length} products have a member price; the rest wouldn’t keep the floor
            alone, but can still be cheaper in a top-up box.
          </p>
          <ul style={{ display: 'grid', gap: 'var(--space-2)' }}>
            {view.previews.map((p) => (
              <li key={p.productId} className="flex items-baseline justify-between" style={{ gap: 'var(--space-3)' }} data-deal-preview={p.productId}>
                <span style={{ ...BODY, color: 'var(--ink-1)', minWidth: 0 }}>
                  {p.title}
                  <span style={META}>{` · up to ${p.sizePct}%`}</span>
                </span>
                <span style={{ ...META, textAlign: 'right', color: p.viable ? 'var(--ink-2)' : 'var(--ink-3)' }}>
                  {p.line}
                  {p.viable ? ` · ${money(p.total)} (was ${money(p.normalTotal)})` : ''}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </Card>
    </div>
  )
}
