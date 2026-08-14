'use client'

import { useEffect, useState } from 'react'
import { CheckoutConsent } from './CheckoutConsent'
import { CheckoutSteps } from '@/components/checkout/CheckoutSteps'
import { PlanBeingBought } from '@/components/checkout/PlanBeingBought'
import { Button } from '@/components/ui/Button'
import { Note } from '@/components/ui/Note'
import { Sheet, SheetBody, SheetFooter, SheetHeader } from '@/components/ui/Sheet'
import { GLASS } from '@/lib/ui/tokens'
import { fetchAuthContext } from '@/lib/auth-client'
import { TERMS_VERSION, DISCLAIMER_VERSION } from '@/lib/legal/content'
import type { ConsentSubmission, ConsentVersions } from '@/lib/legal/consent'
import type { MemberSubscription } from '@/lib/recharge/types'

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
 *
 * A `Sheet`, like the account gate and for the same reason — see `AccountGate`
 * for why a hand-rolled overlay opened halfway down this particular page.
 */
export function ConsentGate({
  versions,
  notice,
  subscription,
  onAccept,
  onCancel,
}: {
  /** Versions the server is currently serving. Null → use this build's. */
  versions?: ConsentVersions | null
  /** Why we're asking again, when it isn't simply "you haven't yet". */
  notice?: string | null
  /** What they're about to be billed for, restated over the covered receipt. */
  subscription?: MemberSubscription
  onAccept: (consent: ConsentSubmission) => void
  onCancel: () => void
}) {
  const [consented, setConsented] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /**
   * Who is about to be charged.
   *
   * A member signed in from a session weeks ago is never asked to log in, so
   * the first they'd otherwise hear of WHICH account is subscribing is the
   * receipt. Saying it here — with a way out — is the difference between "no
   * login needed, nice" and finding a monthly plan on the wrong account.
   */
  const [account, setAccount] = useState<string | null>(null)
  const [signingOut, setSigningOut] = useState(false)

  useEffect(() => {
    void fetchAuthContext().then((ctx) => setAccount(ctx.user?.email ?? ctx.user?.name ?? null))
  }, [])

  const signOut = async () => {
    setSigningOut(true)
    try {
      await fetch('/api/auth/logout', { method: 'POST' })
    } catch {
      // Nothing to do about it here; closing the gate is still the right move,
      // and the next checkout will ask them to sign in anyway.
    }
    // Back to the basket signed out: their stack is untouched, and starting the
    // subscription again brings up the account gate.
    onCancel()
  }

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
    <Sheet onClose={onCancel} label="Confirm the subscription terms">
      <SheetHeader eyebrow="One last step" title="Before you subscribe">
        <CheckoutSteps current="terms" />
      </SheetHeader>

      <SheetBody className="space-y-4">
        {subscription && <PlanBeingBought subscription={subscription} />}

        <p className="text-xs text-[var(--color-muted)] leading-relaxed">
          {notice ?? 'Have a read, then tick the box to start your subscription.'}
        </p>

        {account && (
          <div
            className="rounded-2xl px-4 py-3 flex items-center justify-between gap-3"
            style={{ background: GLASS.surface, border: `1px solid ${GLASS.hairline}` }}
          >
            <p className="text-[11px] leading-relaxed text-[var(--color-text-2)] min-w-0">
              You’re already signed in — this will subscribe{' '}
              <span className="font-bold break-all" style={{ color: 'var(--color-text)' }}>
                {account}
              </span>
              .
            </p>
            <button
              type="button"
              onClick={() => void signOut()}
              disabled={signingOut}
              className="text-[10px] font-semibold underline flex-shrink-0 disabled:opacity-50"
              style={{ color: 'var(--color-muted)' }}
            >
              {signingOut ? 'Signing out…' : 'Not you?'}
            </button>
          </div>
        )}

        <CheckoutConsent
          accepted={consented}
          onChange={(next) => {
            setConsented(next)
            if (next) setError(null)
          }}
          error={error}
        />

        <Note icon="credit-card">
          Card details are taken on Stripe’s secure page — nothing is charged until you finish there.
        </Note>
      </SheetBody>

      <SheetFooter>
        <Button variant="secondary" onClick={onCancel}>Cancel</Button>
        <Button variant="primary" iconRight="arrow-right" onClick={submit} disabled={!consented}>
          Continue to payment
        </Button>
      </SheetFooter>
    </Sheet>
  )
}
