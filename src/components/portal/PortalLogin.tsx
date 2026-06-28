'use client'

import { useState } from 'react'

const ACCENT = '#00D4FF'

export function PortalLogin() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const valid = /\S+@\S+\.\S+/.test(email) && password.length > 0

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const res = await fetch('/api/portal/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.trim(), password }),
    })
    if (res.ok) {
      window.location.reload()
    } else {
      setError('Incorrect email or password')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 max-w-sm mx-auto text-center" style={{ background: 'var(--color-bg)' }}>
      <p className="text-[10px] font-bold tracking-widest uppercase mb-2" style={{ color: ACCENT, fontFamily: 'var(--font-display)' }}>
        CHRGD Founders Hub
      </p>
      <h1 className="text-3xl font-black mb-6" style={{ color: 'var(--color-text)', fontFamily: 'var(--font-display)' }}>
        Founder sign-in
      </h1>
      <form onSubmit={submit} className="w-full space-y-3">
        <input
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder="you@chrgd.dev"
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
        {error && <p className="text-xs text-[var(--color-red)]">{error}</p>}
        <button
          type="submit"
          disabled={!valid || loading}
          className="w-full py-4 rounded-2xl text-sm font-bold bg-[var(--color-accent)] text-[var(--color-bg)] active:scale-95 transition-all disabled:opacity-50"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          {loading ? 'Signing in…' : 'Sign in →'}
        </button>
      </form>

      <p className="mt-6 text-[11px] leading-relaxed text-[var(--color-muted)]"
        style={{ background: `color-mix(in srgb, ${ACCENT} 8%, transparent)`, border: `1px solid color-mix(in srgb, ${ACCENT} 20%, transparent)`, borderRadius: 12, padding: '10px 14px' }}>
        <strong>Founders only.</strong> Accounts are configured via the <code>FOUNDER_*</code> env vars.
        In dev, <code>founder1@chrgd.dev</code> / <code>chrgd-founder-1</code> works out of the box.
      </p>
    </div>
  )
}
