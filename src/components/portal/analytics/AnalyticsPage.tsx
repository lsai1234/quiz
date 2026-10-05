'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Badge, Button, Card, ChargeMeter, Checkbox, Disclosure, EmptyState, Note, Segmented, Select, Skeleton, Tabs } from '@/components/system'
import { Icon } from '@/components/ui/Icon'
import type { AnalyticsPayload, Ladder } from '@/lib/analytics/report-cache'
import {
  DIMENSIONS,
  OTHER,
  formatFilter,
  type DimensionKey,
  type RangeKey,
  type Segment,
  type SeriesPoint,
  type Totals,
} from '@/lib/analytics/report'
import { ColumnChart, ShareBar, TrendChart } from './charts'
import { change, count, date, duration, money, pct } from './format'

/**
 * The Founders Hub's Analytics page.
 *
 * Ordered by the questions in the order they get asked: how many people came,
 * is that going up, where do they fall off, how long does the quiz take them,
 * and who — on what, from where — is doing better or worse than the rest.
 *
 * Every figure counts visits, and every figure on the page is scoped by the one
 * row of controls at the top: the period, the founders' own visits in or out,
 * and any number of "only these" filters. Change one and everything below it
 * re-renders against the same slice, so two numbers on screen never disagree
 * about what they are counting.
 */

const RANGE_OPTIONS: { value: RangeKey; label: string }[] = [
  { value: '24h', label: '24 hours' },
  { value: '7d', label: '7 days' },
  { value: '30d', label: '30 days' },
  { value: '90d', label: '90 days' },
  { value: 'all', label: 'All time' },
]

const PREVIOUS: Record<RangeKey, string> = {
  '24h': 'the 24 hours before',
  '7d': 'the 7 days before',
  '30d': 'the 30 days before',
  '90d': 'the 90 days before',
  all: '',
}

type Metric = 'visits' | 'landing' | 'started' | 'finished' | 'purchased'

const METRICS: { value: Metric; label: string; title: string }[] = [
  { value: 'visits', label: 'Visits', title: 'Visits to any page' },
  { value: 'landing', label: 'Landing', title: 'Opened the landing page' },
  { value: 'started', label: 'Started', title: 'Started the quiz' },
  { value: 'finished', label: 'Finished', title: 'Finished the quiz' },
  { value: 'purchased', label: 'Bought', title: 'Bought after the quiz' },
]

const GROUPS: { id: string; label: string; dims: DimensionKey[] }[] = [
  { id: 'people', label: 'Who', dims: ['age_bracket', 'gender', 'track', 'primary_goal', 'arm', 'door'] },
  { id: 'devices', label: 'Devices', dims: ['device', 'os', 'browser'] },
  { id: 'sources', label: 'Where from', dims: ['channel', 'source', 'campaign', 'country', 'landing_path'] },
  { id: 'when', label: 'When', dims: ['weekday', 'hour'] },
]

const eyebrow = {
  fontSize: 'var(--text-micro)',
  fontWeight: 'var(--weight-strong)',
  fontFamily: 'var(--font-display)',
  letterSpacing: 'var(--tracking-eyebrow)',
  textTransform: 'uppercase',
  color: 'var(--ink-3)',
} as const

const meta = { fontSize: 'var(--text-meta)', lineHeight: 'var(--leading-snug)', color: 'var(--ink-3)' } as const

const cardTitle = {
  fontSize: 'var(--text-body)',
  fontWeight: 'var(--weight-strong)',
  fontFamily: 'var(--font-display)',
  color: 'var(--ink-1)',
} as const

function readUrl(): { range: RangeKey; filters: string[]; internal: boolean } {
  const fallback = { range: '30d' as RangeKey, filters: [] as string[], internal: false }
  if (typeof window === 'undefined') return fallback
  const q = new URLSearchParams(window.location.search)
  const range = RANGE_OPTIONS.find((o) => o.value === q.get('range'))?.value ?? fallback.range
  return { range, filters: q.getAll('f'), internal: q.get('internal') === '1' }
}

function query(range: RangeKey, filters: string[], internal: boolean, fresh = false): string {
  const q = new URLSearchParams({ range })
  for (const f of filters) q.append('f', f)
  if (internal) q.set('internal', '1')
  if (fresh) q.set('fresh', '1')
  return q.toString()
}

