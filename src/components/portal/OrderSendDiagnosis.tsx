'use client'

import { useState } from 'react'
import { Button, Disclosure, Note } from '@/components/system'
import { CheckList, noteToneFor, type CheckItem, type CheckStatus } from './CheckList'

/**
 * "Why won't this order send?", answered on the order itself.
 *
 * Runs `lib/orders/send-diagnostics` — PowerBody's last answer, our own gate,
 * the address as their form receives it, each item live at PowerBody, whether
 * they already hold it — and leads with the one sentence that says what to do.
 * Read-only: nothing here sends, updates or cancels.
 *
 * The raw material is kept underneath, collapsed: what they replied and what we
 * sent. It is what PowerBody's support will ask for, so it is one tap away
 * rather than something to reconstruct from logs.
 */

interface Attempt {
  at: string
  ok: boolean
  outcome: string
  code: string | null
  reason: string | null
  reply: string | null
  request: unknown
  error: string | null
}

interface Diagnosis {
  ranAt: string
  headline: { status: CheckStatus; sentence: string }
  checks: CheckItem[]
  lastAttempt: Attempt | null
  lastAttemptFromTimeline: boolean
  payload: unknown | null
}

const PRE_STYLE = {
  fontSize: 'var(--text-micro)',
  lineHeight: 'var(--leading-snug)',
  color: 'var(--ink-2)',
  background: 'var(--surface-input)',
  borderRadius: 'var(--radius-row)',
  padding: 'var(--space-3)',
  maxHeight: 'var(--modal-sm)',
  overflow: 'auto',
  whiteSpace: 'pre-wrap',
  overflowWrap: 'anywhere',
} as const

export function OrderSendDiagnosis({ orderId }: { orderId: string }) {
  const [diagnosis, setDiagnosis] = useState<Diagnosis | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function run() {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/portal/orders/${orderId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'diagnose' }),
      })
      const d = await res.json().catch(() => ({}))
      if (res.ok && d.diagnosis) setDiagnosis(d.diagnosis as Diagnosis)
      else setError(d.error ?? 'The checks could not be run.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The checks could not be run.')
    } finally {
      setBusy(false)
    }
  }

  const sent = diagnosis?.lastAttempt?.request ?? null

  return (
    <div className="flex flex-col" style={{ gap: 'var(--space-3)' }}>
      <div className="flex flex-wrap items-center" style={{ gap: 'var(--space-3)' }}>
        <Button variant="secondary" size="sm" icon="activity" loading={busy} onClick={() => void run()}>
          {diagnosis ? 'Check again' : 'Find out why'}
        </Button>
        <span style={{ fontSize: 'var(--text-meta)', color: 'var(--ink-3)' }}>
          {busy
            ? 'Asking PowerBody about each item — this can take half a minute.'
            : 'Read-only: checks the items and the address with PowerBody. Sends nothing.'}
        </span>
      </div>

      {error && (
        <Note tone="critical" icon="alert-triangle" live="assertive">
          {error}
        </Note>
      )}

      {diagnosis && (
        <>
          <Note tone={noteToneFor(diagnosis.headline.status)} live="polite">
            {diagnosis.headline.sentence}
          </Note>

          <CheckList checks={diagnosis.checks} />

          {diagnosis.lastAttempt?.reply && (
            <Disclosure summary="What PowerBody replied, word for word">
              <pre style={PRE_STYLE}>{diagnosis.lastAttempt.reply}</pre>
            </Disclosure>
          )}

          {sent != null && (
            <Disclosure summary="What we sent last time">
              <pre style={PRE_STYLE}>{JSON.stringify(sent, null, 2)}</pre>
            </Disclosure>
          )}

          {diagnosis.payload != null && (
            <Disclosure summary={sent != null ? 'What we would send now' : 'What we send to PowerBody'}>
              <pre style={PRE_STYLE}>{JSON.stringify(diagnosis.payload, null, 2)}</pre>
            </Disclosure>
          )}
        </>
      )}
    </div>
  )
}
