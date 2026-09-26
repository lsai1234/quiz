'use client'

import { useCallback, useEffect, useState } from 'react'
import { Badge, Button, Card, Disclosure, Note } from '@/components/system'
import type { AiAuditEntry, AiRouteSummary } from '@/lib/consult/ai/audit'
import type { HandoffPayload } from '@/lib/consult/handoff'
import { CLAIMS } from '@/lib/consult/claims'

/**
 * The Amp Consult's oversight (plan p.11, "Guardrail layers → Oversight"):
 * whether the AI is working, and the consults people have finished.
 *
 * The AI log holds outcomes and timings only, never what anyone typed, said
 * or photographed. A saved consult holds its handoff payload — goals, a coarse
 * profile, the three product lists, what was kept out — and can be deleted on
 * request. Both are kept 30 days.
 */

interface Data {
  consults: { savedAt: number; payload: HandoffPayload }[]
  ai: { targetMs: number; summary: AiRouteSummary[]; recent: AiAuditEntry[] }
}

const ROUTE_NAMES: Record<string, string> = {
  copy: 'Amp’s words',
  understand: 'Tell Amp more',
  explain: 'What’s this? follow-ups',
  scan: 'Shelf scan and tracker read',
  voice: 'Voice',
  health: 'Founder test',
}