export function AnalyticsPage() {
  const [range, setRange] = useState<RangeKey>('30d')
  const [filters, setFilters] = useState<string[]>([])
  const [internal, setInternal] = useState(false)
  const [ready, setReady] = useState(false)
  const [data, setData] = useState<AnalyticsPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [metric, setMetric] = useState<Metric>('started')
  const request = useRef(0)

  // The view lives in the URL, so a founder can bookmark "last 7 days, phones
  // only" or send it to the other one. Read once on arrival.
  useEffect(() => {
    const u = readUrl()
    setRange(u.range)
    setFilters(u.filters)
    setInternal(u.internal)
    setReady(true)
  }, [])

  const load = useCallback(
    (fresh = false) => {
      const id = ++request.current
      setLoading(true)
      setError(null)
      const qs = query(range, filters, internal, fresh)
      window.history.replaceState(null, '', `${window.location.pathname}?${query(range, filters, internal)}`)
      fetch(`/api/portal/analytics?${qs}`)
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
        .then((d: AnalyticsPayload) => {
          if (id !== request.current) return
          setData(d)
          setLoading(false)
        })
        .catch(() => {
          if (id !== request.current) return
          setError('Could not load the analytics. Try again in a moment.')
          setLoading(false)
        })
    },
    [range, filters, internal],
  )

  useEffect(() => {
    if (ready) load()
  }, [ready, load])

  // Older visits are rebuilt from their events a few seconds at a time; keep
  // asking until that has finished, so the page fills in without a reload.
  useEffect(() => {
    if (!data?.importing) return
    const t = setTimeout(() => load(), 2500)
    return () => clearTimeout(t)
  }, [data, load])

  const addFilter = (f: string) => {
    if (!f) return
    const dim = f.slice(0, f.indexOf(':'))
    setFilters((current) => [...current.filter((c) => !c.startsWith(`${dim}:`)), f])
  }

  return (
    <div className="flex flex-col" style={{ gap: 'var(--space-6)' }}>
      <Header />

      {/* ── The one row of controls. Everything below is scoped by it. ── */}
      <div className="flex flex-col" style={{ gap: 'var(--space-3)' }}>
        <Segmented label="Period" options={RANGE_OPTIONS} value={range} onChange={setRange} columns="wrap" />
        <div className="flex flex-wrap items-end" style={{ gap: 'var(--space-3)' }}>
          <div className="min-w-0" style={{ flex: '1 1 16rem' }}>
            <Select
              label="Show only"
              compact
              value=""
              onChange={(e) => addFilter(e.target.value)}
              disabled={!data}
            >
              <option value="">Everyone — or narrow to one group…</option>
              {data && <FilterOptions segments={data.report.segments} active={filters} />}
            </Select>
          </div>
          <Checkbox
            label={`Include our own visits${data ? ` (${count(data.report.internalVisits)})` : ''}`}
            checked={internal}
            onChange={(e) => setInternal(e.target.checked)}
          />
        </div>

        {data && data.report.filters.length > 0 && (
          <div className="flex flex-wrap items-center" style={{ gap: 'var(--space-2)' }}>
            <span style={meta}>Only:</span>
            {data.report.filters.map((f) => (
              <span key={formatFilter(f)} className="inline-flex items-center" style={{ gap: 'var(--space-1)' }}>
                <Badge tone="accent">
                  {f.dimLabel}: {f.label}
                </Badge>
                <Button
                  size="sm"
                  variant="ghost"
                  icon="x"
                  aria-label={`Stop filtering by ${f.dimLabel.toLowerCase()}`}
                  onClick={() => setFilters((c) => c.filter((x) => x !== formatFilter(f)))}
                />
              </span>
            ))}
            <Button size="sm" variant="ghost" onClick={() => setFilters([])}>
              Clear all
            </Button>
          </div>
        )}

        {data && (
          <div className="flex items-center flex-wrap" style={{ gap: 'var(--space-2)' }}>
            <span style={{ fontSize: 'var(--text-meta)', color: 'var(--ink-2)' }}>
              Counted at {new Date(data.asOf).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
              {data.report.range.from && ` · from ${date(data.report.range.from)}`}
            </span>
            <Button size="sm" variant="ghost" icon="refresh" onClick={() => load(true)} loading={loading}>
              Recount
            </Button>
          </div>
        )}
      </div>

      {error && (
        <Note tone="critical" live="assertive">
          {error}
        </Note>
      )}

      {!data ? (
        error ? null : <LoadingFrame />
      ) : (
        // Refetching keeps the frame: the last answer stays on screen, dimmed,
        // rather than the page collapsing to a skeleton on every click.
        <div
          className="flex flex-col"
          aria-busy={loading}
          style={{ gap: 'var(--space-8)', opacity: loading ? 0.55 : 1, transition: 'opacity var(--duration-base) var(--ease-settle)' }}
        >
          <Notices data={data} />
          {data.report.totals.visits === 0 ? (
            <EmptyState icon="activity" title="No visits in this period">
              {data.report.filters.length > 0
                ? 'Nobody in this group visited in this period. Widen the period or clear the filter.'
                : 'Visits appear here as soon as people open the site — counted from our own events, with no third-party tracking.'}
            </EmptyState>
          ) : (
            <>
              <Kpis
                totals={data.report.totals}
                previous={data.report.previous}
                range={range}
                trackingSince={data.report.contextSince}
                previousFrom={data.report.range.previousFrom}
              />
              <Trend series={data.report.series} metric={metric} onMetric={setMetric} totals={data.report.totals} />
              <Funnel data={data} />
              <Questions ladders={data.ladders} leftAt={data.report.leftAt} sampled={data.ladderSampled} />
              <TimeOnQuiz data={data} />
              <Breakdowns segments={data.report.segments} onFilter={addFilter} active={filters} />
            </>
          )}
        </div>
      )}
    </div>
  )
}

function Header() {
  return (
    <div>
      <h1
        style={{
          fontSize: 'var(--text-display)',
          fontWeight: 'var(--weight-display)',
          fontFamily: 'var(--font-display)',
          letterSpacing: 'var(--tracking-display)',
          lineHeight: 'var(--leading-tight)',
          color: 'var(--ink-1)',
        }}
      >
        Analytics
      </h1>
      <p style={{ fontSize: 'var(--text-body)', lineHeight: 'var(--leading-loose)', color: 'var(--ink-3)', marginTop: 'var(--space-2)', maxWidth: '42rem' }}>
        How many people come, where they fall off, how long the quiz takes them, and who they are — from our own
        anonymous events, a visit at a time.
      </p>
    </div>
  )
}

function LoadingFrame() {
  return (
    <div className="flex flex-col" style={{ gap: 'var(--space-3)' }} aria-busy>
      <div className="grid grid-cols-2 sm:grid-cols-3" style={{ gap: 'var(--space-3)' }}>
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} height="var(--control-lg)" />
        ))}
      </div>
      <Skeleton height="calc(var(--control-lg) * 4)" />
    </div>
  )
}

