'use client'

import { useState } from 'react'

const ACCENT = '#00D4FF'

export function PortalLogin() {
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const res = await fetch('/api/portal/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    })
    if (res.ok) {
      window.location.reload()
    } else {
      setError('Incorrect password')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 max-w-sm mx-auto text-center" style={{ background: 'var(--color-bg)' }}>
      <p className="text-[10px] font-bold tracking-widest uppercase mb-2" style={{ color: ACCENT, fontFamily: 'var(--font-display)' }}>
        CHRGD Control Centre
      </p>
      <h1 className="text-3xl font-black mb-6" style={{ color: 'var(--color-text)', fontFamily: 'var(--font-display)' }}>
        Admin sign-in
      </h1>
      <form onSubmit={submit} className="w-full space-y-3">
        <input
          type="password"
          autoComplete="current-password"
          placeholder="Admin password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full px-4 py-3.5 rounded-2xl text-sm outline-none"
          style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }}
        />
        {error && <p className="text-xs text-[var(--color-red)]">{error}</p>}
        <button
          type="submit"
          disabled={!password || loading}
          className="w-full py-4 rounded-2xl text-sm font-bold bg-[var(--color-accent)] text-[var(--color-bg)] active:scale-95 transition-all disabled:opacity-50"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          {loading ? 'Signing in…' : 'Sign in →'}
        </button>
      </form>
    </div>
  )
}
