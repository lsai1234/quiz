'use client'

import { useState } from 'react'

const ACCENT = '#00D4FF'

interface Props {
  /** Sign in or create an account. Resolves to an error message, or null on success. */
  onAuthenticate: (mode: 'login' | 'signup', email: string, password: string) => Promise<string | null>
  loading?: boolean
  /** Whether the server has Google OAuth configured. */
  googleEnabled?: boolean
}

export function HubLogin({ onAuthenticate, loading, googleEnabled }: Props) {
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

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

  const inputStyle = {
    background: 'var(--color-surface-2)',
    border: '1px solid var(--color-border)',
    color: 'var(--color-text)',
  }

  return (
    <div className="min-h-[80vh] flex flex-col items-center justify-center px-6 max-w-sm mx-auto text-center">
      <p className="text-[10px] font-bold tracking-widest uppercase mb-2" style={{ color: ACCENT, fontFamily: 'var(--font-display)' }}>
        Subscriber hub
      </p>
      <h1 className="text-3xl font-black mb-2" style={{ color: 'var(--color-text)', fontFamily: 'var(--font-display)' }}>
        Manage your stack
      </h1>
      <p className="text-sm text-[var(--color-muted)] leading-relaxed mb-7">
        {mode === 'login'
          ? 'Sign in to swap products, change your dispatch date, and manage your subscription.'
          : 'Create your account to save your stack, track how it’s working, and manage deliveries.'}
      </p>

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
          className="w-full px-4 py-3.5 rounded-2xl text-sm outline-none"
          style={inputStyle}
        />
        <input
          type="password"
          autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
          placeholder={mode === 'signup' ? 'Choose a password (8+ characters)' : 'Password'}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full px-4 py-3.5 rounded-2xl text-sm outline-none"
          style={inputStyle}
        />

        {error && (
          <p className="text-xs font-semibold text-left px-1" style={{ color: '#ff6b6b' }} role="alert">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={!valid || loading || submitting}
          className="w-full py-4 rounded-2xl text-sm font-bold tracking-wide bg-[var(--color-accent)] text-[var(--color-bg)] active:scale-95 transition-all disabled:opacity-50"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          {submitting ? 'One sec…' : mode === 'login' ? 'Sign in →' : 'Create account →'}
        </button>
      </form>

      {googleEnabled && (
        <a
          href="/api/auth/google"
          className="w-full mt-3 py-4 rounded-2xl text-sm font-bold tracking-wide active:scale-95 transition-all flex items-center justify-center gap-2"
          style={{
            fontFamily: 'var(--font-display)',
            background: 'var(--color-surface-2)',
            border: '1px solid var(--color-border)',
            color: 'var(--color-text)',
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z" />
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z" />
            <path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84z" />
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15A11 11 0 0 0 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
          </svg>
          Continue with Google
        </a>
      )}

      <button
        type="button"
        onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError(null) }}
        className="mt-5 text-xs font-semibold underline text-[var(--color-muted)]"
      >
        {mode === 'login' ? 'New here? Create an account' : 'Already have an account? Sign in'}
      </button>

      <p className="mt-6 text-[11px] leading-relaxed text-[var(--color-muted)]"
        style={{ background: `color-mix(in srgb, ${ACCENT} 8%, transparent)`, border: `1px solid color-mix(in srgb, ${ACCENT} 20%, transparent)`, borderRadius: 12, padding: '10px 14px' }}>
        Your account and stack are saved to the app database. In mock mode your first
        sign-in loads a sample subscription; live, this connects to your real
        Recharge subscription.
      </p>
    </div>
  )
}
