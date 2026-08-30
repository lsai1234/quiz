'use client'

import { useState } from 'react'
import { Button, Input, Note, buttonSurface } from '@/components/system'

/**
 * The member's own data controls, in their account rather than in an email to
 * support.
 *
 * Articles 15, 17 and 20 are rights, not favours, and a right that needs a
 * support ticket is one most people never exercise. Both actions here are
 * self-service and immediate.
 *
 * The asymmetry between them is deliberate. Downloading is safe and repeatable,
 * so it is one tap. Deleting is neither, so it asks for the word first — an
 * undoable-by-nobody action sitting one tap away from "pause my plan" is a
 * support queue waiting to happen.
 *
 * `destructive` is the right variant here by the system's own rule: it is for
 * actions that destroy data that does not come back, which is exactly this, and
 * explicitly NOT for a member managing their own plan.
 */
export function YourData() {
  const [confirming, setConfirming] = useState(false)
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  async function remove() {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/hub/delete-account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: 'DELETE' }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data?.error ?? 'We could not complete that. Please try again.')
        return
      }
      setDone(true)
      // Straight to the front door: the session row is already gone, so every
      // hub route would bounce them to sign-in anyway.
      window.location.href = '/'
    } catch {
      setError('We could not reach the server. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  if (done) {
    return (
      <Note tone="positive" live="polite">
        Your account has been deleted. Taking you back to the homepage…
      </Note>
    )
  }

  return (
    <section className="flex flex-col gap-5">
      <div>
        <h3 className="text-base font-black mb-1">Your data</h3>
        <p className="text-sm leading-relaxed text-[var(--ink-2)]">
          What we hold and why is set out in our{' '}
          <a href="/legal/privacy" className="underline">privacy notice</a>.
        </p>
      </div>

      <div className="flex flex-col gap-2 items-start">
        <p className="text-sm leading-relaxed text-[var(--ink-2)]">
          Download everything we have about you — your answers, your plan, your orders and what
          you agreed to — as a single file.
        </p>
        {/* A plain link rather than a fetch: the browser's own download handling
            beats anything rebuilt from a blob, and it uses the
            Content-Disposition the route already sets. */}
        <a href="/api/hub/data-export" download {...buttonSurface()}>
          Download my data
        </a>
      </div>

      <div className="flex flex-col gap-3 pt-4" style={{ borderTop: '1px solid var(--edge)' }}>
        <p className="text-sm leading-relaxed text-[var(--ink-2)]">
          Deleting removes your quiz answers, your plan, your check-ins and your shared cards. We
          keep order records for six years because tax law requires it, and the record of what you
          agreed to. This cannot be undone.
        </p>

        {!confirming ? (
          <div>
            <Button variant="destructive" onClick={() => setConfirming(true)}>
              Delete my account
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <Input
              label="Type DELETE to confirm"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoComplete="off"
              error={error ?? undefined}
            />
            <div className="flex gap-2 items-center">
              <Button
                variant="destructive"
                onClick={remove}
                disabled={typed !== 'DELETE'}
                loading={busy}
              >
                Delete for good
              </Button>
              <Button
                variant="ghost"
                onClick={() => { setConfirming(false); setTyped(''); setError(null) }}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
      </div>
    </section>
  )
}
