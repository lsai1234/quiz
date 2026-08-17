'use client'

import { useState } from 'react'

/**
 * The free entry route.
 *
 * Deliberately the same form, with the same fields and the same number of taps,
 * as entering from the share sheet. The CAP Code requires a no-purchase-necessary
 * route of **equal standing**, and "equal" is a thing you can measure: if this
 * were an email address to find and a message to compose, it would not be.
 *
 * The only difference from the share route is `route: 'free'` on the row, which
 * exists so the draw can be shown to have included both.
 */

const ACCENT = '#00D4FF'

export function FreeEntryForm({ test }: { test: boolean }) {
  const [handle, setHandle] = useState('')
  const [channel, setChannel] = useState<'instagram' | 'tiktok' | 'other'>('instagram')
  const [state, setState] = useState<'idle' | 'sending' | 'done' | 'already' | 'error'>('idle')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setState('sending')
    try {
      const res = await fetch('/api/competition/enter', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ handle, channel, route: 'free' }),
      })
      if (res.ok) return setState('done')
      const json = await res.json().catch(() => ({}))
      setState(json.error === 'already-entered' ? 'already' : 'error')
    } catch {
      setState('error')
    }
  }

  if (state === 'done' || state === 'already') {
    return (
      <p className="text-sm" style={{ color: ACCENT }} role="status">
        {state === 'already'
          ? 'You’re already entered with that handle.'
          : `Entry received${test ? ' (test run)' : ''}. You’re in the draw — no purchase needed.`}
      </p>
    )
  }

  return (
    <form onSubmit={submit} className="rounded-2xl p-3" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
      <div className="flex gap-2 mb-2">
        {(['instagram', 'tiktok', 'other'] as const).map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setChannel(c)}
            className="flex-1 py-2 rounded-xl text-xs font-semibold capitalize"
            style={{
              background: channel === c ? 'rgba(0,212,255,0.12)' : 'var(--color-surface-2)',
              border: `1px solid ${channel === c ? 'rgba(0,212,255,0.35)' : 'var(--color-border)'}`,
              color: channel === c ? ACCENT : 'var(--color-text-2)',
            }}
          >
            {c}
          </button>
        ))}
      </div>

      <label htmlFor="free-entry-handle" className="text-[11px] font-bold block mb-1" style={{ color: 'var(--color-text-2)' }}>
        Your handle
      </label>
      <input
        id="free-entry-handle"
        value={handle}
        onChange={(e) => setHandle(e.target.value)}
        placeholder="@yourname"
        autoCapitalize="none"
        autoCorrect="off"
        className="w-full px-3 py-2 rounded-xl text-sm outline-none"
        style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }}
      />

      <button
        type="submit"
        disabled={state === 'sending' || handle.trim().length < 2}
        className="w-full mt-2 py-2.5 rounded-xl text-xs font-black disabled:opacity-40"
        style={{ fontFamily: 'var(--font-display)', background: ACCENT, color: '#07070A' }}
      >
        {state === 'sending' ? 'Entering…' : 'Enter for free'}
      </button>

      {state === 'error' && (
        <p className="text-[11px] mt-2" style={{ color: '#f87171' }}>
          That didn’t work — check the handle and try again.
        </p>
      )}
    </form>
  )
}
