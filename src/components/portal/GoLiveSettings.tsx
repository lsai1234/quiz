'use client'

import { useCallback, useEffect, useState } from 'react'
import { Badge, Button, Card, Checkbox, Input, Note } from '@/components/system'
import { Icon } from '@/components/ui/Icon'
import type {
  CheckState,
  LiveHoldings,
  PreflightItem,
  ResetGroup,
  ResetGroupId,
  ResetLogEntry,
  ResetPreview,
} from '@/lib/portal/go-live'

/**
 * Going live: the checklist, then the reset.
 *
 * The order on screen is the order of the job. You confirm the environment is
 * configured, you clear the data you made while testing, and only then do you
 * swap the keys — doing the reset *after* the swap is the mistake this whole
 * screen is shaped to prevent.
 *
 * ── Why the reset is this fussy ─────────────────────────────────────────────
 * It is the only irreversible button in the hub. So it asks for three separate
 * acts rather than one: choose what goes, type the word, then press. Each is
 * cheap on the day you mean it and each is a wall on the day you don't. The
 * download sits in the same block because "export first" is advice nobody takes
 * unless it is one click away from the thing they are about to do.
 *
 * The live guard is enforced on the server (`lib/portal/go-live.ts`), not here —
 * this only reports it. A rule that lives in a React component is not a rule.
 */

interface Payload {
  groups: ResetGroup[]
  checklist: PreflightItem[]
  preview: ResetPreview
  selected: ResetGroupId[]
  lastReset: ResetLogEntry | null
}

const STATE_TONE: Record<CheckState, 'positive' | 'attention' | 'critical'> = {
  ok: 'positive',
  warn: 'attention',
  todo: 'critical',
}

const STATE_ICON: Record<CheckState, 'check' | 'info' | 'alert-triangle'> = {
  ok: 'check',
  warn: 'info',
  todo: 'alert-triangle',
}

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

function LiveWarning({ live }: { live: LiveHoldings }) {
  const total = live.orders + live.subscriptions
  if (total === 0) return null
  return (
    <Note tone="critical" icon="lock">
      <strong>There is live data in this database.</strong> {live.orders} order
      {live.orders === 1 ? '' : 's'} and {live.subscriptions} subscription
      {live.subscriptions === 1 ? '' : 's'} were created against a live Stripe key. They
      will <strong>not</strong> be deleted — the reset skips anything marked live, and
      there is no way to override that here. Everything belonging to them is kept too.
    </Note>
  )
}

