'use client'

import { useEffect, useState } from 'react'
import { ProviderButtons } from './ProviderButtons'
import { fetchAuthContext, authenticateAccount } from '@/lib/auth-client'
import type { CheckoutPayload } from '@/lib/checkout/types'

const ACCENT = '#00D4FF'

/**
 * Account gate shown before subscription checkout. Email/password signs in
 * inline (no redirect) then resumes checkout via `onAuthenticated`. OAuth
 * stashes the pending order (`/api/checkout/pending`) and redirects to the
 * provider, returning to `/api/checkout/continue` which finalizes server-side.
 */
export function AccountGate({
  payload,
  onAuthenticated,
  onCancel,
}: {
  payload: CheckoutPayload
  onAuthenticated: () => void
  onCancel: () => void
}) {
  const [providers, setProviders] = useState<{ id: string; label: string }[]>([])
  const [mode, setMode] = useState<'signup' | 'login'>('signup')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void fetchAuthContext().then((ctx) => setProviders(ctx.providers))
  }, [])

  const valid = /\S+@\S+\.\S+/.test(email) && password.length >= (mode === 'signup' ? 8 : 1)

  const submit = async () => {
    if (!valid || busy) return
    setBusy(true)
    setError(null)
    const err = await authenticateAccount(mode, email.trim(), password)
    if (err) {
      setError(err)
      setBusy(false)
      return
    }
    onAuthenticated() // resume checkout with the now-signed-in account
  }

  // Stash the pending order before an OAuth redirect so it survives the round-trip.
  const stashPending = async () => {
    const res = await fetch('/api/checkout/pending', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!res.ok) throw new Error('pending stash failed')
  }

  const inputStyle = {
    background: 'var(--color-surface-2)',
    border: '1px solid var(--color-border)',
    color: 'var(--color-text)',
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm px-4 py-6">
      <div
        className="w-full max-w-sm rounded-3xl p-6 max-h-[92vh] overflow-y-auto"
        style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)' }}
      >
        <p className="text-[10px] font-bold tracking-widest uppercase mb-2" style={{ color: ACCENT, fontFamily: 'var(--font-display)' }}>
          One last step
        </p>
        <h2 className="text-2xl font-black mb-1.5" style={{ color: 'var(--color-text)', fontFamily: 'var(--font-display)' }}>
          {mode === 'signup' ? 'Create your account' : 'Welcome back'}
        </h2>
        <p className="text-sm text-[var(--color-muted)] leading-relaxed mb-5">
          We save your stack and quiz answers to your account so you can log back in to see and
          manage your subscription any time.
        </p>

        <form onSubmit={(e) => { e.preventDefault(); void submit() }} className="space-y-3">
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
          <button
            type="submit" disabled={!valid || busy}
            className="w-full py-4 rounded-2xl text-sm font-bold tracking-wide bg-[var(--color-accent)] text-[var(--color-bg)] active:scale-95 transition-all disabled:opacity-50"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            {busy ? 'One sec…' : mode === 'signup' ? 'Create account & subscribe →' : 'Sign in & subscribe →'}
          </button>
        </form>

        {providers.length > 0 && (
          <>
            <div className="flex items-center gap-3 my-4">
              <div className="h-px flex-1" style={{ background: 'var(--color-border)' }} />
              <span className="text-[10px] uppercase tracking-widest text-[var(--color-muted)]">or</span>
              <div className="h-px flex-1" style={{ background: 'var(--color-border)' }} />
            </div>
            <ProviderButtons providers={providers} returnTo="/api/checkout/continue" beforeNavigate={stashPending} />
          </>
        )}

        <div className="flex items-center justify-between mt-5">
          <button
            type="button"
            onClick={() => { setMode(mode === 'signup' ? 'login' : 'signup'); setError(null) }}
            className="text-xs font-semibold underline text-[var(--color-muted)]"
          >
            {mode === 'signup' ? 'Already have an account?' : 'New here? Create one'}
          </button>
          <button type="button" onClick={onCancel} className="text-xs font-semibold text-[var(--color-muted)]">
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
