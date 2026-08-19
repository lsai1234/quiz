'use client'

import { useState } from 'react'
import { Badge, Button, Card, Note } from '@/components/system'

/**
 * Why is the hub slow?
 *
 * The honest answer to that question cannot be worked out from a laptop: locally
 * every screen answers in single-digit milliseconds against a database in the
 * same process, and the deployed site is a different machine, in a region that
 * may not be the database's, starting a fresh server for a burst of traffic and
 * throwing it away again. "The queries are slow", "the database is a long way
 * away" and "the function had to start first" feel identical from the outside
 * and need three different fixes.
 *
 * So this runs the measurement where the problem is, and reports the three
 * separately. See `lib/db/diagnostics.ts` for what each number means.
 */

interface Timing { label: string; ms: number; detail: string }

interface Report {
  engine: 'sqlite' | 'postgres'
  host: string | null
  pooled: boolean
  instance: { ageMs: number; requestsServed: number }
  ping: { samples: number; bestMs: number; medianMs: number; worstMs: number }
  work: Timing[]
  counts: Record<string, number>
  verdict: string
  ranAt: string
  /** How long the handler itself took, so the browser can subtract it. */
  serverMs: number
}

const label = {
  fontSize: 'var(--text-micro)',
  fontWeight: 'var(--weight-strong)',
  fontFamily: 'var(--font-display)',
  letterSpacing: 'var(--tracking-eyebrow)',
  textTransform: 'uppercase',
  color: 'var(--ink-3)',
} as const

const figure = {
  fontSize: 'var(--text-title)',
  fontWeight: 'var(--weight-strong)',
  fontFamily: 'var(--font-display)',
  color: 'var(--ink-1)',
} as const

const meta = {
  fontSize: 'var(--text-meta)',
  lineHeight: 'var(--leading-snug)',
  color: 'var(--ink-3)',
} as const

/** Round trips: fast, noticeable, or another region. */
function pingTone(ms: number): 'positive' | 'attention' | 'critical' {
  if (ms >= 40) return 'critical'
  if (ms >= 15) return 'attention'
  return 'positive'
}

const seconds = (ms: number) => (ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(1)}s`)

export function SpeedDiagnostics() {
  const [report, setReport] = useState<Report | null>(null)
  /** What this browser waited, wall clock, for the request above. */
  const [roundTripMs, setRoundTripMs] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function run() {
    setBusy(true)
    setError(null)
    const at = performance.now()
    try {
      const res = await fetch('/api/portal/diagnostics/db', { cache: 'no-store' })
      if (!res.ok) throw new Error(`The check could not run (${res.status}).`)
      const body = (await res.json()) as Report
      setRoundTripMs(Math.round(performance.now() - at))
      setReport(body)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The check could not run.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ display: 'grid', gap: 'var(--space-3)' }}>
      <div className="flex items-center" style={{ gap: 'var(--space-3)' }}>
        <Button onClick={run} loading={busy} icon="activity">
          {report ? 'Run it again' : 'Measure it'}
        </Button>
        {report && (
          <span style={meta}>
            {report.engine === 'postgres' ? report.host ?? 'Postgres' : 'SQLite, on this machine'}
            {report.engine === 'postgres' && report.pooled ? ' · pooled endpoint' : ''}
          </span>
        )}
      </div>

      {error && <Note tone="critical">{error}</Note>}

      {report && (
        <>
          <Note tone={pingTone(report.ping.medianMs) === 'positive' ? 'info' : pingTone(report.ping.medianMs)}>
            {report.verdict}
          </Note>

          <div style={{ display: 'grid', gap: 'var(--space-2)', gridTemplateColumns: 'repeat(auto-fit, minmax(11rem, 1fr))' }}>
            <Card elevation={1} padding="tight">
              <div className="flex items-center" style={{ gap: 'var(--space-2)' }}>
                <span style={label}>Round trip</span>
                <Badge tone={pingTone(report.ping.medianMs)}>
                  {pingTone(report.ping.medianMs) === 'positive' ? 'Local' : pingTone(report.ping.medianMs) === 'attention' ? 'Noticeable' : 'Far away'}
                </Badge>
              </div>
              <p style={{ ...figure, marginTop: 'var(--space-1)' }}>{Math.round(report.ping.medianMs)}ms</p>
              <p style={meta}>
                Median of {report.ping.samples}. Best {Math.round(report.ping.bestMs)}ms, worst{' '}
                {Math.round(report.ping.worstMs)}ms — the cost of asking the database anything at all.
              </p>
            </Card>

            <Card elevation={1} padding="tight">
              <span style={label}>This server</span>
              <p style={{ ...figure, marginTop: 'var(--space-1)' }}>{seconds(report.instance.ageMs)} old</p>
              <p style={meta}>
                {report.instance.requestsServed} request{report.instance.requestsServed === 1 ? '' : 's'} served by
                it. A reading that is always seconds old means every visit is starting a server first.
              </p>
            </Card>

            <Card elevation={1} padding="tight">
              <span style={label}>Stored</span>
              <p style={{ ...figure, marginTop: 'var(--space-1)' }}>
                {report.counts.analytics_events < 0 ? '—' : report.counts.analytics_events.toLocaleString()}
              </p>
              <p style={meta}>
                Analytics events, {report.counts.orders < 0 ? '—' : report.counts.orders.toLocaleString()} orders. The
                funnel is built from the events, which is why it is counted every few minutes rather than per view.
              </p>
            </Card>
          </div>

          {roundTripMs !== null && (
            <Card elevation={1} padding="tight">
              <span style={label}>Before the server did anything</span>
              <p style={{ ...figure, marginTop: 'var(--space-1)' }}>
                {seconds(Math.max(0, roundTripMs - report.serverMs))}
              </p>
              <p style={meta}>
                Your browser waited {seconds(roundTripMs)} for this check; the server spent{' '}
                {seconds(report.serverMs)} of it actually working. The rest is the request reaching a
                function, that function starting if it was not already running, and the answer coming
                back. When this is the big number, no amount of query tuning is the fix — it is cold
                starts and distance.
              </p>
            </Card>
          )}

          <Card elevation={1} padding="tight">
            <span style={label}>The reads a screen makes</span>
            <ul style={{ display: 'grid', gap: 'var(--space-2)', marginTop: 'var(--space-2)' }}>
              {report.work.map((w) => (
                <li key={w.label} className="flex items-baseline" style={{ gap: 'var(--space-3)' }}>
                  <span style={{ ...figure, fontSize: 'var(--text-lead)', minWidth: '4.5rem' }}>{seconds(w.ms)}</span>
                  <span className="min-w-0">
                    <span style={{ fontSize: 'var(--text-body-sm)', color: 'var(--ink-1)' }}>{w.label}</span>
                    <span className="block" style={meta}>{w.detail}</span>
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        </>
      )}
    </div>
  )
}
