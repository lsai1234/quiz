'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { Badge, Button, Card, Checkbox, Input, Note } from '@/components/system'
import type { HubMetrics } from '@/lib/hub/metrics'
import type { Share, TrainingMeasures } from '@/lib/training/measures'
import type { HubPriceSettings, MemberDealSettings, ServiceSettings } from '@/lib/offer/settings'

/**
 * Settings → Member hub: deal sizes by kind, the top-up box's free-delivery
 * line, what every product's member price comes to at those sizes (after
 * the floor), and the hub's numbers. A size is a ceiling: each deal is the
 * deepest percent up to it that keeps the floor (Pricing → Last-chance offer).
 */

interface View {
  services: ServiceSettings
  memberDeals: MemberDealSettings
  hubPrice: HubPriceSettings
  kinds: { kind: string; products: number }[]
  previews: { productId: string; title: string; kind: string; sizePct: number; viable: boolean; line: string; total: number | null; normalTotal: number | null }[]
  metrics: HubMetrics
  /** Switched on, priced, and with the training plan or the trainer in it. */
  hubOnSale?: boolean
  /** The hub on its own: members by state, and the monthly they bring. */
  hubPlans?: { paying: number; onFreeDays: number; cancelling: number; monthly: number }
  /** What we measure about the training plan and the trainer. */
  measures?: TrainingMeasures | null
}

const HEADING = { fontSize: 'var(--text-title)', fontWeight: 'var(--weight-strong)', fontFamily: 'var(--font-display)', color: 'var(--ink-1)' } as const
const META = { fontSize: 'var(--text-meta)', lineHeight: 'var(--leading-snug)', color: 'var(--ink-3)' } as const
const BODY = { fontSize: 'var(--text-body-sm)', lineHeight: 'var(--leading-snug)', color: 'var(--ink-2)' } as const
const money = (n: number | null) => (n == null ? '—' : `£${n.toFixed(2)}`)
const pct = (s: Share) => (s.of ? `${Math.round((s.n / s.of) * 100)}%` : '—')
const outOf = (s: Share, what: string, none: string) => (s.of ? `${s.n} of ${s.of} ${what}` : none)
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

      <HubPriceCard price={view.hubPrice} onSale={view.hubOnSale ?? false} plans={view.hubPlans ?? null} onSaved={load} />

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

      {view.measures && <MeasuresCard m={view.measures} />}

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

/**
 * The hub on its own: its monthly price, and whether it's genuinely on sale
 * at that price. Only then does the box show the 90 days as a saving.
 */
function HubPriceCard({ price, onSale, plans, onSaved }: { price: HubPriceSettings; onSale: boolean; plans: View['hubPlans'] | null; onSaved: (v: View) => void }) {
  const [monthly, setMonthly] = useState(String(price.monthly))
  const [saving, setSaving] = useState(false)
  const [note, setNote] = useState<string | null>(null)

  async function save(patch: Partial<HubPriceSettings>) {
    setSaving(true)
    setNote(null)
    try {
      const res = await fetch('/api/portal/member-hub', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ hubPrice: patch }) })
      if (!res.ok) throw new Error()
      onSaved((await res.json()) as View)
      setNote('Saved.')
    } catch {
      setNote('That did not save. Try again.')
    } finally {
      setSaving(false)
    }
  }

  const value = Number(monthly) * 3
  return (
    <Card elevation={1}>
      <div style={{ display: 'grid', gap: 'var(--space-3)' }} data-hub-price>
        <h2 style={HEADING}>The hub on its own</h2>
        <p style={BODY}>
          Switched on, the hub is on sale in the shop at this price a month (<Link href="/shop/hub" style={{ textDecoration: 'underline' }}>/shop/hub</Link>): members pay by
          card each month and cancel any time. The results page then shows the 90 days every stack brings as a saving, on the membership card, under the button and on
          the receipt. Stack orders still bring 90 days free with no subscription; they never start one.
        </p>
        <div className="flex flex-wrap items-end" style={{ gap: 'var(--space-3)' }}>
          <Input label="Price a month, on its own" prefix="£" type="number" inputMode="decimal" value={monthly} onChange={(e) => setMonthly(e.target.value)} />
          <Button size="sm" disabled={saving || Number(monthly) === price.monthly} onClick={() => void save({ monthly: Number(monthly) || 0 })}>
            Save price
          </Button>
        </div>
        <p style={META}>{Number(monthly) > 0 ? `90 days shows as £${value.toFixed(2)}. A new price applies to people who join after you change it.` : 'Set a price to sell it.'}</p>
        <Checkbox
          label="Sell the hub on its own at this price"
          hint="Puts it in the shop and turns on the saving. Switching it off stops new members joining; anyone already paying carries on until they cancel."
          checked={price.standalone}
          disabled={saving || !(price.monthly > 0)}
          onChange={(e) => void save({ standalone: e.target.checked })}
          data-hub-standalone
        />
        {price.standalone && !onSale ? (
          <Note tone="attention" icon="info">
            Not on sale yet: there’s nothing in the hub to sell on its own. Switch on the training plan or the trainer in{' '}
            <Link href="/founderhub/settings/offer" style={{ textDecoration: 'underline' }}>
              Offer → Box services
            </Link>
            . Until then it isn’t in the shop and no saving shows.
          </Note>
        ) : price.standalone ? (
          <Note tone="positive" icon="check">
            On sale at £{price.monthly.toFixed(2)} a month. The results page shows 90 days of the hub as £{(price.monthly * 3).toFixed(2)}, included with every stack.
          </Note>
        ) : (
          <Note tone="neutral" icon="info">
            Off: not in the shop, and the hub is described as included with every order, with no price or saving beside it.
          </Note>
        )}
        {plans && (
          <div className="grid grid-cols-2" style={{ gap: 'var(--space-4)' }} data-hub-plan-counts>
            {[
              ['Paying members', String(plans.paying), `£${plans.monthly.toFixed(2)} a month`],
              ['On a stack’s free days', String(plans.onFreeDays), 'Their next payment waits'],
              ['Cancelled, still open', String(plans.cancelling), 'Open to the end of the month paid'],
            ].map(([label, value, sub]) => (
              <div key={label}>
                <p style={META}>{label}</p>
                <p style={{ ...HEADING, fontSize: 'var(--text-display)', fontVariantNumeric: 'tabular-nums' }}>{value}</p>
                <p style={META}>{sub}</p>
              </div>
            ))}
          </div>
        )}
        {note && <p style={META}>{note}</p>}
      </div>
    </Card>
  )
}

