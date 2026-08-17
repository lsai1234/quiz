'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { ShareFormat } from '@/lib/share-card/format'
import { Button } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { prizeInline } from '@/lib/competition/prize'

/**
 * Entering the giveaway, once the card has been shared.
 *
 * ── Why it is a step and no longer an accordion ─────────────────────────────
 * This used to sit under the share buttons, folded away behind the line
 * "Entering the giveaway? Win £200" — the conversion-critical step of the whole
 * promotion, below the fold, phrased as a question, competing with the button
 * next to it. Somebody could share their card and never discover that sharing
 * alone did not enter them.
 *
 * So it moved to where it belongs: after a successful share, as the thing that
 * finishes what they just started. There is no fold and nothing to notice.
 *
 * ── What it does not do ─────────────────────────────────────────────────────
 * It does not verify anything. Anyone can mint a card token by calling the API,
 * so a handle typed here is a *claim* that somebody posted — every entry lands
 * `pending` and a person confirms it in the Founders Hub before the draw can see
 * it. That is what makes the draw auditable, and it is why the copy says
 * "we'll check" rather than "you're in".
 */

const ACCENT = '#00D4FF'

type State = 'idle' | 'sending' | 'done' | 'already' | 'error'

/** The platforms, spelled the way the platforms spell themselves — a
 *  `capitalize` class turns "tiktok" into "Tiktok", which is nobody's name. */
const CHANNELS = [
  { id: 'instagram', label: 'Instagram' },
  { id: 'tiktok', label: 'TikTok' },
] as const

type Channel = (typeof CHANNELS)[number]['id']

export function ShareEntryPanel({ prize, test, link, format, onDone }: {
  prize: string
  test: boolean
  link: string
  /** Which card was shared. A story card entered on is worth knowing about. */
  format: ShareFormat
  onDone: () => void
}) {
  const [state, setState] = useState<State>('idle')
  const [handle, setHandle] = useState('')
  const [channel, setChannel] = useState<Channel>('instagram')

  async function submit() {
    setState('sending')
    try {
      const path = new URL(link).pathname
      const token = path.startsWith('/s/') ? path.slice(3) : null
      const res = await fetch('/api/competition/enter', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ handle, channel, route: 'share', shareToken: token, note: format }),
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
      <div className="text-center" role="status">
        <div
          className="inline-flex items-center justify-center rounded-full mb-3"
          style={{
            width: 44, height: 44,
            background: 'rgba(0,212,255,0.12)',
            border: `1px solid ${ACCENT}59`,
            color: ACCENT,
          }}
        >
          <Icon name="check" size={20} />
        </div>
        <p className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
          {state === 'already' ? 'You’re already in' : 'Entry received'}
        </p>
        <p className="text-xs mt-1.5 leading-relaxed" style={{ color: 'var(--color-text-2)' }}>
          {state === 'already'
            ? 'That handle is already entered for this draw.'
            : 'We’ll look for your story and confirm it. Keep the post up until the draw closes.'}
        </p>
        <Button variant="ghost" size="sm" className="mt-3" onClick={onDone}>Close</Button>
      </div>
    )
  }

  return (
    <div>
      {test && (
        <p className="text-[10px] font-bold mb-3 text-center tracking-wide" style={{ color: '#fbbf24' }}>
          TEST RUN — A REHEARSAL, NOT A LIVE PROMOTION
        </p>
      )}

      <p className="text-sm leading-relaxed text-center mb-4" style={{ color: 'var(--color-text-2)' }}>
        {test
          ? 'Posting alone doesn’t enter you. Tell us the handle you posted from.'
          : <>Posting alone doesn’t enter you — tell us the handle you posted from so we can find your story and count you in for <strong style={{ color: 'var(--color-text)' }}>{prizeInline(prize)}</strong>.</>}
      </p>

      <div className="flex gap-2 mb-3" role="radiogroup" aria-label="Where you posted">
        {CHANNELS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={channel === id}
            onClick={() => setChannel(id)}
            className="flex-1 py-2.5 rounded-xl text-xs font-bold"
            style={{
              background: channel === id ? 'rgba(0,212,255,0.12)' : 'rgba(255,255,255,0.05)',
              border: `1px solid ${channel === id ? 'rgba(0,212,255,0.38)' : 'rgba(255,255,255,0.09)'}`,
              color: channel === id ? ACCENT : 'var(--color-text-2)',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      <label htmlFor="entry-handle" className="text-[11px] font-bold block mb-1.5" style={{ color: 'var(--color-text-2)' }}>
        Your {CHANNELS.find((c) => c.id === channel)?.label} handle
      </label>
      <input
        id="entry-handle"
        value={handle}
        onChange={(e) => setHandle(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && handle.trim().length >= 2) submit() }}
        placeholder="@yourname"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        enterKeyHint="done"
        className="w-full px-3.5 py-3 rounded-xl text-sm outline-none"
        style={{
          background: 'rgba(255,255,255,0.05)',
          border: '1px solid rgba(255,255,255,0.09)',
          color: 'var(--color-text)',
        }}
      />

      <Button
        variant="primary"
        className="mt-3"
        fullWidth
        loading={state === 'sending'}
        disabled={handle.trim().length < 2}
        onClick={submit}
      >
        {state === 'sending' ? 'Entering…' : 'Enter the giveaway'}
      </Button>

      {state === 'error' && (
        <p className="text-[11px] mt-2 text-center" style={{ color: '#f87171' }} role="alert">
          That didn’t work — check the handle and try again.
        </p>
      )}

      <p className="text-[10px] mt-3 leading-relaxed text-center" style={{ color: 'var(--color-muted)' }}>
        No purchase necessary. Entering by sharing and entering for free are treated the
        same.{' '}
        <Link
          href="/legal/competition"
          target="_blank"
          className="underline"
          style={{ color: 'var(--color-muted)' }}
        >
          Full terms and the free entry route
        </Link>
        .
      </p>
    </div>
  )
}
