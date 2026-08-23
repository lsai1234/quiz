'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Badge, Button, Card, EmptyState, Note, Segmented } from '@/components/system'
import { Icon } from '@/components/ui/Icon'
import type { HealthCheck, HealthStatus } from '@/lib/monitoring/health'
import type { ErrorGroup, GroupState, Surface } from '@/lib/monitoring/types'

/**
 * The monitoring screen: is anything broken, and what.
 *
 * Two blocks, in the order the questions get asked.
 *
 * **Health** comes first and is not a list of errors. It is the set of failures
 * that never throw — a webhook that stopped arriving, a cron that stopped
 * firing, an outbox that stopped draining. Nothing raises an exception in any of
 * those cases, so an error log alone would show a reassuring green nothing while
 * orders quietly piled up unpaid. Every check names what to do about it and
 * links to where you would do it.
 *
 * **Errors** come second, grouped rather than listed. Four hundred occurrences
 * of one broken checkout is one row here with a count of four hundred — see
 * `lib/monitoring/fingerprint.ts`. Each can be resolved (fixed) or muted (known,
 * not worth seeing), and a resolved fault that recurs stays resolved while its
 * count and "last seen" keep climbing, so the state means what a person meant by
 * it rather than what the last event did.
 */

interface Payload {
  windowDays: number
  health: { checks: HealthCheck[]; status: HealthStatus }
  groups: ErrorGroup[]
  daily: { day: string; count: number }[]
}

const TONE: Record<HealthStatus, 'positive' | 'attention' | 'critical'> = {
  ok: 'positive',
  warn: 'attention',
  fail: 'critical',
}

const SEVERITY_TONE = {
  critical: 'critical',
  error: 'attention',
  warning: 'info',
} as const

const label = {
  fontSize: 'var(--text-micro)',
  fontWeight: 'var(--weight-strong)',
  fontFamily: 'var(--font-display)',
  letterSpacing: 'var(--tracking-eyebrow)',
  textTransform: 'uppercase',
  color: 'var(--ink-3)',
} as const

const meta = {
  fontSize: 'var(--text-meta)',
  lineHeight: 'var(--leading-snug)',
  color: 'var(--ink-3)',
} as const

