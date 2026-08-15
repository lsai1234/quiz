'use client'

import { useState } from 'react'

const ACCENT = '#00D4FF'

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

  const inputClass = 'w-full px-4 py-3.5 rounded-2xl text-sm outline-none'
  const inputStyle = {
    background: 'var(--color-surface-2)',
    border: '1px solid var(--color-border)',
    color: 'var(--color-text)',
  } as const
  const wrap = 'min-h-screen flex flex-col items-center justify-center px-6 max-w-sm mx-auto text-center'

  if (forgot) {
    return (
      <div className={wrap} style={{ background: 'var(--color-bg)' }}>
        <p className="text-[10px] font-bold tracking-widest uppercase mb-2" style={{ color: ACCENT, fontFamily: 'var(--font-display)' }}>
          CHRGD Partners
        </p>
        <h1 className="text-3xl font-black mb-2" style={{ color: 'var(--color-text)', fontFamily: 'var(--font-display)' }}>
          Forgotten password
        </h1>

        {resetSent ? (
          <>
            <p className="text-xs text-[var(--color-muted)] mb-6 leading-snug">
              If we have a partner account for <strong>{email.trim()}</strong>, a link to set a new
              password is on its way. It works once, for the next 60 minutes.
            </p>
            <button
              type="button"
              onClick={() => { setForgot(false); setResetSent(false) }}
              className="text-xs font-bold underline"
              style={{ color: ACCENT }}
            >
              Back to sign-in
            </button>
          </>
        ) : (
          <>
            <p className="text-xs text-[var(--color-muted)] mb-6 leading-snug">
              Type the email on your partner account and we’ll send a link to set a new one.
            </p>
            <form onSubmit={requestReset} className="w-full space-y-3">
              <input
                type="email"
                inputMode="email"
                autoComplete="email"
                aria-label="Email address"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setError(null) }}
                className={inputClass}
                style={inputStyle}
              />

              {error && <p className="text-xs font-semibold" style={{ color: '#f87171' }}>{error}</p>}

              <button
                type="submit"
                disabled={!emailValid || loading}
                className="w-full py-3.5 rounded-2xl text-sm font-bold active:scale-95 transition-all disabled:opacity-40"
                style={{ background: ACCENT, color: 'var(--color-bg)', fontFamily: 'var(--font-display)' }}
              >
                {loading ? 'Sending…' : 'Email me a link'}
              </button>
            </form>
            <button
              type="button"
              onClick={() => { setForgot(false); setError(null) }}
              className="text-xs font-bold underline mt-5"
              style={{ color: ACCENT }}
            >
              Back to sign-in
            </button>
          </>
        )}
      </div>
    )
  }

  return (
    <div className={wrap} style={{ background: 'var(--color-bg)' }}>
      <p className="text-[10px] font-bold tracking-widest uppercase mb-2" style={{ color: ACCENT, fontFamily: 'var(--font-display)' }}>
        CHRGD Partners
      </p>
      <h1 className="text-3xl font-black mb-2" style={{ color: 'var(--color-text)', fontFamily: 'var(--font-display)' }}>
        Partner sign-in
      </h1>
      <p className="text-xs text-[var(--color-muted)] mb-6 leading-snug">
        Your code, your numbers and your terms.
      </p>

      <form onSubmit={submit} className="w-full space-y-3">
        <input
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full px-4 py-3.5 rounded-2xl text-sm outline-none"
          style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }}
        />
        <input
          type="password"
          autoComplete="current-password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full px-4 py-3.5 rounded-2xl text-sm outline-none"
          style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }}
        />

        {error && <p className="text-xs font-semibold" style={{ color: '#f87171' }}>{error}</p>}

        <button
          type="submit"
          disabled={!valid || loading}
          className="w-full py-3.5 rounded-2xl text-sm font-bold active:scale-95 transition-all disabled:opacity-40"
          style={{ background: ACCENT, color: 'var(--color-bg)', fontFamily: 'var(--font-display)' }}
        >
          {loading ? 'Signing in…' : 'Sign in'}
        </button>
      </form>

      {canResetPassword && (
        <button
          type="button"
          onClick={() => { setForgot(true); setError(null) }}
          className="text-xs font-bold underline mt-5"
          style={{ color: ACCENT }}
        >
          Forgotten your password?
        </button>
      )}

      <p className="text-[11px] text-[var(--color-muted)] mt-6 leading-snug">
        {canResetPassword
          ? 'Haven’t set a password yet? Use the link we sent you, or ask for a new one above.'
          : 'Haven’t set a password yet? Use the link we sent you. Lost it, or need a new one — email us and we’ll send another.'}
      </p>
    </div>
  )
}
