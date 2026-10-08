'use client'

import { useState } from 'react'

/**
 * The free entry route.
 *
 * Deliberately the same thing as entering at the end of the quiz: one email
 * address, one tap. The CAP Code requires a no-purchase-necessary route of
 * **equal standing**, and "equal" is a thing you can measure: if this were an
 * email address to find and a message to compose, it would not be.
 *
 * The only difference in the row is `route: 'free'`, which exists so the draw
 * can be shown to have included both.
 */

const ACCENT = '#00D4FF'

export function FreeEntryForm({ test }: { test: boolean }) {
  const [email, setEmail] = useState('')
  const [state, setState] = useState<'idle' | 'sending' | 'done' | 'already' | 'invalid' | 'error'>('idle')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setState('sending')
    try {
      const res = await fetch('/api/competition/enter', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, route: 'free' }),
      })
      const json = await res.json().catch(() => ({}))
      if (res.ok) return setState(json.already ? 'already' : 'done')
      setState(json.error === 'invalid-email' ? 'invalid' : 'error')
    } catch {
      setState('error')
    }
  }

  if (state === 'done' || state === 'already') {
    return (
      <p className="text-sm" style={{ color: ACCENT }} role="status">
        {state === 'already'
          ? 'You’re already entered with that email.'
          : `Entry received${test ? ' (test run)' : ''}. You’re in the draw — no purchase needed.`}
      </p>
    )
  }

  return (
    <form onSubmit={submit} className="rounded-2xl p-3" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
      <label htmlFor="free-entry-email" className="text-[11px] font-bold block mb-1" style={{ color: 'var(--color-text-2)' }}>
        Your email
      </label>
      <input
        id="free-entry-email"
        type="email"
        inputMode="email"
        autoComplete="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@example.com"
        autoCapitalize="none"
        autoCorrect="off"
        className="w-full px-3 py-2 rounded-xl text-sm outline-none"
        style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }}
      />

      <button
        type="submit"
        disabled={state === 'sending' || email.trim().length < 3}
        className="w-full mt-2 py-2.5 rounded-xl text-xs font-black disabled:opacity-40"
        style={{ fontFamily: 'var(--font-display)', background: ACCENT, color: '#07070A' }}
      >
        {state === 'sending' ? 'Entering…' : 'Enter for free'}
      </button>

      {(state === 'error' || state === 'invalid') && (
        <p className="text-[11px] mt-2" style={{ color: '#f87171' }}>
          {state === 'invalid' ? 'That doesn’t look like an email address.' : 'That didn’t work — try again in a moment.'}
        </p>
      )}
    </form>
  )
}
