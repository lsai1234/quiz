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
export function PartnerLogin() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const valid = /\S+@\S+\.\S+/.test(email) && password.length > 0

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

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 max-w-sm mx-auto text-center" style={{ background: 'var(--color-bg)' }}>
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

      <p className="text-[11px] text-[var(--color-muted)] mt-6 leading-snug">
        Haven’t set a password yet? Use the link we sent you. Lost it, or need a new one — email us and we’ll send
        another.
      </p>
    </div>
  )
}
