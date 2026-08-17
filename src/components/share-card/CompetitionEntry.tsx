'use client'

import { useState } from 'react'

/**
 * Entering the giveaway, from the share sheet.
 *
 * ── Why it is a strip and not a second screen ───────────────────────────────
 * Somebody is here because they want to post their card. The competition is a
 * reason to post it, not a different task — so it sits under the share buttons,
 * folded away until they say they want it.
 *
 * ── What it does not do ─────────────────────────────────────────────────────
 * It does not verify anything. Anyone can mint a card token by calling the API,
 * so a handle typed here is a *claim* that somebody posted — every entry lands
 * `pending` and a person confirms it in the Founders Hub before the draw can see
 * it. That is what makes the draw auditable, and it is why the copy says
 * "we'll check" rather than "you're in".
 */

const ACCENT = '#00D4FF'

type State = 'closed' | 'open' | 'sending' | 'done' | 'already' | 'error'

export function CompetitionEntry({ prize, test, link }: { prize: string; test: boolean; link: string }) {
  const [state, setState] = useState<State>('closed')
  const [handle, setHandle] = useState('')
  const [channel, setChannel] = useState<'instagram' | 'tiktok'>('instagram')

  async function submit() {
    setState('sending')
    try {
      const token = new URL(link).pathname.startsWith('/s/') ? new URL(link).pathname.slice(3) : null
      const res = await fetch('/api/competition/enter', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ handle, channel, route: 'share', shareToken: token }),
      })
      if (res.ok) return setState('done')
      const json = await res.json().catch(() => ({}))
      setState(json.error === 'already-entered' ? 'already' : 'error')
    } catch {
      setState('error')
    }
  }

  if (state === 'closed') {
    return (
      <button
        type="button"
        onClick={() => setState('open')}
        className="w-full mt-3 py-2.5 rounded-2xl text-xs font-bold"
        style={{ background: 'rgba(0,212,255,0.08)', border: '1px solid rgba(0,212,255,0.28)', color: ACCENT }}
      >
        {test ? 'Enter the giveaway (test)' : `Entering the giveaway? Win ${prize}`}
      </button>
    )
  }

  if (state === 'done' || state === 'already') {
    return (
      <p className="text-xs mt-3 text-center leading-relaxed" style={{ color: ACCENT }} role="status">
        {state === 'already'
          ? 'You’re already entered with that handle.'
          : 'Entry received. We’ll check your post and confirm — post the card to your story to complete it.'}
      </p>
    )
  }

  return (
    <div
      className="mt-3 rounded-2xl p-3"
      style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)' }}
    >
      {test && (
        <p className="text-[10px] font-bold mb-2" style={{ color: '#fbbf24' }}>
          TEST RUN — this is a rehearsal, not a live promotion.
        </p>
      )}

      <div className="flex gap-2 mb-2">
        {(['instagram', 'tiktok'] as const).map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setChannel(c)}
            className="flex-1 py-2 rounded-xl text-xs font-semibold capitalize"
            style={{
              background: channel === c ? 'rgba(0,212,255,0.12)' : 'rgba(255,255,255,0.05)',
              border: `1px solid ${channel === c ? 'rgba(0,212,255,0.35)' : 'rgba(255,255,255,0.09)'}`,
              color: channel === c ? ACCENT : 'var(--color-text-2)',
            }}
          >
            {c}
          </button>
        ))}
      </div>

      <label className="text-[11px] font-bold block mb-1" style={{ color: 'var(--color-text-2)' }}>
        Your handle
      </label>
      <input
        value={handle}
        onChange={(e) => setHandle(e.target.value)}
        placeholder="@yourname"
        autoCapitalize="none"
        autoCorrect="off"
        className="w-full px-3 py-2 rounded-xl text-sm outline-none"
        style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)', color: 'var(--color-text)' }}
      />

      <button
        type="button"
        disabled={state === 'sending' || handle.trim().length < 2}
        onClick={submit}
        className="w-full mt-2 py-2.5 rounded-xl text-xs font-black disabled:opacity-40"
        style={{ fontFamily: 'var(--font-display)', background: ACCENT, color: '#07070A' }}
      >
        {state === 'sending' ? 'Entering…' : 'Enter'}
      </button>

      {state === 'error' && (
        <p className="text-[11px] mt-2 text-center" style={{ color: '#f87171' }}>
          That didn’t work — check the handle and try again.
        </p>
      )}

      <p className="text-[10px] mt-2 leading-relaxed" style={{ color: 'var(--color-muted)' }}>
        No purchase necessary. Entering by sharing and entering for free are treated the
        same. Full terms and the free entry route are on the competition page.
      </p>
    </div>
  )
}
