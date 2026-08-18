'use client'

import { useState } from 'react'
import { Button, Input, Note } from '@/components/system'
import { Eyebrow } from '@/components/hub/Eyebrow'

/**
 * Partner sign-in.
 *
 * The error is whatever the server said, verbatim: it deliberately does not
 * distinguish a wrong password from an unknown email, and rephrasing it here
 * would be a good way to leak the difference back.
 */
export function PartnerLogin({ canResetPassword = false }: { canResetPassword?: boolean }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [forgot, setForgot] = useState(false)
  const [resetSent, setResetSent] = useState(false)

  const valid = /\S+@\S+\.\S+/.test(email) && password.length > 0
  const emailValid = /\S+@\S+\.\S+/.test(email)

  /**
   * Ask for a reset link.
   *
   * The screen used to say "email us and we'll send another", which meant a
   * partner locked out on a Saturday could not see their own commission until
   * somebody read their message on Monday. Same wording as the customer flow on
   * the way back — "if we have an account" — because the server deliberately
   * does not say whether this address is one of ours.
   */
  async function requestReset(e: React.FormEvent) {
    e.preventDefault()
    if (!emailValid || loading) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/partner/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      })
      if (res.ok) {
        setResetSent(true)
        return
      }
      const d = await res.json().catch(() => ({}))
      setError(d.error ?? 'That did not work.')
    } catch {
      setError('Could not reach us — check your connection and try again.')
    } finally {
      setLoading(false)
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!valid || loading) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/partner/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      })
      if (res.ok) {
        window.location.reload()
        return
      }
      const d = await res.json().catch(() => ({}))
      setError(d.error ?? 'That did not work.')
    } catch {
      setError('Could not reach us — check your connection and try again.')
    } finally {
      setLoading(false)
    }
  }

  // `my-hub` on the wrapper: signed out, this screen IS the region, and the
  // password fields guarding a partner account are exactly the controls the
  // focus floor must not miss. Same reason `PortalLogin` carries `founder-hub`.
  const wrap =
    'my-hub min-h-screen flex flex-col items-center justify-center px-6 max-w-sm mx-auto text-center'

  if (forgot) {
    return (
      <div className={wrap} style={{ background: 'var(--ground-base)' }}>
        <Eyebrow color="var(--accent)" className="mb-2">CHRGD Partners</Eyebrow>
        <h1 style={{ fontSize: 'var(--text-hero)', fontWeight: 'var(--weight-display)', fontFamily: 'var(--font-display)', letterSpacing: 'var(--tracking-display)', lineHeight: 'var(--leading-tight)', color: 'var(--ink-1)', marginBottom: 'var(--space-2)' }}>
          Forgotten password
        </h1>

        {resetSent ? (
          <>
            <p style={{ fontSize: 'var(--text-body-sm)', lineHeight: 'var(--leading-snug)', color: 'var(--ink-3)', marginBottom: 'var(--space-6)' }}>
              If we have a partner account for <strong>{email.trim()}</strong>, a link to set a new
              password is on its way. It works once, for the next 60 minutes.
            </p>
            <Button variant="ghost" size="sm" onClick={() => { setForgot(false); setResetSent(false) }}>
              Back to sign-in
            </Button>
          </>
        ) : (
          <>
            <p style={{ fontSize: 'var(--text-body-sm)', lineHeight: 'var(--leading-snug)', color: 'var(--ink-3)', marginBottom: 'var(--space-6)' }}>
              Type the email on your partner account and we’ll send a link to set a new one.
            </p>
            <form onSubmit={requestReset} className="w-full space-y-3">
              <Input
                label="Email address"
                hideLabel
                type="email"
                inputMode="email"
                autoComplete="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setError(null) }}
              />

              {/* Was a hardcoded `#f87171` — a third red, differing from both the
                  token and the other hardcoded one in this directory. */}
              {error && (
                <Note icon="alert-triangle" tone="critical" live="assertive">
                  {error}
                </Note>
              )}

              <Button type="submit" variant="primary" size="lg" fullWidth loading={loading} disabled={!emailValid}>
                Email me a link
              </Button>
            </form>
            <Button variant="ghost" size="sm" className="mt-5" onClick={() => { setForgot(false); setError(null) }}>
              Back to sign-in
            </Button>
          </>
        )}
      </div>
    )
  }

  return (
    <div className={wrap} style={{ background: 'var(--ground-base)' }}>
      <Eyebrow color="var(--accent)" className="mb-2">CHRGD Partners</Eyebrow>
      <h1 style={{ fontSize: 'var(--text-hero)', fontWeight: 'var(--weight-display)', fontFamily: 'var(--font-display)', letterSpacing: 'var(--tracking-display)', lineHeight: 'var(--leading-tight)', color: 'var(--ink-1)', marginBottom: 'var(--space-2)' }}>
        Partner sign-in
      </h1>
      <p style={{ fontSize: 'var(--text-body-sm)', lineHeight: 'var(--leading-snug)', color: 'var(--ink-3)', marginBottom: 'var(--space-6)' }}>
        Your code, your numbers and your terms.
      </p>

      <form onSubmit={submit} className="w-full space-y-3">
        {/* Named, not just placeheld. Neither of these had a label of any kind,
            so a partner on a screen reader met two unnamed edit boxes. */}
        <Input
          label="Email address"
          hideLabel
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <Input
          label="Password"
          hideLabel
          type="password"
          autoComplete="current-password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        {error && (
          <Note icon="alert-triangle" tone="critical" live="assertive">
            {error}
          </Note>
        )}

        <Button type="submit" variant="primary" size="lg" fullWidth loading={loading} disabled={!valid}>
          Sign in
        </Button>
      </form>

      {canResetPassword && (
        <Button variant="ghost" size="sm" className="mt-5" onClick={() => { setForgot(true); setError(null) }}>
          Forgotten your password?
        </Button>
      )}

      <p style={{ fontSize: 'var(--text-meta)', lineHeight: 'var(--leading-snug)', color: 'var(--ink-3)', marginTop: 'var(--space-6)' }}>
        {canResetPassword
          ? 'Haven’t set a password yet? Use the link we sent you, or ask for a new one above.'
          : 'Haven’t set a password yet? Use the link we sent you. Lost it, or need a new one — email us and we’ll send another.'}
      </p>
    </div>
  )
}