/** Every value in every breakdown, grouped by what it breaks down. */
function FilterOptions({ segments, active }: { segments: Segment[]; active: string[] }) {
  return (
    <>
      {segments.map((s) => {
        const rows = s.rows.filter((r) => r.value !== OTHER && r.visits > 0)
        if (rows.length === 0) return null
        return (
          <optgroup key={s.key} label={s.label}>
            {rows.map((r) => {
              const f = formatFilter({ dim: s.key, value: r.value })
              return (
                <option key={f} value={f} disabled={active.includes(f)}>
                  {r.label} ({count(r.visits)})
                </option>
              )
            })}
          </optgroup>
        )
      })}
    </>
  )
}

function Notices({ data }: { data: AnalyticsPayload }) {
  const { report } = data
  return (
    <>
      {data.importing && (
        <Note tone="info" icon="clock" live="polite">
          Bringing in visits from before this page existed. The figures fill in as it goes — no need to reload.
        </Note>
      )}
      {report.unrecordedVisits > 0 && (
        <Note tone="info" icon="info">
          {count(report.unrecordedVisits)} of these visits came before page views, devices and sources were recorded
          {report.contextSince ? ` (from ${date(report.contextSince)})` : ''}. They count in the quiz figures, but
          only visits since then are in the landing-page count, and they show as “Not recorded” in the device, browser,
          country and source breakdowns.
        </Note>
      )}
      {report.capped && (
        <Note tone="attention" icon="alert-triangle">
          This period has more visits than the page reads at once, so these figures cover the most recent ones.
          Choose a shorter period for the whole picture.
        </Note>
      )}
    </>
  )
}

// ─── Headline figures ───────────────────────────────────────────────────────

