'use client'

import { useEffect, useRef, useState } from 'react'
import { Button, Input, Modal, ModalBody, ModalFooter, ModalHeader, Note } from '@/components/system'
import { ForgotPassword } from './ForgotPassword'
import { ProviderButtons } from './ProviderButtons'
import { fetchAuthContext, authenticateAccount } from '@/lib/auth-client'
import { CheckoutConsent } from '@/components/legal/CheckoutConsent'
import { CheckoutSteps } from '@/components/checkout/CheckoutSteps'
import { PlanBeingBought } from '@/components/checkout/PlanBeingBought'
import { TERMS_VERSION, DISCLAIMER_VERSION } from '@/lib/legal/content'
import type { ConsentSubmission } from '@/lib/legal/consent'
import type { CheckoutPayload } from '@/lib/checkout/types'

const CONSENT_REQUIRED = 'Please confirm you’ve read and agree to the terms and health information.'

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
 * ── Why this is a sheet ──────────────────────────────────────────────────────
 * It used to be a hand-rolled `fixed inset-0` overlay rendered inline. The stack
 * review page renders inside a GSAP-animated wrapper, and a transformed ancestor
 * makes `position: fixed` resolve against THAT rather than the viewport — so the
 * gate opened halfway down the page, below the fold, at the exact moment someone
 * was trying to buy something. The sticky checkout bar on the same page already
 * portals itself for this reason; this one didn't. `Modal` portals to
 * `document.body`, and brings the scroll lock, focus trap and Escape handling
 * that a hand-rolled overlay never had.
 *
 * The action lives in a pinned `ModalFooter` for the same class of reason: the
 * consent points are long enough to push a button off the bottom of a phone, and
 * the one thing this screen exists to do must not be the part you have to scroll
 * to find.
 *
 * ── Why the OAuth buttons answer back ────────────────────────────────────────
 * Those same long consent points are why "Continue with Google" reported dead.
 * The provider buttons take a pre-step here (`stashPending`) rather than being
 * plain links, and both ways it can refuse — an unticked box, a failed stash —
 * used to end in silence: the box's error message renders below the buttons,
 * under two panels of legal copy, off the bottom of a phone. A tap did nothing
 * you could see. So every refusal now says so next to the button that was
 * pressed, and an unticked box additionally scrolls itself into view and takes
 * focus.
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
  const [canResetPassword, setCanResetPassword] = useState(false)
  const [mode, setMode] = useState<'signup' | 'login' | 'forgot'>('signup')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [consented, setConsented] = useState(false)
  const [consentError, setConsentError] = useState<string | null>(null)
  const [providerError, setProviderError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const consentBox = useRef<HTMLInputElement>(null)

  useEffect(() => {
    void fetchAuthContext().then((ctx) => {
      setProviders(ctx.providers)
      setCanResetPassword(ctx.canResetPassword)
    })
  }, [])

  const consent: ConsentSubmission = {
    accepted: consented,
    termsVersion: TERMS_VERSION,
    disclaimerVersion: DISCLAIMER_VERSION,
  }

  const credentialsValid = /\S+@\S+\.\S+/.test(email) && password.length >= (mode === 'signup' ? 8 : 1)
  const valid = credentialsValid && consented

  /**
   * Shared by both paths: refuse to go anywhere until the box is ticked — and
   * put the box in front of them, because it is far enough down the sheet's
   * scrolling body that an error set on it can be read by nobody.
   */
  const requireConsent = (): boolean => {
    if (consented) return true
    setConsentError(CONSENT_REQUIRED)
    consentBox.current?.scrollIntoView?.({ behavior: 'smooth', block: 'center' })
    consentBox.current?.focus({ preventScroll: true })
    return false
  }

  const submit = async () => {
    if (busy || !credentialsValid || mode === 'forgot') return
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
  //
  // Every `throw` here aborts the redirect, so every `throw` first leaves a
  // reason on `providerError`; otherwise the button simply appears not to work.
  const stashPending = async () => {
    setProviderError(null)
    if (!requireConsent()) {
      setProviderError(CONSENT_REQUIRED)
      throw new Error('consent required')
    }

    let res: Response
    try {
      res = await fetch('/api/checkout/pending', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, consent }),
      })
    } catch {
      setProviderError('We couldn’t save your stack. Check your connection and try again.')
      throw new Error('pending stash failed')
    }
    if (!res.ok) {
      setProviderError(
        'Something went wrong saving your stack. Try again, or create your account with an email address above.',
      )
      throw new Error('pending stash failed')
    }
  }

  /**
   * Resetting a password without losing the sale.
   *
   * The link in the email opens the hub, not this sheet, and there is no way
   * around that: the sheet lives inside a checkout that exists only in this tab.
   * So the copy tells them exactly what will happen — set the password over
   * there, come back here, sign in with it — rather than letting them discover
   * on their own that the thing they were buying is somewhere else now.
   *
   * Their stack survives the round trip; it is held in the store, not in this
   * component.
   */
  if (mode === 'forgot') {
    return (
      <Modal onClose={onCancel} presentation="sheet" label="Reset your password">
        <ModalHeader eyebrow="Forgotten password" title="We’ll email you a link">
          <CheckoutSteps current="account" />
        </ModalHeader>

        <ModalBody className="space-y-4">
          <ForgotPassword
            initialEmail={email}
            backLabel="Back to sign in"
            onBack={() => { setMode('login'); setError(null) }}
          />
          <Note icon="info">
            The link opens your hub in a new page. Set your password there, then come back to this
            tab and sign in with it — your stack is still here.
          </Note>
        </ModalBody>

        <ModalFooter>
          <Button variant="secondary" onClick={onCancel}>Cancel</Button>
          <Button variant="ghost" onClick={() => { setMode('login'); setError(null) }}>
            Back to sign in
          </Button>
        </ModalFooter>
      </Modal>
    )
  }

  return (
    <Modal onClose={onCancel} presentation="sheet" label="Create your account to subscribe">
      <ModalHeader
        eyebrow="One last step"
        title={mode === 'signup' ? 'Create your account' : 'Welcome back'}
      >
        <CheckoutSteps current="account" />
      </ModalHeader>

      <ModalBody className="space-y-4">
        {/* What they are actually buying. The gate used to open over the stack
            with no figures on it at all, so the last thing anyone saw before
            typing a password was a form. */}
        <PlanBeingBought subscription={payload.subscription} />

        <p className="text-xs text-[var(--ink-3)] leading-relaxed">
          We save your stack and quiz answers to your account so you can log back in to see and
          manage your subscription any time.
        </p>

        <form
          id="account-gate-form"
          onSubmit={(e) => { e.preventDefault(); void submit() }}
          className="space-y-3"
        >
          {/* `hideLabel`: named for a screen reader, undrawn above a two-field
              form that already says what it is. They had a placeholder and
              nothing else, and a placeholder disappears as you type. */}
          <Input
            label="Email address"
            hideLabel
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="you@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Input
            label="Password"
            hideLabel
            type="password"
            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            placeholder={mode === 'signup' ? 'Choose a password (8+ characters)' : 'Password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {error && (
            <Note icon="alert-triangle" tone="critical" live="assertive">
              {error}
            </Note>
          )}
        </form>

        {providers.length > 0 && (
          <>
            <div className="flex items-center gap-3">
              <div className="h-px flex-1" style={{ background: 'var(--edge)' }} />
              <span className="text-[10px] uppercase tracking-widest text-[var(--ink-3)]">or</span>
              <div className="h-px flex-1" style={{ background: 'var(--edge)' }} />
            </div>
            <ProviderButtons
              providers={providers}
              returnTo="/api/checkout/continue"
              beforeNavigate={stashPending}
              error={providerError}
            />
          </>
        )}

        <CheckoutConsent
          boxRef={consentBox}
          accepted={consented}
          onChange={(next) => {
            setConsented(next)
            if (next) { setConsentError(null); setProviderError(null) }
          }}
          error={consentError}
        />

        {/* Said before the button rather than discovered after it. Nobody should
            be surprised by a different website asking for their card. */}
        <Note icon="credit-card">
          Card details are taken on Stripe’s secure page — nothing is charged until you finish there.
        </Note>

        <div className="flex items-center justify-between gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => { setMode(mode === 'signup' ? 'login' : 'signup'); setError(null) }}
          >
            {mode === 'signup' ? 'Already have an account?' : 'New here? Create one'}
          </Button>

          {/* Only when signing in, and only when a link can actually be sent.
              A returning member who cannot remember their password is otherwise
              stuck one step from paying, with no way forward that keeps the
              stack they just built. */}
          {mode === 'login' && canResetPassword && (
            <Button variant="ghost" size="sm" onClick={() => { setMode('forgot'); setError(null) }}>
              Forgotten it?
            </Button>
          )}
        </div>
      </ModalBody>

      <ModalFooter>
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
      </ModalFooter>
    </Modal>
  )
}