/** "3 minutes ago" — relative, because the only question is "is it still happening?". */
function ago(iso: string): string {
  const ms = Date.now() - Date.parse(iso)
  if (!Number.isFinite(ms)) return '—'
  const mins = Math.round(ms / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.round(hours / 24)}d ago`
}

const STATES: { value: GroupState; label: string }[] = [
  { value: 'open', label: 'Open' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'muted', label: 'Muted' },
]

export function MonitoringPage() {
  const [data, setData] = useState<Payload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [state, setState] = useState<GroupState>('open')
  const [days, setDays] = useState(7)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(() => {
    setError(null)
    fetch(`/api/portal/monitoring?state=${state}&days=${days}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then(setData)
      .catch(() => setError('Could not load monitoring.'))
  }, [state, days])

  useEffect(() => load(), [load])

  const triage = useCallback(
    async (fingerprint: string, next: GroupState) => {
      setBusy(fingerprint)
      try {
        await fetch('/api/portal/monitoring', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fingerprint, state: next }),
        })
        load()
      } finally {
        setBusy(null)
      }
    },
    [load],
  )

  if (!data) {
    return <p style={{ fontSize: 'var(--text-body)', color: 'var(--ink-3)' }}>{error ?? 'Loading…'}</p>
  }

  const peak = Math.max(1, ...data.daily.map((d) => d.count))

  return (
    <div className="flex flex-col" style={{ gap: 'var(--space-8)' }}>
      {/* ── Health ─────────────────────────────────────────────────────── */}
      <section>
        <div
          className="flex items-center justify-between"
          style={{ gap: 'var(--space-3)', marginBottom: 'var(--space-3)' }}
        >
          <h2 style={label}>System health</h2>
          <Button variant="ghost" size="sm" icon="refresh" onClick={load}>
            Refresh
          </Button>
        </div>

        <ul style={{ display: 'grid', gap: 'var(--space-2)' }}>
          {data.health.checks.map((check) => (
            <li key={check.id}>
              <Card elevation={1} padding="tight" tone={check.status === 'ok' ? undefined : TONE[check.status]}>
                <div className="flex items-start" style={{ gap: 'var(--space-3)' }}>
                  <span style={{ color: `var(--tone-${TONE[check.status]})`, marginTop: 'var(--space-1)' }}>
                    <Icon
                      name={check.status === 'ok' ? 'check' : check.status === 'warn' ? 'info' : 'alert-triangle'}
                      size={16}
                    />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span
                      className="block"
                      style={{
                        fontSize: 'var(--text-body-sm)',
                        fontWeight: 'var(--weight-strong)',
                        fontFamily: 'var(--font-display)',
                        color: 'var(--ink-1)',
                      }}
                    >
                      {check.title}
                    </span>
                    <span className="block" style={{ ...meta, marginTop: 'var(--space-1)' }}>
                      {check.detail}
                    </span>
                  </span>
                  {/* A link, not a Button: `Button` renders a <button> and takes
                      no href, and this navigates rather than acts. */}
                  {check.href ? (
                    <Link
                      href={check.href}
                      className="system-focus shrink-0"
                      style={{
                        fontSize: 'var(--text-meta)',
                        fontWeight: 'var(--weight-strong)',
                        fontFamily: 'var(--font-display)',
                        color: 'var(--accent)',
                        textDecoration: 'none',
                        borderRadius: 'var(--radius-chip)',
                      }}
                    >
                      Open
                    </Link>
                  ) : null}
                </div>
              </Card>
            </li>
          ))}
        </ul>
      </section>

      {/* ── Errors ─────────────────────────────────────────────────────── */}
      <section>
        <div
          className="flex flex-wrap items-center justify-between"
          style={{ gap: 'var(--space-3)', marginBottom: 'var(--space-3)' }}
        >
          <h2 style={label}>Errors, grouped</h2>
          <div className="flex items-center" style={{ gap: 'var(--space-2)' }}>
            <Segmented
              options={STATES}
              value={state}
              onChange={(v) => setState(v as GroupState)}
              label="Which errors to show"
            />
            <Segmented
              options={[
                { value: '1', label: '24h' },
                { value: '7', label: '7d' },
                { value: '30', label: '30d' },
              ]}
              value={String(days)}
              onChange={(v) => setDays(Number(v))}
              label="Time window"
            />
          </div>
        </div>

        {/* The shape of the window, so a spike is visible before anything is read. */}
        <Card elevation={1} padding="tight">
          <div className="flex items-end" style={{ gap: 'var(--space-1)', height: 'var(--control-lg)' }}>
            {data.daily.map((d) => (
              <span
                key={d.day}
                title={`${d.day}: ${d.count}`}
                className="flex-1"
                style={{
                  height: `${Math.max(2, (d.count / peak) * 100)}%`,
                  background: d.count > 0 ? 'var(--accent)' : 'var(--surface-3)',
                  borderRadius: 'var(--radius-chip)',
                  minWidth: 'var(--space-1)',
                }}
              />
            ))}
          </div>
          <p style={{ ...meta, marginTop: 'var(--space-2)' }}>
            Occurrences per day. {data.daily.reduce((n, d) => n + d.count, 0)} in the last{' '}
            {data.daily.length} days.
          </p>
        </Card>

        <div style={{ marginTop: 'var(--space-3)' }}>
          {data.groups.length === 0 ? (
            <Card elevation={1}>
              <EmptyState
                icon="check"
                title={state === 'open' ? 'Nothing broken' : `No ${state} errors`}
              >
                {state === 'open'
                  ? 'No unresolved errors in this window.'
                  : 'Nothing has been put in this state yet.'}
              </EmptyState>
            </Card>
          ) : (
            <ul style={{ display: 'grid', gap: 'var(--space-2)' }}>
              {data.groups.map((group) => (
                <li key={group.fingerprint}>
                  <Card elevation={1} padding="tight">
                    <div className="flex items-start" style={{ gap: 'var(--space-3)' }}>
                      <span className="min-w-0 flex-1">
                        <span
                          className="flex flex-wrap items-center"
                          style={{ gap: 'var(--space-2)', marginBottom: 'var(--space-1)' }}
                        >
                          <Badge tone={SEVERITY_TONE[group.severity]}>{group.severity}</Badge>
                          <Badge tone="neutral">{group.surface}</Badge>
                          <Badge tone="neutral">{group.kind}</Badge>
                        </span>
                        <span
                          className="block"
                          style={{
                            fontSize: 'var(--text-body-sm)',
                            fontWeight: 'var(--weight-strong)',
                            fontFamily: 'var(--font-display)',
                            color: 'var(--ink-1)',
                            wordBreak: 'break-word',
                          }}
                        >
                          {group.message}
                        </span>
                        <span className="block" style={{ ...meta, marginTop: 'var(--space-1)' }}>
                          {group.count} occurrence{group.count === 1 ? '' : 's'}
                          {group.sessions > 0 ? ` · ${group.sessions} session${group.sessions === 1 ? '' : 's'}` : ''}
                          {' · last '}
                          {ago(group.lastSeen)}
                          {group.sample?.path ? ` · ${group.sample.path}` : ''}
                        </span>
                      </span>

                      <span className="flex shrink-0 items-center" style={{ gap: 'var(--space-1)' }}>
                        {group.state !== 'resolved' ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            loading={busy === group.fingerprint}
                            onClick={() => triage(group.fingerprint, 'resolved')}
                          >
                            Resolve
                          </Button>
                        ) : null}
                        {group.state !== 'muted' ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            loading={busy === group.fingerprint}
                            onClick={() => triage(group.fingerprint, 'muted')}
                          >
                            Mute
                          </Button>
                        ) : null}
                        {group.state !== 'open' ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            loading={busy === group.fingerprint}
                            onClick={() => triage(group.fingerprint, 'open')}
                          >
                            Reopen
                          </Button>
                        ) : null}
                        <Button
                          variant="ghost"
                          size="sm"
                          icon={expanded === group.fingerprint ? 'minus' : 'plus'}
                          aria-label={expanded === group.fingerprint ? 'Hide the stack' : 'Show the stack'}
                          onClick={() =>
                            setExpanded(expanded === group.fingerprint ? null : group.fingerprint)
                          }
                        />
                      </span>
                    </div>

                    {expanded === group.fingerprint && group.sample ? (
                      <div style={{ marginTop: 'var(--space-3)' }}>
                        <p style={{ ...meta, marginBottom: 'var(--space-1)' }}>
                          Reference {group.fingerprint} · first seen {ago(group.firstSeen)}
                        </p>
                        {/* The stack, monospaced and scrollable rather than wrapped:
                            a wrapped stack trace is unreadable, and this is the one
                            place in the hub where horizontal scroll is right. */}
                        <pre
                          style={{
                            fontSize: 'var(--text-micro)',
                            lineHeight: 'var(--leading-snug)',
                            color: 'var(--ink-2)',
                            background: 'var(--surface-input)',
                            borderRadius: 'var(--radius-row)',
                            padding: 'var(--space-3)',
                            overflowX: 'auto',
                            maxHeight: 'var(--modal-sm)',
                          }}
                        >
                          {group.sample.stack ?? group.sample.message}
                        </pre>
                        {Object.keys(group.sample.context).length > 0 ? (
                          <p style={{ ...meta, marginTop: 'var(--space-2)' }}>
                            {Object.entries(group.sample.context)
                              .filter(([, v]) => v !== null && v !== '')
                              .map(([k, v]) => `${k}: ${v}`)
                              .join(' · ')}
                          </p>
                        ) : null}
                      </div>
                    ) : null}
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {error ? (
        <Note tone="critical" icon="alert-triangle" live="assertive">
          {error}
        </Note>
      ) : null}
    </div>
  )
}