function Kpis({
  totals,
  previous,
  range,
  trackingSince,
  previousFrom,
}: {
  totals: Totals
  previous: Totals | null
  range: RangeKey
  trackingSince: string | null
  previousFrom: string | null
}) {
  const vs = PREVIOUS[range]
  // Page views began with this page. Before then a visit was only seen if it
  // DID something, so a period reaching back past that has fewer visits and
  // landing views on paper than it had — and "up 40%" would be the tracking,
  // not the traffic.
  const sinceTracking = !trackingSince || (previousFrom !== null && previousFrom < trackingSince) ? trackingSince ?? '' : null
  const tiles: { label: string; value: string; sub?: string; now: number; before?: number; neutral?: boolean; countedFrom?: string | null }[] = [
    { label: 'Visits', value: count(totals.visits), now: totals.visits, before: previous?.visits, sub: `${count(totals.shopVisits)} looked at the shop`, countedFrom: sinceTracking },
    { label: 'Opened the landing page', value: count(totals.landing), now: totals.landing, before: previous?.landing, countedFrom: sinceTracking },
    {
      label: 'Started the quiz',
      value: count(totals.started),
      now: totals.started,
      before: previous?.started,
      sub: `${pct(totals.startRate)} of landing-page visits`,
    },
    {
      label: 'Finished it',
      value: count(totals.finished),
      now: totals.finished,
      before: previous?.finished,
      sub: `${pct(totals.finishRate)} of those who started`,
    },
    {
      label: 'Bought',
      value: count(totals.purchased),
      now: totals.purchased,
      before: previous?.purchased,
      sub: `${pct(totals.conversion)} of starters${totals.revenuePence > 0 ? ` · ${money(totals.revenuePence)}` : ''}`,
    },
    {
      label: 'Time to finish',
      value: duration(totals.medianQuizSeconds),
      now: totals.medianQuizSeconds ?? 0,
      before: previous?.medianQuizSeconds ?? undefined,
      sub: 'median, for those who finished',
      // Faster is not obviously better — a rushed quiz builds a worse stack.
      neutral: true,
    },
  ]

  return (
    <section aria-label="Headline figures">
      <div className="grid grid-cols-2 sm:grid-cols-3" style={{ gap: 'var(--space-3)' }}>
        {tiles.map((t) => (
          <Card key={t.label} elevation={1} padding="tight">
            <p style={meta}>{t.label}</p>
            <p
              style={{
                fontSize: 'var(--text-title)',
                fontWeight: 'var(--weight-display)',
                fontFamily: 'var(--font-display)',
                letterSpacing: 'var(--tracking-title)',
                color: 'var(--ink-1)',
                marginTop: 'var(--space-1)',
              }}
            >
              {t.value}
            </p>
            {t.sub && <p style={{ ...meta, marginTop: 'var(--space-1)' }}>{t.sub}</p>}
            {range !== 'all' &&
              (t.countedFrom !== undefined && t.countedFrom !== null ? (
                <p style={{ ...meta, marginTop: 'var(--space-1)' }}>
                  {t.countedFrom ? `Counted from ${date(t.countedFrom)} — no fair comparison yet` : 'Counted from now on'}
                </p>
              ) : (
                <Delta value={change(t.now, t.before)} vs={vs} neutral={t.neutral} />
              ))}
          </Card>
        ))}
      </div>
      {totals.allPurchases > totals.purchased && (
        <p style={{ fontSize: 'var(--text-meta)', color: 'var(--ink-2)', marginTop: 'var(--space-2)' }}>
          Plus {count(totals.allPurchases - totals.purchased)} order{totals.allPurchases - totals.purchased === 1 ? '' : 's'} from
          visits that went straight to the shop without the quiz.
        </p>
      )}
    </section>
  )
}

/** Up or down against the period before — with an arrow and a sign, never colour alone. */
function Delta({ value, vs, neutral }: { value: number | null; vs: string; neutral?: boolean }) {
  if (value === null) {
    return <p style={{ ...meta, marginTop: 'var(--space-1)' }}>Nothing to compare with yet</p>
  }
  const flat = Math.abs(value) < 0.005
  const up = value > 0
  const colour = flat || neutral ? 'var(--ink-3)' : up ? 'var(--tone-positive)' : 'var(--tone-attention)'
  return (
    <p className="flex items-center" style={{ ...meta, color: colour, gap: 'var(--space-1)', marginTop: 'var(--space-1)' }}>
      {!flat && <Icon name={up ? 'trending-up' : 'trending-down'} size={12} />}
      <span>
        {flat ? 'No change' : `${up ? '+' : '−'}${pct(Math.abs(value))}`} on {vs}
      </span>
    </p>
  )
}

// ─── Over time ──────────────────────────────────────────────────────────────

