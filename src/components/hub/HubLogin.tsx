'use client'

import { useEffect, useState } from 'react'
import { Eyebrow } from './Eyebrow'
import { Button, Input, Note } from '@/components/system'
import { ForgotPassword } from '@/components/auth/ForgotPassword'
import { ProviderButtons } from '@/components/auth/ProviderButtons'
import { CHRGDMark } from '@/components/brand/CHRGDLogo'
import { tint } from '@/lib/ui/tokens'

interface Props {
  /** Sign in or create an account. Resolves to an error message, or null on success. */
  onAuthenticate: (mode: 'login' | 'signup', email: string, password: string) => Promise<string | null>
  loading?: boolean
  /** OAuth providers the server has configured (which buttons to show). */
  providers?: { id: string; label: string }[]
  /**
   * Whether a reset link can actually be emailed. False hides the way in
   * entirely — a "forgot password?" link on a deployment with no mail provider
   * sends the one member who most needs help to wait for an email that is never
   * coming.
   */
  canResetPassword?: boolean
}

export function HubLogin({ onAuthenticate, loading, providers = [], canResetPassword = false }: Props) {
  const [mode, setMode] = useState<'login' | 'signup' | 'forgot'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [failedProviderId, setFailedProviderId] = useState<string | null>(null)

  /**
   * A social sign-in that failed comes back here as `?auth_error=<provider>`,
   * and until something read it the member landed on a login screen that looked
   * exactly like the one they'd just left — no error, no explanation, nothing
   * to suggest their tap had done anything at all.
   *
   * Read once and the URL cleaned straight away, so a refresh doesn't resurrect
   * a stale failure. The *message* is derived at render rather than stored,
   * because the provider list arrives from the server a beat later and the id
   * on its own can't be shown to anyone.
   *
   * `?forgot=1` arrives the same way and opens the reset form directly. It is
   * what the "ask for a new link" button points at — from a dead reset link, and
   * from the audit copy of a reset email if anyone ever re-sends one by hand.
   */
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const failed = params.get('auth_error')
    const forgot = params.get('forgot')
    if (!failed && !forgot) return
    if (failed) setFailedProviderId(failed)
    if (forgot) setMode('forgot')
    const url = new URL(window.location.href)
    url.searchParams.delete('auth_error')
    url.searchParams.delete('forgot')
    window.history.replaceState({}, '', `${url.pathname}${url.search}`)
  }, [])

  // Named only when it's a provider we actually offer, so the query parameter
  // can never print text of its own choosing onto the page.
  const failedProvider = providers.find((p) => p.id === failedProviderId)
  const ssoError = failedProviderId
    ? `That ${failedProvider ? `${failedProvider.label} ` : ''}sign-in didn’t complete. Try again, or use your email and password.`
    : null

  const valid = /\S+@\S+\.\S+/.test(email) && password.length >= (mode === 'signup' ? 8 : 1)

  const submit = async () => {
    if (!valid || submitting || mode === 'forgot') return
    setSubmitting(true)
    setError(null)
    const err = await onAuthenticate(mode, email.trim(), password)
    if (err) {
      setError(err)
      setSubmitting(false)
    }
  }

  /**
   * Hairline inputs with a real focus ring. The fields had neither — an opaque
   * grey box and `outline-none`, which took the browser's focus indicator away
   * and put nothing back, so a keyboard user could not tell which field they
   * were in.
   */

  return (
    <div className="min-h-[80vh] flex flex-col items-center justify-center px-6 max-w-sm mx-auto text-center">
      {/* The one screen in the app that greets a member by name carried no
          brand mark at all. */}
      <CHRGDMark size={34} className="mb-5" />
      <Eyebrow color="var(--accent)" className="mb-2">Subscriber hub</Eyebrow>
      <h1 className="text-3xl font-black mb-2" style={{ color: 'var(--ink-1)', fontFamily: 'var(--font-display)' }}>
        {mode === 'forgot' ? 'Forgotten password' : 'Manage your stack'}
      </h1>
      <p className="text-sm text-[var(--ink-3)] leading-relaxed mb-7">
        {mode === 'forgot'
          ? 'Happens to everyone. We’ll email you a link and you’ll be back in a minute.'
          : mode === 'login'
            ? 'Sign in to swap products, change your dispatch date, and manage your subscription.'
            : 'Create your account to save your stack, track how it’s working, and manage deliveries.'}
      </p>

      {mode === 'forgot' && (
        <ForgotPassword
          initialEmail={email}
          onBack={() => {
            setMode('login')
            setError(null)
          }}
        />
      )}

      {mode !== 'forgot' && (
        <>
          {ssoError && (
            <Note icon="alert-triangle" tone="critical" live="assertive" className="w-full mb-4 text-left">
              {ssoError}
            </Note>
          )}

          <form
            onSubmit={(e) => { e.preventDefault(); void submit() }}
            className="w-full space-y-3"
          >
            {/* `hideLabel`, not no label: these had a placeholder and nothing
                else, so a screen reader announced two unnamed edit boxes and a
                placeholder vanishes the moment you start typing. The name is
                real now; it is simply not given a line above a two-field form
                that plainly says what it is. */}
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

            <Button type="submit" variant="primary" size="lg" disabled={!valid || loading || submitting}>
              {submitting ? 'One sec…' : mode === 'login' ? 'Sign in →' : 'Create account →'}
            </Button>
          </form>

          {/* Under the form and only when signing in: it is the answer to a
              failed attempt, and putting it on the sign-up screen would offer to
              reset a password nobody has chosen yet. Carries the email already
              typed across with it — retyping the address you just got wrong is
              the last thing this screen should ask for. */}
          {mode === 'login' && canResetPassword && (
            <Button
              variant="ghost"
              size="sm"
              fullWidth={false}
              onClick={() => { setMode('forgot'); setError(null) }}
              className="mt-3 underline"
            >
              Forgotten your password?
            </Button>
          )}

          <ProviderButtons providers={providers} returnTo="/myhub" />

          <Button
            variant="ghost"
            size="sm"
            fullWidth={false}
            onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError(null) }}
            className="mt-4 underline"
          >
            {mode === 'login' ? 'New here? Create an account' : 'Already have an account? Sign in'}
          </Button>

          <Note icon="lock" className="mt-6 text-left">
            Your account and stack are saved to the app database. In mock mode your first
            sign-in loads a sample subscription; live, this connects to your real
            Recharge subscription.
          </Note>
        </>
      )}
    </div>
  )
}
