'use client'

import { useState } from 'react'

const ACCENT = '#00D4FF'

interface Props {
  onLogin: (email: string) => void
  loading?: boolean
}

export function HubLogin({ onLogin, loading }: Props) {
  const [email, setEmail] = useState('')
  const valid = /\S+@\S+\.\S+/.test(email)

  return (
    <div className="min-h-[80vh] flex flex-col items-center justify-center px-6 max-w-sm mx-auto text-center">
      <p className="text-[10px] font-bold tracking-widest uppercase mb-2" style={{ color: ACCENT, fontFamily: 'var(--font-display)' }}>
        Subscriber hub
      </p>
      <h1 className="text-3xl font-black mb-2" style={{ color: 'var(--color-text)', fontFamily: 'var(--font-display)' }}>
        Manage your stack
      </h1>
      <p className="text-sm text-[var(--color-muted)] leading-relaxed mb-7">
        Sign in to swap products, change your dispatch date, and manage your subscription.
      </p>

      <form
        onSubmit={(e) => { e.preventDefault(); if (valid) onLogin(email.trim()) }}
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
          style={{
            background: 'var(--color-surface-2)',
            border: '1px solid var(--color-border)',
            color: 'var(--color-text)',
          }}
        />
        <button
          type="submit"
          disabled={!valid || loading}
          className="w-full py-4 rounded-2xl text-sm font-bold tracking-wide bg-[var(--color-accent)] text-[var(--color-bg)] active:scale-95 transition-all disabled:opacity-50"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          {loading ? 'Loading…' : 'Sign in →'}
        </button>
      </form>

      <p className="mt-6 text-[11px] leading-relaxed text-[var(--color-muted)]"
        style={{ background: `color-mix(in srgb, ${ACCENT} 8%, transparent)`, border: `1px solid color-mix(in srgb, ${ACCENT} 20%, transparent)`, borderRadius: 12, padding: '10px 14px' }}>
        <strong>Demo mode.</strong> Any email loads a sample subscription. Live, this is
        Shopify Customer Account login and your real Recharge subscription.
      </p>
    </div>
  )
}