function Trend({ series, metric, onMetric, totals }: { series: SeriesPoint[]; metric: Metric; onMetric: (m: Metric) => void; totals: Totals }) {
  const m = METRICS.find((x) => x.value === metric)!
  const points = series.map((p) => ({ label: p.label, title: p.title, value: p[metric] }))
  const total = metric === 'purchased' ? totals.purchased : totals[metric]
  return (
    <Section title="Over time">
      <Card elevation={1}>
        <div className="flex flex-col" style={{ gap: 'var(--space-4)' }}>
          <Segmented label="What to plot" options={METRICS.map(({ value, label }) => ({ value, label }))} value={metric} onChange={onMetric} />
          <div className="flex items-baseline justify-between flex-wrap" style={{ gap: 'var(--space-2)' }}>
            <p style={cardTitle}>{m.title}</p>
            <p style={meta}>{count(total)} in this period</p>
          </div>
          <TrendChart points={points} format={(n) => count(Math.round(n))} label={`${m.title}, over time`} />
          <TableView
            head={['When', m.label]}
            rows={series.map((p) => [p.title, count(p[metric])])}
          />
        </div>
      </Card>
    </Section>
  )
}

// ─── The funnel ─────────────────────────────────────────────────────────────

function Funnel({ data }: { data: AnalyticsPayload }) {
  const stages = data.report.funnel
  const worst = stages.slice(1).reduce<(typeof stages)[number] | null>((w, s) => (s.dropped > 0 && (!w || s.dropped > w.dropped) ? s : w), null)
  const worstIndex = worst ? stages.indexOf(worst) : -1

  return (
    <Section title="Where people fall off">
      {worst && (
        <div style={{ marginBottom: 'var(--space-3)' }}>
          <Card tone="attention" padding="tight">
            <p style={{ fontSize: 'var(--text-body-sm)', lineHeight: 'var(--leading-loose)', color: 'var(--tone-attention)' }}>
              The biggest drop is between <strong>{stages[worstIndex - 1].label.toLowerCase()}</strong> and{' '}
              <strong>{worst.label.toLowerCase()}</strong>: {count(worst.dropped)} people, {pct(1 - worst.fromPrevious)} of
              everyone who got that far.
            </p>
          </Card>
        </div>
      )}
      <Card elevation={1}>
        <ol className="flex flex-col" style={{ gap: 'var(--space-3)' }}>
          {stages.map((s, i) => (
            <li key={s.key}>
              {i > 0 && s.dropped > 0 && (
                <p
                  className="flex items-center"
                  style={{
                    ...meta,
                    gap: 'var(--space-1)',
                    marginBottom: 'var(--space-2)',
                    color: i === worstIndex ? 'var(--tone-attention)' : 'var(--ink-3)',
                  }}
                >
                  <Icon name="trending-down" size={12} />
                  {count(s.dropped)} left here ({pct(1 - s.fromPrevious)})
                </p>
              )}
              <div className="flex items-baseline justify-between" style={{ gap: 'var(--space-2)', marginBottom: 'var(--space-2)' }}>
                <span style={{ fontSize: 'var(--text-body-sm)', fontWeight: 'var(--weight-strong)', color: 'var(--ink-1)' }}>{s.label}</span>
                <span className="whitespace-nowrap" style={{ ...meta, fontVariantNumeric: 'tabular-nums' }}>
                  <strong style={{ color: 'var(--ink-1)' }}>{count(s.sessions)}</strong> · {pct(s.ofTop)}
                </span>
              </div>
              <ChargeMeter
                value={Math.max(s.sessions > 0 ? 2 : 0, s.ofTop * 100)}
                label={`${s.label}: ${s.sessions} visits, ${pct(s.ofTop)} of everyone who opened the landing page`}
                tone={i === worstIndex ? 'attention' : 'accent'}
                size="sm"
                showValue={false}
              />
            </li>
          ))}
        </ol>
      </Card>
      <p style={{ ...meta, marginTop: 'var(--space-2)' }}>
        Each visit counts at the furthest step it reached. Visits that went straight to the shop are left out here and
        counted in Visits above.
      </p>
    </Section>
  )
}

// ─── Question by question ───────────────────────────────────────────────────

