'use client'

import { useEffect, useState } from 'react'
import { ProviderButtons } from '@/components/auth/ProviderButtons'
import { CHRGDMark } from '@/components/brand/CHRGDLogo'
import { Button } from '@/components/ui/Button'
import { Eyebrow } from '@/components/ui/Eyebrow'
import { Note } from '@/components/ui/Note'
import { ACCENT, GLASS, RED, tint } from '@/lib/ui/tokens'

interface Props {
  /** Sign in or create an account. Resolves to an error message, or null on success. */
  onAuthenticate: (mode: 'login' | 'signup', email: string, password: string) => Promise<string | null>
  loading?: boolean
  /** OAuth providers the server has configured (which buttons to show). */
  providers?: { id: string; label: string }[]
}

export function HubLogin({ onAuthenticate, loading, providers = [] }: Props) {
  const [mode, setMode] = useState<'login' | 'signup'>('login')
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
   */
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const failed = params.get('auth_error')
    if (!failed) return
    setFailedProviderId(failed)
    const url = new URL(window.location.href)
    url.searchParams.delete('auth_error')
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
    if (!valid || submitting) return
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
  const inputClass =
    'w-full px-4 py-3.5 min-h-13 rounded-2xl text-sm outline-none transition-all duration-200 ' +
    'focus-visible:ring-2 focus:border-[color:var(--color-accent)]'
  const inputStyle = {
    background: GLASS.surface,
    border: `1px solid ${GLASS.hairline}`,
    color: 'var(--color-text)',
    ['--tw-ring-color' as string]: tint(ACCENT, 45),
  }

  return (
    <div className="min-h-[80vh] flex flex-col items-center justify-center px-6 max-w-sm mx-auto text-center">
      {/* The one screen in the app that greets a member by name carried no
          brand mark at all. */}
      <CHRGDMark size={34} className="mb-5" />
      <Eyebrow color={ACCENT} className="mb-2">Subscriber hub</Eyebrow>
      <h1 className="text-3xl font-black mb-2" style={{ color: 'var(--color-text)', fontFamily: 'var(--font-display)' }}>
        Manage your stack
      </h1>
      <p className="text-sm text-[var(--color-muted)] leading-relaxed mb-7">
        {mode === 'login'
          ? 'Sign in to swap products, change your dispatch date, and manage your subscription.'
          : 'Create your account to save your stack, track how it’s working, and manage deliveries.'}
      </p>

      {ssoError && (
        <Note icon="alert-triangle" color={RED} live className="w-full mb-4 text-left">
          {ssoError}
        </Note>
      )}

      <form
        onSubmit={(e) => { e.preventDefault(); void submit() }}
        className="w-full space-y-3"
      >
        <input
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder="you@email.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={inputClass}
          style={inputStyle}
        />
        <input
          type="password"
          autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
          placeholder={mode === 'signup' ? 'Choose a password (8+ characters)' : 'Password'}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={inputClass}
          style={inputStyle}
        />

        {error && (
          <p className="text-xs font-semibold text-left px-1" style={{ color: RED }} role="alert">
            {error}
          </p>
        )}

        <Button type="submit" variant="primary" size="lg" disabled={!valid || loading || submitting}>
          {submitting ? 'One sec…' : mode === 'login' ? 'Sign in →' : 'Create account →'}
        </Button>
      </form>

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
    </div>
  )
}
