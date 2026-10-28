'use client'

import { useEffect, useState } from 'react'
import { Badge, Card, Checkbox, Note, Segmented } from '@/components/system'
import { AREAS, AREA_LABEL, DEVICE_LABEL, THRESHOLDS, VITALS, VITAL_LABEL, type Area, type Rating, type Vital, type VitalsReport } from '@/lib/analytics/vitals'

/**
 * Speed on real devices (plan Phase 7.1): what visitors' own browsers
 * measured, by device type. p75 is the number to watch: three in four page
 * loads were at least this good. Long frames are the motion's health: frames
 * over 50ms are the ones a person sees as a stutter.
 */

interface Data {
  windowDays: number
  founders: boolean
  areas: Record<Area, VitalsReport>
}

const TONE: Record<Rating, 'positive' | 'attention' | 'critical'> = { good: 'positive', 'needs-improvement': 'attention', poor: 'critical' }
const RATING_LABEL: Record<Rating, string> = { good: 'Good', 'needs-improvement': 'Needs work', poor: 'Poor' }

function show(metric: Vital, v: number | null): string {
  if (v === null) return '—'
  if (metric === 'CLS') return v.toFixed(2)
  return v >= 1000 ? `${(v / 1000).toFixed(1)}s` : `${Math.round(v)}ms`
}
const ms = (v: number | null) => (v === null ? '—' : `${Math.round(v)}ms`)

export function SpeedPanel() {
  const [area, setArea] = useState<Area>('all')
  const [founders, setFounders] = useState(false)
  const [data, setData] = useState<Data | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    fetch(`/api/portal/vitals${founders ? '?founders=1' : ''}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: Data) => live && setData(d))
      .catch(() => live && setError('Could not load the speed figures. Reload the page to try again.'))
    return () => {
      live = false
    }
  }, [founders])

  const report = data?.areas[area]

  return (
    <Card elevation={1} padding="roomy">
      <h3 style={{ fontSize: 'var(--text-body)', fontWeight: 'var(--weight-strong)', color: 'var(--ink-1)' }}>Speed on real devices</h3>
      <p style={{ fontSize: 'var(--text-meta)', lineHeight: 'var(--leading-snug)', color: 'var(--ink-3)', margin: 'var(--space-1) 0 var(--space-4)' }}>
        Measured by visitors’ own browsers over the last {data?.windowDays ?? 28} days. Each figure is the 75th percentile: three in four page loads
        were at least this good. Good is under {show('LCP', THRESHOLDS.LCP[0])} for the largest paint, {show('INP', THRESHOLDS.INP[0])} to respond to a
        tap and {show('CLS', THRESHOLDS.CLS[0])} of layout shift.
      </p>
      <div style={{ display: 'grid', gap: 'var(--space-3)', marginBottom: 'var(--space-4)' }}>
        <Segmented label="Part of the site" options={AREAS.map((a) => ({ value: a, label: AREA_LABEL[a] }))} value={area} onChange={setArea} />
        <Checkbox label="Include founder sessions" hint="The consult is founders-only until it rolls out, so its figures are all yours until then." checked={founders} onChange={(e) => setFounders(e.target.checked)} />
      </div>
      {error ? (
        <Note tone="critical" icon="alert-triangle">{error}</Note>
      ) : !report ? (
        <Note tone="neutral" icon="clock">Reading the speed figures…</Note>
      ) : report.rows.length === 0 ? (
        <Note tone="neutral" icon="info">No measurements here yet. They arrive a few seconds after a page loads, from visitors whose browsers allow analytics.</Note>
      ) : (
        <>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', minWidth: '36rem', borderCollapse: 'collapse', fontSize: 'var(--text-meta)', color: 'var(--ink-2)' }}>
              <caption style={{ textAlign: 'left', color: 'var(--ink-3)', paddingBottom: 'var(--space-2)' }}>Core Web Vitals, p75, by device</caption>
              <thead>
                <tr>
                  <Th>Device</Th>
                  {VITALS.map((m) => (
                    <Th key={m} align="right">
                      {VITAL_LABEL[m]} ({m})
                    </Th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {report.rows.map((r) => (
                  <tr key={r.device} data-device={r.device} style={{ borderTop: '1px solid var(--edge)' }}>
                    <Td>{DEVICE_LABEL[r.device]}</Td>
                    {VITALS.map((m) => {
                      const c = r.vitals[m]
                      return (
                        <Td key={m} align="right">
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                            {show(m, c.p75)}
                            {c.rating && <Badge tone={TONE[c.rating]}>{RATING_LABEL[c.rating]}</Badge>}
                          </span>
                          <span style={{ display: 'block', color: 'var(--ink-3)' }}>
                            {c.samples ? `${c.samples} loads · ${Math.round(c.good * 100)}% good` : 'no loads'}
                          </span>
                        </Td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ overflowX: 'auto', marginTop: 'var(--space-5)' }}>
            <table style={{ width: '100%', minWidth: '28rem', borderCollapse: 'collapse', fontSize: 'var(--text-meta)', color: 'var(--ink-2)' }}>
              <caption style={{ textAlign: 'left', color: 'var(--ink-3)', paddingBottom: 'var(--space-2)' }}>
                Long animation frames (over 50ms), where the browser reports them
              </caption>
              <thead>
                <tr>
                  <Th>Device</Th>
                  <Th align="right">Pages</Th>
                  <Th align="right">Long frames a page (median)</Th>
                  <Th align="right">Worst frame (p75)</Th>
                  <Th align="right">Blocking time (p75)</Th>
                </tr>
              </thead>
              <tbody>
                {report.rows.map((r) => (
                  <tr key={r.device} style={{ borderTop: '1px solid var(--edge)' }}>
                    <Td>{DEVICE_LABEL[r.device]}</Td>
                    <Td align="right">{r.frames.pages || '—'}</Td>
                    <Td align="right">{r.frames.perPage ?? '—'}</Td>
                    <Td align="right">{ms(r.frames.p75WorstMs)}</Td>
                    <Td align="right">{ms(r.frames.p75BlockingMs)}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Card>
  )
}

function Th({ children, align = 'left' }: { children: React.ReactNode; align?: 'left' | 'right' }) {
  return <th style={{ textAlign: align, padding: 'var(--space-2) var(--space-1)', fontWeight: 'var(--weight-body)', color: 'var(--ink-3)' }}>{children}</th>
}

function Td({ children, align = 'left' }: { children: React.ReactNode; align?: 'left' | 'right' }) {
  return <td style={{ textAlign: align, padding: 'var(--space-2) var(--space-1)', fontVariantNumeric: 'tabular-nums', verticalAlign: 'top' }}>{children}</td>
}