const secs = (ms: number | null) => (ms == null ? '—' : `${(ms / 1000).toFixed(1)}s`)
const when = (at: number) => new Date(at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

export function ConsultOversight() {
  const [data, setData] = useState<Data | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    fetch('/api/portal/consults')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: Data) => setData(d))
      .catch(() => setError('Could not load the consult data. Reload the page to try again.'))
  }, [])

  useEffect(load, [load])

  async function remove(id: string) {
    if (!window.confirm(`Delete consult ${id}? This can’t be undone.`)) return
    const res = await fetch(`/api/portal/consults?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
    if (res.ok) setData((d) => (d ? { ...d, consults: d.consults.filter((c) => c.payload.consult_id !== id) } : d))
  }

  if (error) return <Note tone="critical" icon="alert-triangle">{error}</Note>
  if (!data) return <Note tone="neutral" icon="clock">Reading the consult data…</Note>

  return (
    <div style={{ display: 'grid', gap: 'var(--space-6)' }}>
      <Card elevation={1} padding="roomy">
        <Heading title="Amp Consult: is the AI working?">
          Every AI call from the last 7 days: how it came out and how long it took. The target for Amp’s words is{' '}
          {secs(data.ai.targetMs)}; slower words aren’t lost, the scripted ones show instead. Nothing anyone typed, said or
          photographed is kept here.
        </Heading>
        {data.ai.summary.length === 0 ? (
          <Note tone="neutral" icon="info">
            No AI calls yet. Open /quizv2 and use the Founder preview’s “Test the AI now”, or run a consult.
          </Note>
        ) : (
          // Nine columns don't fit a phone: the table scrolls sideways inside its card.
          <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', minWidth: '40rem', borderCollapse: 'collapse', fontSize: 'var(--text-meta)', color: 'var(--ink-2)' }}>
            <thead>
              <tr>
                <Th>Feature</Th>
                <Th align="right">Calls</Th>
                <Th align="right">Worked</Th>
                <Th align="right">Scripted instead</Th>
                <Th align="right">Held back</Th>
                <Th align="right">No key</Th>
                <Th align="right">Failed</Th>
                <Th align="right">Median</Th>
                <Th align="right">Slowest 5%</Th>
              </tr>
            </thead>
            <tbody>
              {data.ai.summary.map((s) => (
                <tr key={s.route} style={{ borderTop: '1px solid var(--edge)' }}>
                  <Td>{ROUTE_NAMES[s.route] ?? s.route}</Td>
                  <Td align="right">{s.calls}</Td>
                  <Td align="right">{s.ok}</Td>
                  <Td align="right">{s.fallback}</Td>
                  <Td align="right">{s.held}</Td>
                  <Td align="right">{s.unavailable}</Td>
                  <Td align="right">{s.error}</Td>
                  <Td align="right">{secs(s.p50)}</Td>
                  <Td align="right">{secs(s.p95)}</Td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
        {data.ai.summary.some((s) => s.unavailable > 0) && (
          <div style={{ marginTop: 'var(--space-4)' }}>
            <Note tone="attention" icon="alert-triangle">
              Some calls found no OpenAI key on the server. Set OPENAI_API_KEY in the site’s environment and redeploy.
            </Note>
          </div>
        )}
        {data.ai.recent.length > 0 && (
          <div style={{ marginTop: 'var(--space-4)' }}>
            <Disclosure summary={`Latest ${data.ai.recent.length} calls`}>
              <ul style={{ display: 'grid', gap: 'var(--space-1)', fontSize: 'var(--text-meta)', color: 'var(--ink-2)', fontVariantNumeric: 'tabular-nums' }}>
                {data.ai.recent.map((e, i) => (
                  <li key={`${e.at}-${i}`}>
                    {when(e.at)} · {ROUTE_NAMES[e.route] ?? e.route}
                    {e.subject ? ` (${e.subject})` : ''} · {e.outcome}
                    {e.reason ? `: ${e.reason}` : ''} · {secs(e.ms)}
                  </li>
                ))}
              </ul>
            </Disclosure>
          </div>
        )}
      </Card>

      <Card elevation={1} padding="roomy">
        <Heading title="Finished consults">
          The last 30 days, newest first: what each person was after, the three stacks the engine built and anything it
          kept out. The safety answers themselves are never stored. Delete one when someone asks.
        </Heading>
        {data.consults.length === 0 ? (
          <Note tone="neutral" icon="info">No finished consults yet.</Note>
        ) : (
          <ul style={{ display: 'grid', gap: 'var(--space-3)' }}>
            {data.consults.map(({ savedAt, payload: p }) => (
              <li key={p.consult_id} style={{ borderTop: '1px solid var(--edge)', paddingTop: 'var(--space-3)' }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 'var(--space-2)' }}>
                  <strong style={{ fontSize: 'var(--text-meta)', color: 'var(--ink-1)', fontVariantNumeric: 'tabular-nums' }}>{p.consult_id}</strong>
                  <span style={{ fontSize: 'var(--text-meta)', color: 'var(--ink-3)' }}>{when(savedAt)}</span>
                  <Badge tone="neutral">{p.route === 'speed' ? 'Speed run' : 'Deep charge'}</Badge>
                  {p.flags.pharmacist_note && <Badge tone="attention">Pharmacist note</Badge>}
                </div>
                <p style={{ fontSize: 'var(--text-meta)', color: 'var(--ink-2)', marginTop: 'var(--space-1)' }}>
                  Goals: {p.goals.join(', ')} · Essentials {p.tiers.essentials.length} · Standard {p.tiers.standard.length} · Complete{' '}
                  {p.tiers.complete.length}
                  {p.excluded.length > 0 ? ` · Kept out: ${p.excluded.join(', ')}` : ''}
                </p>
                <div style={{ marginTop: 'var(--space-2)' }}>
                  <Disclosure summary="Details">
                    <div style={{ display: 'grid', gap: 'var(--space-2)', fontSize: 'var(--text-meta)', color: 'var(--ink-2)' }}>
                      <p>Complete: {p.tiers.complete.map((id) => `${id} (${p.reasons[id] ?? 'no reason'})`).join('; ')}</p>
                      {p.claims && (
                        <p>
                          Register claims it may use:{' '}
                          {p.tiers.complete
                            .map((id) => `${id}: ${(p.claims[id] ?? []).map((c) => CLAIMS[c]?.wording ?? c).join('; ') || 'none'}`)
                            .join(' · ')}
                        </p>
                      )}
                      <p>
                        Profile:{' '}
                        {Object.entries(p.profile)
                          .map(([k, v]) => `${k} ${v}`)
                          .join(' · ')}
                      </p>
                      {p.notes.length > 0 && <p>Notes: {p.notes.join(' ')}</p>}
                      <div>
                        <Button variant="destructive" size="sm" onClick={() => void remove(p.consult_id)}>
                          Delete this consult
                        </Button>
                      </div>
                    </div>
                  </Disclosure>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}

function Heading({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <>
      <h3 style={{ fontSize: 'var(--text-body)', fontWeight: 'var(--weight-strong)', color: 'var(--ink-1)' }}>{title}</h3>
      <p style={{ fontSize: 'var(--text-meta)', lineHeight: 'var(--leading-snug)', color: 'var(--ink-3)', margin: 'var(--space-1) 0 var(--space-4)' }}>
        {children}
      </p>
    </>
  )
}

function Th({ children, align = 'left' }: { children: React.ReactNode; align?: 'left' | 'right' }) {
  return <th style={{ textAlign: align, padding: 'var(--space-2) var(--space-1)', fontWeight: 'var(--weight-body)', color: 'var(--ink-3)' }}>{children}</th>
}

function Td({ children, align = 'left' }: { children: React.ReactNode; align?: 'left' | 'right' }) {
  return <td style={{ textAlign: align, padding: 'var(--space-2) var(--space-1)', fontVariantNumeric: 'tabular-nums' }}>{children}</td>
}