function Questions({ ladders, leftAt, sampled }: { ladders: Ladder[]; leftAt: AnalyticsPayload['report']['leftAt']; sampled: boolean }) {
  const [arm, setArm] = useState<string | null>(null)
  const ladder = ladders.find((l) => l.arm === arm) ?? ladders.reduce<Ladder | null>((b, l) => (!b || l.started > b.started ? l : b), null)
  if (!ladder) return null
  const worst = ladder.steps.reduce<Ladder['steps'][number] | null>((w, s) => (s.dropped > 0 && (!w || s.dropped > w.dropped) ? s : w), null)

  return (
    <Section title="Question by question">
      {ladders.length > 1 && (
        <div style={{ marginBottom: 'var(--space-3)' }}>
          <Segmented
            label="Which quiz"
            options={ladders.map((l) => ({ value: l.arm, label: l.label, sub: `${count(l.started)} started` }))}
            value={ladder.arm}
            onChange={setArm}
            columns={2}
          />
        </div>
      )}
      <Card elevation={1}>
        <div className="flex items-baseline justify-between flex-wrap" style={{ gap: 'var(--space-2)', marginBottom: 'var(--space-4)' }}>
          <p style={cardTitle}>{ladder.label}</p>
          <p style={meta}>
            {count(ladder.started)} started · {count(ladder.completed)} finished
          </p>
        </div>
        <div className="flex flex-col" style={{ gap: 'var(--space-4)' }}>
          {ladder.steps.map((s, i) => (
            <div key={s.stepId}>
              <div className="flex items-baseline justify-between" style={{ gap: 'var(--space-3)', marginBottom: 'var(--space-2)' }}>
                <span className="min-w-0" title={s.stepId} style={{ fontSize: 'var(--text-body-sm)', fontWeight: 'var(--weight-strong)', color: 'var(--ink-1)', lineHeight: 'var(--leading-snug)' }}>
                  <span style={{ color: 'var(--ink-3)', fontVariantNumeric: 'tabular-nums' }}>{i + 1}. </span>
                  {s.label}
                </span>
                <span className="whitespace-nowrap shrink-0" style={{ ...meta, fontVariantNumeric: 'tabular-nums' }}>
                  {count(s.sessions)}
                  {s.dropped > 0 && (
                    <span style={{ color: s === worst ? 'var(--tone-attention)' : 'var(--ink-3)' }}> · −{count(s.dropped)} ({pct(s.dropOffPct)})</span>
                  )}
                  {s.medianSeconds != null && ` · ${duration(s.medianSeconds)}`}
                </span>
              </div>
              <ChargeMeter
                value={Math.max(s.sessions > 0 ? 2 : 0, s.ofStartPct * 100)}
                label={`${s.label}: ${s.sessions} reached it`}
                tone={s === worst ? 'attention' : 'accent'}
                size="sm"
                showValue={false}
              />
            </div>
          ))}
        </div>
        <p style={{ ...meta, marginTop: 'var(--space-4)' }}>
          Reached it · lost since the question before · median time spent on it.
          {sampled && ' This period is long enough that the ladder covers the most recent quiz runs only.'}
        </p>
      </Card>

      {leftAt.total > 0 && (
        <div style={{ marginTop: 'var(--space-3)' }}>
        <Card elevation={1}>
          <p style={cardTitle}>Where the people who left were last seen</p>
          <p style={{ ...meta, marginTop: 'var(--space-1)', marginBottom: 'var(--space-3)' }}>
            {count(leftAt.total)} started and did not finish. The question they were on when they went:
          </p>
          <ol className="flex flex-col" style={{ gap: 'var(--space-3)' }}>
            {leftAt.steps.slice(0, 6).map((s) => (
              <li key={s.stepId}>
                <div className="flex items-baseline justify-between" style={{ gap: 'var(--space-3)', marginBottom: 'var(--space-1)' }}>
                  <span className="min-w-0" title={s.stepId} style={{ fontSize: 'var(--text-body-sm)', color: 'var(--ink-2)' }}>
                    {s.label}
                  </span>
                  <span className="whitespace-nowrap shrink-0" style={{ ...meta, fontVariantNumeric: 'tabular-nums' }}>
                    {count(s.sessions)} · {pct(s.share)}
                  </span>
                </div>
                <ShareBar value={s.share} label={`${pct(s.share)} of leavers`} />
              </li>
            ))}
          </ol>
        </Card>
        </div>
      )}
    </Section>
  )
}

// ─── Time ───────────────────────────────────────────────────────────────────