/** What we measure: whether the training plan and the trainer bring people back. Real members only. */
function MeasuresCard({ m }: { m: TrainingMeasures }) {
  const a = m.answers
  const rows: [string, string, string][] = [
    ['Reorders: training members', pct(m.reorder.training), outOf(m.reorder.training, 'ordered again', 'No buyers five weeks in yet')],
    ['Reorders: everyone else', pct(m.reorder.rest), outOf(m.reorder.rest, 'ordered again', 'No buyers five weeks in yet')],
    ['First session inside 7 days', pct(m.firstSession), outOf(m.firstSession, 'plans a week or more old', 'No plans a week old yet')],
    ['Training this week', pct(m.thisWeek), outOf(m.thisWeek, 'plans', 'No plans yet')],
    ['Sessions a week', m.sessionsPerWeek == null ? '—' : String(m.sessionsPerWeek), 'Per plan, over the last 4 full weeks'],
    ['Still training in week 4', pct(m.week4), outOf(m.week4, 'plans past week 4', 'No plans past week 4 yet')],
    ['Still training in week 12', pct(m.week12), outOf(m.week12, 'plans past week 12', 'No plans past week 12 yet')],
    ['Answers inside the stated time', pct({ of: a.answered, n: a.withinPromise }), a.answered ? `${a.withinPromise} of ${a.answered} inside ${a.promiseHours} hours, 30 days` : 'No answers in 30 days'],
    ['Answers rated helpful', pct({ of: a.rated, n: a.helpful }), a.rated ? `${a.helpful} of ${a.rated} rated, 30 days` : 'None rated in 30 days'],
    ['Plan checks inside 24 hours', pct(m.checks), `${outOf(m.checks, 'checks, 30 days', 'No checks in 30 days')}${m.checks.waitingOver24h ? ` · ${m.checks.waitingOver24h} waiting longer now` : ''}`],
  ]
  return (
    <div data-training-measures>
      <Card elevation={1}>
        <div style={{ display: 'grid', gap: 'var(--space-4)' }}>
          <h2 style={HEADING}>What we measure</h2>
          <p style={BODY}>
            Whether the training plan and the trainer bring people back. Reorders count one-off buyers whose first order is at least five weeks old. Sample
            members never count.
          </p>
          <div className="grid grid-cols-2" style={{ gap: 'var(--space-4)' }}>
            {rows.map(([label, value, note]) => (
              <div key={label}>
                <p style={META}>{label}</p>
                <p style={{ ...HEADING, fontSize: 'var(--text-display)', fontVariantNumeric: 'tabular-nums' }}>{value}</p>
                <p style={META}>{note}</p>
              </div>
            ))}
          </div>
        </div>
      </Card>
    </div>
  )
}
