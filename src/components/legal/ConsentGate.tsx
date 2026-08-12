'use client'

import { useState } from 'react'
import { CheckoutConsent } from './CheckoutConsent'
import { TERMS_VERSION, DISCLAIMER_VERSION } from '@/lib/legal/content'
import type { ConsentSubmission, ConsentVersions } from '@/lib/legal/consent'

const ACCENT = '#00D4FF'

/**
 * Consent, for a member who is ALREADY signed in.
 *
 * `AccountGate` captures consent on the way through creating an account, which
 * covered every subscriber back when subscribing meant signing up. A member who
 * was already signed in never passed through it — they tapped "Start
 * subscription", the server refused a checkout with no consent, and the page
 * showed them a red banner asking them to confirm terms it had never put in
 * front of them. This is the missing step: same documents, same tick-box, no
 * account questions.
 *
 * The versions submitted are the ones the SERVER said it is serving (it hands
 * them back with the refusal), falling back to the build-time constants for a
 * direct open. That's what stops a member on a tab that predates a deploy from
 * looping on `stale-version` forever.
 */
export function ConsentGate({
  versions,
  notice,
  onAccept,
  onCancel,
}: {
  /** Versions the server is currently serving. Null → use this build's. */
  versions?: ConsentVersions | null
  /** Why we're asking again, when it isn't simply "you haven't yet". */
  notice?: string | null
  onAccept: (consent: ConsentSubmission) => void
  onCancel: () => void
}) {
  const [consented, setConsented] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = () => {
    if (!consented) {
      setError('Please tick the box to confirm you’ve read and agree.')
      return
    }
    onAccept({
      accepted: true,
      termsVersion: versions?.terms ?? TERMS_VERSION,
      disclaimerVersion: versions?.disclaimer ?? DISCLAIMER_VERSION,
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm px-4 py-6">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Confirm the subscription terms"
        className="w-full max-w-sm rounded-3xl p-6 max-h-[92vh] overflow-y-auto"
        style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)' }}
      >
        <p
          className="text-[10px] font-bold tracking-widest uppercase mb-2"
          style={{ color: ACCENT, fontFamily: 'var(--font-display)' }}
        >
          One last step
        </p>
        <h2
          className="text-2xl font-black mb-1.5"
          style={{ color: 'var(--color-text)', fontFamily: 'var(--font-display)' }}
        >
          Before you subscribe
        </h2>
        <p className="text-sm text-[var(--color-muted)] leading-relaxed">
          {notice ?? 'Have a read, then tick the box to start your subscription.'}
        </p>

        <CheckoutConsent
          accepted={consented}
          onChange={(next) => {
            setConsented(next)
            if (next) setError(null)
          }}
          error={error}
        />

        <button
          type="button"
          onClick={submit}
          disabled={!consented}
          className="w-full mt-5 py-4 rounded-2xl text-sm font-bold tracking-wide bg-[var(--color-accent)] text-[var(--color-bg)] active:scale-95 transition-all disabled:opacity-50"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          Agree & start subscription →
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="w-full mt-3 text-xs font-semibold text-[var(--color-muted)]"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
