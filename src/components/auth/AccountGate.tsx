'use client'

import { useEffect, useState } from 'react'
import { ProviderButtons } from './ProviderButtons'
import { fetchAuthContext, authenticateAccount } from '@/lib/auth-client'
import { CheckoutConsent } from '@/components/legal/CheckoutConsent'
import { CheckoutSteps } from '@/components/checkout/CheckoutSteps'
import { PlanBeingBought } from '@/components/checkout/PlanBeingBought'
import { Button } from '@/components/ui/Button'
import { Note } from '@/components/ui/Note'
import { Sheet, SheetBody, SheetFooter, SheetHeader } from '@/components/ui/Sheet'
import { GLASS } from '@/lib/ui/tokens'
import { TERMS_VERSION, DISCLAIMER_VERSION } from '@/lib/legal/content'
import type { ConsentSubmission } from '@/lib/legal/consent'
import type { CheckoutPayload } from '@/lib/checkout/types'

/**
 * Account gate shown before subscription checkout. Email/password signs in
 * inline (no redirect) then resumes checkout via `onAuthenticated`. OAuth
 * stashes the pending order (`/api/checkout/pending`) and redirects to the
 * provider, returning to `/api/checkout/continue` which finalizes server-side.
 *
 * It's also where consent is captured: the health disclaimer and the terms tick
 * -box sit here, at the last step before payment, so nobody subscribes without
 * having been shown them. Both paths carry the consent — inline via
 * `onAuthenticated`, OAuth by stashing it with the pending order — because the
 * server refuses to finalize a checkout without one.
 *
 * ── Why this is a Sheet ──────────────────────────────────────────────────────
 * It used to be a hand-rolled `fixed inset-0` overlay rendered inline. The stack
 * review page renders inside a GSAP-animated wrapper, and a transformed ancestor
 * makes `position: fixed` resolve against THAT rather than the viewport — so the
 * gate opened halfway down the page, below the fold, at the exact moment someone
 * was trying to buy something. The sticky checkout bar on the same page already
 * portals itself for this reason; this one didn't. `Sheet` portals to
 * `document.body`, and brings the scroll lock, focus trap and Escape handling
 * that a hand-rolled overlay never had.
 *
 * The action lives in a pinned `SheetFooter` for the same class of reason: the
 * consent points are long enough to push a button off the bottom of a phone, and
 * the one thing this screen exists to do must not be the part you have to scroll
 * to find.
 */
export function AccountGate({
  payload,
  onAuthenticated,
  onCancel,
}: {
  payload: CheckoutPayload
  onAuthenticated: (consent: ConsentSubmission) => void
  onCancel: () => void
}) {
  const [providers, setProviders] = useState<{ id: string; label: string }[]>([])
  const [mode, setMode] = useState<'signup' | 'login'>('signup')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [consented, setConsented] = useState(false)
  const [consentError, setConsentError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void fetchAuthContext().then((ctx) => setProviders(ctx.providers))
  }, [])

  const consent: ConsentSubmission = {
    accepted: consented,
    termsVersion: TERMS_VERSION,
    disclaimerVersion: DISCLAIMER_VERSION,
  }

  const credentialsValid = /\S+@\S+\.\S+/.test(email) && password.length >= (mode === 'signup' ? 8 : 1)
  const valid = credentialsValid && consented

  /** Shared by both paths: refuse to go anywhere until the box is ticked. */
  const requireConsent = (): boolean => {
    if (consented) return true
    setConsentError('Please confirm you’ve read and agree to the terms and health information.')
    return false
  }

  const submit = async () => {
    if (busy || !credentialsValid) return
    if (!requireConsent()) return
    setBusy(true)
    setError(null)
    const err = await authenticateAccount(mode, email.trim(), password)
    if (err) {
      setError(err)
      setBusy(false)
      return
    }
    onAuthenticated(consent) // resume checkout with the now-signed-in account
  }

  // Stash the pending order before an OAuth redirect so it survives the
  // round-trip — consent included, since the member won't pass through this
  // component again on the way back.
  const stashPending = async () => {
    if (!requireConsent()) throw new Error('consent required')
    const res = await fetch('/api/checkout/pending', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, consent }),
    })
    if (!res.ok) throw new Error('pending stash failed')
  }

  const inputStyle = {
    background: GLASS.surface,
    border: `1px solid ${GLASS.hairline}`,
    color: 'var(--color-text)',
  }

  return (
    <Sheet onClose={onCancel} label="Create your account to subscribe">
      <SheetHeader
        eyebrow="One last step"
        title={mode === 'signup' ? 'Create your account' : 'Welcome back'}
      >
        <CheckoutSteps current="account" />
      </SheetHeader>

      <SheetBody className="space-y-4">
        {/* What they are actually buying. The gate used to open over the stack
            with no figures on it at all, so the last thing anyone saw before
            typing a password was a form. */}
        <PlanBeingBought subscription={payload.subscription} />

        <p className="text-xs text-[var(--color-muted)] leading-relaxed">
          We save your stack and quiz answers to your account so you can log back in to see and
          manage your subscription any time.
        </p>

        <form
          id="account-gate-form"
          onSubmit={(e) => { e.preventDefault(); void submit() }}
          className="space-y-3"
        >
          <input
            type="email" inputMode="email" autoComplete="email" placeholder="you@email.com"
            value={email} onChange={(e) => setEmail(e.target.value)}
            className="w-full px-4 py-3.5 rounded-2xl text-sm outline-none" style={inputStyle}
          />
          <input
            type="password" autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            placeholder={mode === 'signup' ? 'Choose a password (8+ characters)' : 'Password'}
            value={password} onChange={(e) => setPassword(e.target.value)}
            className="w-full px-4 py-3.5 rounded-2xl text-sm outline-none" style={inputStyle}
          />
          {error && <p className="text-xs font-semibold px-1" style={{ color: '#ff6b6b' }} role="alert">{error}</p>}
        </form>

        {providers.length > 0 && (
          <>
            <div className="flex items-center gap-3">
              <div className="h-px flex-1" style={{ background: GLASS.hairline }} />
              <span className="text-[10px] uppercase tracking-widest text-[var(--color-muted)]">or</span>
              <div className="h-px flex-1" style={{ background: GLASS.hairline }} />
            </div>
            <ProviderButtons providers={providers} returnTo="/api/checkout/continue" beforeNavigate={stashPending} />
          </>
        )}

        <CheckoutConsent
          accepted={consented}
          onChange={(next) => { setConsented(next); if (next) setConsentError(null) }}
          error={consentError}
        />

        {/* Said before the button rather than discovered after it. Nobody should
            be surprised by a different website asking for their card. */}
        <Note icon="credit-card">
          Card details are taken on Stripe’s secure page — nothing is charged until you finish there.
        </Note>

        <button
          type="button"
          onClick={() => { setMode(mode === 'signup' ? 'login' : 'signup'); setError(null) }}
          className="text-xs font-semibold underline text-[var(--color-muted)]"
        >
          {mode === 'signup' ? 'Already have an account?' : 'New here? Create one'}
        </button>
      </SheetBody>

      <SheetFooter>
        <Button variant="secondary" onClick={onCancel}>Cancel</Button>
        <Button
          type="submit"
          form="account-gate-form"
          variant="primary"
          iconRight="arrow-right"
          disabled={!valid || busy}
        >
          {busy ? 'One sec…' : 'Continue to payment'}
        </Button>
      </SheetFooter>
    </Sheet>
  )
}