export function GoLiveSettings() {
  const [data, setData] = useState<Payload | null>(null)
  const [selected, setSelected] = useState<ResetGroupId[]>([])
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<{ total: number } | null>(null)

  const load = useCallback((groups?: ResetGroupId[]) => {
    const query = groups?.length ? `?groups=${groups.join(',')}` : ''
    fetch(`/api/portal/go-live${query}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((payload: Payload) => {
        setData(payload)
        if (!groups) setSelected(payload.selected)
      })
      .catch(() => setError('Could not load the go-live checks.'))
  }, [])

  useEffect(() => load(), [load])

  const toggle = useCallback(
    (id: ResetGroupId, on: boolean) => {
      const next = on ? [...selected, id] : selected.filter((g) => g !== id)
      setSelected(next)
      // Re-price the reset against the new selection, so the number under the
      // button is always the number that button will delete.
      load(next)
    },
    [selected, load],
  )

  async function runReset() {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/portal/go-live', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groups: selected, confirm }),
      })
      const body = await res.json()
      if (!res.ok) {
        setError(body.error ?? 'The reset did not run.')
        return
      }
      setDone({ total: body.total })
      setConfirm('')
      load(selected)
    } catch {
      setError('The reset did not run.')
    } finally {
      setBusy(false)
    }
  }

  if (!data) {
    return <p style={{ fontSize: 'var(--text-body)', color: 'var(--ink-3)' }}>{error ?? 'Loading…'}</p>
  }

  const outstanding = data.checklist.filter((c) => c.state === 'todo').length
  const hasLive = data.preview.live.orders + data.preview.live.subscriptions > 0
  const armed = confirm === 'RESET' && selected.length > 0 && !busy

  return (
    <div className="flex flex-col" style={{ gap: 'var(--space-8)' }}>
      {/* ── 1. The checklist ───────────────────────────────────────────── */}
      <section>
        <div
          className="flex items-center justify-between"
          style={{ gap: 'var(--space-3)', marginBottom: 'var(--space-3)' }}
        >
          <h2 style={label}>Before you switch the keys</h2>
          <Badge tone={outstanding === 0 ? 'positive' : 'attention'}>
            {outstanding === 0 ? 'All clear' : `${outstanding} to do`}
          </Badge>
        </div>

        <ul style={{ display: 'grid', gap: 'var(--space-2)' }}>
          {data.checklist.map((item) => (
            <li key={item.id}>
              <Card elevation={1} padding="tight">
                <div className="flex items-start" style={{ gap: 'var(--space-3)' }}>
                  <span
                    style={{
                      color: `var(--tone-${STATE_TONE[item.state]})`,
                      marginTop: 'var(--space-1)',
                    }}
                  >
                    <Icon name={STATE_ICON[item.state]} size={16} />
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
                      {item.label}
                    </span>
                    <span className="block" style={{ ...meta, marginTop: 'var(--space-1)' }}>
                      {item.detail}
                    </span>
                  </span>
                </div>
              </Card>
            </li>
          ))}
        </ul>

        <div style={{ marginTop: 'var(--space-4)' }}>
          <Note tone="info" icon="info">
            Two things this cannot check for you, because they live in Stripe’s dashboard
            and are invisible from here: the <strong>Billing Portal must be re-enabled in
            live mode</strong> (the test-mode setting does not carry over), and account
            activation must be complete or payouts sit in limbo while charges succeed. Both
            are in{' '}
            <code>docs/STRIPE_GO_LIVE.md</code>.
          </Note>
        </div>
      </section>

      {/* ── 2. The reset ───────────────────────────────────────────────── */}
      <section>
        <h2 style={{ ...label, marginBottom: 'var(--space-3)' }}>Clear the test data</h2>

        <LiveWarning live={data.preview.live} />

        <div style={{ marginTop: hasLive ? 'var(--space-4)' : undefined }}>
        <Card elevation={1}>
          <p style={{ fontSize: 'var(--text-body)', lineHeight: 'var(--leading-loose)', color: 'var(--ink-3)' }}>
            Removes the orders and subscriptions you created while testing, so the first real
            month starts from zero. <strong>Accounts, partners, products, prices and every
            setting are kept</strong> — this clears transactions, not the shop.
          </p>

          <ul style={{ display: 'grid', gap: 'var(--space-2)', marginTop: 'var(--space-5)' }}>
            {data.groups.map((group) => {
              const rows = group.tables.reduce((n, t) => n + (data.preview.byTable[t] ?? 0), 0)
              return (
                <li key={group.id}>
                  <Checkbox
                    label={
                      <span className="flex items-center" style={{ gap: 'var(--space-2)' }}>
                        {group.label}
                        <Badge tone={rows > 0 ? 'accent' : 'neutral'}>{rows} row{rows === 1 ? '' : 's'}</Badge>
                      </span>
                    }
                    hint={group.description}
                    checked={selected.includes(group.id)}
                    onChange={(e) => toggle(group.id, e.currentTarget.checked)}
                  />
                </li>
              )
            })}
          </ul>

          <div
            className="flex flex-wrap items-end"
            style={{ gap: 'var(--space-3)', marginTop: 'var(--space-6)' }}
          >
            {/* Deliberately a plain link, not a fetch-and-blob: the response
                carries a Content-Disposition and the browser saves it. */}
            <Button
              variant="secondary"
              icon="download"
              onClick={() => {
                window.location.href = `/api/portal/go-live?export=${selected.join(',')}`
              }}
              disabled={selected.length === 0}
            >
              Download a copy first
            </Button>
          </div>

          <div style={{ marginTop: 'var(--space-6)' }}>
            <Input
              label="Type RESET to confirm"
              hint={
                selected.length === 0
                  ? 'Nothing is selected, so nothing would be deleted.'
                  : `This will permanently delete ${data.preview.total} row${data.preview.total === 1 ? '' : 's'}. It cannot be undone.`
              }
              value={confirm}
              onChange={(e) => setConfirm(e.currentTarget.value)}
              placeholder="RESET"
              autoComplete="off"
            />
          </div>

          <div style={{ marginTop: 'var(--space-4)' }}>
            <Button variant="destructive" icon="trash" loading={busy} disabled={!armed} onClick={runReset}>
              Clear {data.preview.total} row{data.preview.total === 1 ? '' : 's'}
            </Button>
          </div>

          {done ? (
            <div style={{ marginTop: 'var(--space-4)' }}>
              <Note tone="positive" icon="check" live="polite">
                Cleared {done.total} row{done.total === 1 ? '' : 's'}.
              </Note>
            </div>
          ) : null}

          {error ? (
            <div style={{ marginTop: 'var(--space-4)' }}>
              <Note tone="critical" icon="alert-triangle" live="assertive">
                {error}
              </Note>
            </div>
          ) : null}
        </Card>
        </div>

        {data.lastReset ? (
          <p style={{ ...meta, marginTop: 'var(--space-3)' }}>
            Last reset {new Date(data.lastReset.at).toLocaleString('en-GB')} — {data.lastReset.total}{' '}
            row{data.lastReset.total === 1 ? '' : 's'}
            {data.lastReset.by ? `, by ${data.lastReset.by}` : ''} (Stripe: {data.lastReset.world}).
          </p>
        ) : null}
      </section>
    </div>
  )
}
