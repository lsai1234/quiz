'use client'

import { useState } from 'react'
import { Button, Card, Input, Note } from '@/components/system'

export interface DeletionCheck {
  ok: boolean
  reason?: string
  summary: string
  effects: string[]
}

interface Props {
  /** What is being destroyed, in the founder's words: "partner", "order". */
  noun: string
  /** Asks the server what would happen. Nothing is destroyed. */
  onCheck: () => Promise<DeletionCheck | null>
  /** Does it. Resolves to an error message, or null on success. */
  onDelete: (reason: string) => Promise<string | null>
  /** Called once it is gone, so the screen can close itself. */
  onDeleted: () => void
}

/**
 * The one control in the hub that cannot be undone.
 *
 * ── Why it asks the server before it asks the founder ───────────────────────
 * A confirm that says "are you sure?" and nothing else is a dare, not a
 * question. This one presses `delete-check` first and shows what the server
 * says will actually happen — which partner, which email, whose commission goes
 * with them — so the sentence a founder is agreeing to is about their own data
 * rather than about deletion in general.
 *
 * It is also where a refusal surfaces. An order already with the supplier and a
 * partner whose commission has been paid cannot be deleted at all, and the
 * reason names what to do instead. Finding that out here costs a tap; finding
 * it out from a failed request after a confirm reads as a broken button.
 *
 * ── Why the reason box is not optional-looking ──────────────────────────────
 * It IS optional, and it is on screen anyway, because the thing that makes an
 * irreversible action safe six months later is somebody having typed why. It
 * goes on the tombstone (`deletion_log`), not on the record — the record is
 * about to stop existing.
 */
export function DangerZone({ noun, onCheck, onDelete, onDeleted }: Props) {
  const [check, setCheck] = useState<DeletionCheck | null>(null)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function ask() {
    setBusy(true)
    setError(null)
    try {
      const result = await onCheck()
      if (!result) {
        setError('Could not check that.')
        return
      }
      setCheck(result)
    } finally {
      setBusy(false)
    }
  }

  async function confirm() {
    setBusy(true)
    setError(null)
    try {
      const failure = await onDelete(reason)
      if (failure) {
        setError(failure)
        return
      }
      onDeleted()
    } finally {
      setBusy(false)
    }
  }

  if (!check) {
    return (
      <Card as="section" solid className="mb-3">
        <h3
          style={{
            fontSize: 'var(--text-body-sm)',
            fontWeight: 'var(--weight-display)',
            fontFamily: 'var(--font-display)',
            color: 'var(--ink-1)',
          }}
        >
          Delete this {noun}
        </h3>
        <p
          style={{
            fontSize: 'var(--text-meta)',
            lineHeight: 'var(--leading-snug)',
            color: 'var(--ink-3)',
            marginTop: 'var(--space-1)',
            marginBottom: 'var(--space-3)',
          }}
        >
          Gone for good, not hidden. We will show you exactly what goes before anything happens.
        </p>
        <Button variant="secondary" size="sm" loading={busy} onClick={ask}>
          Delete permanently…
        </Button>
        {error && (
          <div role="status" style={{ marginTop: 'var(--space-3)' }}>
            <Note tone="critical">{error}</Note>
          </div>
        )}
      </Card>
    )
  }

  return (
    <Card as="section" solid tone={check.ok ? 'critical' : undefined} className="mb-3">
      <h3
        style={{
          fontSize: 'var(--text-body-sm)',
          fontWeight: 'var(--weight-display)',
          fontFamily: 'var(--font-display)',
          color: 'var(--ink-1)',
        }}
      >
        {check.ok ? `Delete this ${noun}?` : `This ${noun} cannot be deleted`}
      </h3>

      {!check.ok ? (
        <>
          <div style={{ marginTop: 'var(--space-3)' }}>
            <Note tone="attention">{check.reason}</Note>
          </div>
          <div style={{ marginTop: 'var(--space-3)' }}>
            <Button variant="secondary" size="sm" onClick={() => setCheck(null)}>
              Back
            </Button>
          </div>
        </>
      ) : (
        <>
          <p
            style={{
              fontSize: 'var(--text-body-sm)',
              fontWeight: 'var(--weight-strong)',
              color: 'var(--ink-1)',
              marginTop: 'var(--space-2)',
            }}
          >
            {check.summary}
          </p>
          <ul style={{ display: 'grid', gap: 'var(--space-1)', marginTop: 'var(--space-2)' }}>
            {check.effects.map((effect) => (
              <li
                key={effect}
                style={{
                  fontSize: 'var(--text-meta)',
                  lineHeight: 'var(--leading-snug)',
                  color: 'var(--ink-2)',
                }}
              >
                {effect}
              </li>
            ))}
          </ul>

          <div style={{ marginTop: 'var(--space-3)' }}>
            <Input
              label="Why (optional)"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Duplicate account"
              hint="Kept on the deletion record, so this is explainable later."
            />
          </div>

          {error && (
            <div role="status" style={{ marginTop: 'var(--space-3)' }}>
              <Note tone="critical">{error}</Note>
            </div>
          )}

          <div className="flex" style={{ gap: 'var(--space-2)', marginTop: 'var(--space-4)' }}>
            <Button variant="secondary" size="sm" onClick={() => setCheck(null)} disabled={busy}>
              Keep it
            </Button>
            <Button variant="destructive" size="sm" loading={busy} onClick={confirm}>
              Delete for good
            </Button>
          </div>
        </>
      )}
    </Card>
  )
}