function TimeOnQuiz({ data }: { data: AnalyticsPayload }) {
  const t = data.report.timing
  const stats: { label: string; value: string; sub: string }[] = [
    { label: 'Typical time to finish', value: duration(t.medianSeconds), sub: `median of ${count(t.finishers)} finishers` },
    {
      label: 'Middle half finish in',
      value: t.p25Seconds !== null && t.p75Seconds !== null ? `${duration(t.p25Seconds)}–${duration(t.p75Seconds)}` : '—',
      sub: 'a quarter are faster, a quarter slower',
    },
    { label: 'Leavers stay for', value: duration(t.medianLeaveSeconds), sub: `median, ${count(t.leavers)} who left mid-quiz` },
    { label: 'A visit lasts', value: duration(t.medianVisitSeconds), sub: 'median, first to last thing done' },
  ]
  return (
    <Section title="Time on the quiz">
      <div className="grid grid-cols-2 sm:grid-cols-4" style={{ gap: 'var(--space-3)', marginBottom: 'var(--space-3)' }}>
        {stats.map((s) => (
          <Card key={s.label} elevation={1} padding="tight">
            <p style={meta}>{s.label}</p>
            <p style={{ fontSize: 'var(--text-lead)', fontWeight: 'var(--weight-display)', fontFamily: 'var(--font-display)', color: 'var(--ink-1)', marginTop: 'var(--space-1)' }}>
              {s.value}
            </p>
            <p style={{ ...meta, marginTop: 'var(--space-1)' }}>{s.sub}</p>
          </Card>
        ))}
      </div>
      {t.finishers > 0 && (
        <Card elevation={1}>
          <p style={{ ...cardTitle, marginBottom: 'var(--space-3)' }}>How long finishing took</p>
          <ColumnChart
            points={t.histogram.map((b) => ({ label: b.label, value: b.count }))}
            format={(n) => count(Math.round(n))}
            label="Finishers by how long the quiz took them"
            showValues
          />
          <TableView head={['Time taken', 'Finishers']} rows={t.histogram.map((b) => [b.label, count(b.count)])} />
        </Card>
      )}
    </Section>
  )
}

// ─── Breakdowns ─────────────────────────────────────────────────────────────

function Breakdowns({ segments, onFilter, active }: { segments: Segment[]; onFilter: (f: string) => void; active: string[] }) {
  const byKey = useMemo(() => new Map(segments.map((s) => [s.key, s])), [segments])
  return (
    <Section title="Who, on what, from where">
      <Tabs
        label="Breakdowns"
        tabs={GROUPS.map((g) => ({
          id: g.id,
          label: g.label,
          content: (
            <div className="grid sm:grid-cols-2" style={{ gap: 'var(--space-3)', marginTop: 'var(--space-3)' }}>
              {g.dims.map((d) => {
                const s = byKey.get(d)
                if (!s) return null
                return g.id === 'when' ? (
                  <WhenCard key={d} segment={s} />
                ) : (
                  <BreakdownCard key={d} segment={s} onFilter={onFilter} active={active} />
                )
              })}
            </div>
          ),
        }))}
      />
    </Section>
  )
}

const BASE_TEXT: Record<Segment['base'], (n: number) => string> = {
  visits: (n) => `Of ${count(n)} visits`,
  starters: (n) => `Of ${count(n)} people who started the quiz and answered`,
  finishers: (n) => `Of ${count(n)} people who finished the quiz`,
}

function BreakdownCard({ segment, onFilter, active }: { segment: Segment; onFilter: (f: string) => void; active: string[] }) {
  const rows = segment.rows.filter((r) => r.visits > 0)
  const people = segment.base !== 'visits'
  return (
    <Card elevation={1}>
      <div className="flex items-baseline justify-between" style={{ gap: 'var(--space-2)' }}>
        <p style={cardTitle}>{segment.label}</p>
      </div>
      <p style={{ ...meta, marginTop: 'var(--space-1)', marginBottom: 'var(--space-4)' }}>
        {rows.length === 0
          ? people
            ? 'Nobody has answered this yet in this period.'
            : 'Nothing recorded yet in this period.'
          : BASE_TEXT[segment.base](segment.total)}
        {people && segment.unknown > 0 && rows.length > 0 && ` · ${count(segment.unknown)} left before answering`}
      </p>
      <ul className="flex flex-col" style={{ gap: 'var(--space-4)' }}>
        {rows.map((r) => {
          const f = formatFilter({ dim: segment.key, value: r.value })
          const filtered = active.includes(f)
          const rates = [
            segment.base === 'visits' ? `Started ${pct(r.startRate)}` : null,
            segment.base !== 'finishers' && r.started > 0 ? `Finished ${pct(r.finishRate)}` : null,
            r.started > 0 ? `Bought ${pct(r.conversion)}` : null,
          ].filter(Boolean)
          return (
            <li key={String(r.value)}>
              <div className="flex items-baseline justify-between" style={{ gap: 'var(--space-3)', marginBottom: 'var(--space-1)' }}>
                <span className="min-w-0 truncate" title={r.label} style={{ fontSize: 'var(--text-body-sm)', fontWeight: 'var(--weight-strong)', color: r.value === null ? 'var(--ink-3)' : 'var(--ink-1)' }}>
                  {r.label}
                </span>
                <span className="whitespace-nowrap shrink-0" style={{ ...meta, fontVariantNumeric: 'tabular-nums' }}>
                  <strong style={{ color: 'var(--ink-1)' }}>{count(r.visits)}</strong> · {pct(r.share)}
                </span>
              </div>
              <ShareBar value={r.share} label={`${r.label}: ${pct(r.share)}`} />
              <div className="flex items-center justify-between" style={{ gap: 'var(--space-2)', marginTop: 'var(--space-1)' }}>
                <span style={{ ...meta, fontVariantNumeric: 'tabular-nums' }}>{rates.join(' · ')}</span>
                {r.value !== OTHER && !filtered && (
                  <Button size="sm" variant="ghost" onClick={() => onFilter(f)} aria-label={`Show only ${segment.label.toLowerCase()}: ${r.label}`}>
                    Only these
                  </Button>
                )}
              </div>
            </li>
          )
        })}
      </ul>
      {DIMENSIONS[segment.key].base === 'visits' && rows.length > 0 && (
        <TableView
          head={[segment.label, 'Visits', 'Started', 'Finished', 'Bought']}
          rows={rows.map((r) => [r.label, count(r.visits), count(r.started), count(r.finished), count(r.purchased)])}
        />
      )}
    </Card>
  )
}

function WhenCard({ segment }: { segment: Segment }) {
  const hour = segment.key === 'hour'
  return (
    <Card elevation={1} className={hour ? 'sm:col-span-2' : undefined}>
      <p style={cardTitle}>{segment.label}</p>
      <p style={{ ...meta, marginTop: 'var(--space-1)', marginBottom: 'var(--space-3)' }}>Visits by when they began, UK time</p>
      <ColumnChart
        points={segment.rows.map((r) => ({ label: hour ? r.label.slice(0, 2) : r.label, title: `${r.label} — ${pct(r.startRate)} started the quiz`, value: r.visits }))}
        format={(n) => count(Math.round(n))}
        label={`Visits by ${segment.label.toLowerCase()}`}
        labelEvery={hour ? 3 : 1}
        showValues={!hour}
      />
      <TableView
        head={[hour ? 'Hour' : 'Day', 'Visits', 'Started', 'Bought']}
        rows={segment.rows.map((r) => [r.label, count(r.visits), count(r.started), count(r.purchased)])}
      />
    </Card>
  )
}

// ─── Shared bits ────────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 style={{ ...eyebrow, marginBottom: 'var(--space-3)' }}>{title}</h2>
      {children}
    </section>
  )
}

/** Every chart's numbers, as a table — the twin that needs neither a pointer nor eyesight. */
function TableView({ head, rows }: { head: string[]; rows: string[][] }) {
  return (
    <div style={{ marginTop: 'var(--space-3)' }}>
      <Disclosure summary={<span style={meta}>Show as a table</span>}>
        <div className="overflow-x-auto" style={{ marginTop: 'var(--space-2)' }}>
          <table className="w-full" style={{ fontSize: 'var(--text-meta)', color: 'var(--ink-2)', borderCollapse: 'collapse', fontVariantNumeric: 'tabular-nums' }}>
            <thead>
              <tr>
                {head.map((h, i) => (
                  <th key={h} scope="col" style={{ textAlign: i === 0 ? 'left' : 'right', color: 'var(--ink-3)', fontWeight: 'var(--weight-strong)', padding: 'var(--space-1) var(--space-2)', borderBottom: '1px solid var(--edge)' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, ri) => (
                <tr key={ri}>
                  {r.map((c, i) =>
                    i === 0 ? (
                      <th key={i} scope="row" style={{ textAlign: 'left', fontWeight: 'var(--weight-body)', padding: 'var(--space-1) var(--space-2)', borderBottom: '1px solid var(--edge)' }}>
                        {c}
                      </th>
                    ) : (
                      <td key={i} style={{ textAlign: 'right', padding: 'var(--space-1) var(--space-2)', borderBottom: '1px solid var(--edge)' }}>
                        {c}
                      </td>
                    ),
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Disclosure>
    </div>
  )
}
