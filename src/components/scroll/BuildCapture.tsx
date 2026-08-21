'use client'

import { useEffect, useState } from 'react'
import { useQuizStore } from '@/lib/store'
import { funnel } from '@/lib/analytics/quiz'
import { EMAIL_CAPTURE_NOTICE, MARKETING_CONSENT_STATEMENT } from '@/lib/legal/content'

/**
 * The second place the quiz asks for an address: the build screen.
 *
 * Off by default — `NEXT_PUBLIC_QUIZ_BUILD_CAPTURE=on` turns it on — because it
 * asks BEFORE the payoff, which is the shape that costs conversion, and that is
 * a claim worth measuring rather than believing. With the flag off this file
 * renders nothing and the build screen is byte-for-byte what it was.
 *
 * The one thing it must not do is eat what somebody is typing. The build screen
 * moves on by itself after about four seconds, so a field that ignored that
 * would take an address halfway through and throw it away. Instead, engaging
 * with the field HOLDS the screen (`onHold`) and finishing releases it: someone
 * who ignores the field sees exactly the timing they saw before, and someone
 * who uses it is never hurried. Holding is not gating — nothing here has to be
 * filled in, and the release fires on "no thanks" as readily as on a send.
 */

export function buildCaptureEnabled(): boolean {
  return (process.env.NEXT_PUBLIC_QUIZ_BUILD_CAPTURE ?? '').trim().toLowerCase() === 'on'
}

interface Props {
  /** Called when the visitor starts using the field — pauses the auto-advance. */
  onHold: () => void
  /** Called when they are done, one way or the other — resumes it. */
  onRelease: () => void
}

export function BuildCapture({ onHold, onRelease }: Props) {
  const { answers, setCapturedEmail } = useQuizStore()
  const [email, setEmail] = useState('')
  const [optIn, setOptIn] = useState(false)
  const [state, setState] = useState<'idle' | 'sending' | 'done'>('idle')

  useEffect(() => { funnel.leadPromptView({ source: 'quiz-build' }) }, [])

  const valid = /\S+@\S+\.\S+/.test(email.trim())

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!valid || state !== 'idle') return
    setState('sending')
    funnel.leadSubmit({ source: 'quiz-build', optIn })

    // Remembered either way: the reveal pre-fills its card from this, so the
    // address is typed once even if this request never lands.
    setCapturedEmail(email.trim(), optIn)

    try {
      await fetch('/api/audience/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          firstName: answers.name || null,
          marketingOptIn: optIn,
          source: 'quiz-build',
          track: answers.track,
          primaryGoal: answers.goals[0] ?? null,
          // No stack yet — that is the point of this screen. The reveal offers
          // to send it, pre-filled, the moment there is one to send.
        }),
      })
      if (optIn) funnel.leadOptIn({ source: 'quiz-build' })
    } catch {
      /* Kept locally; the reveal will offer to send the stack anyway. */
    }
    setState('done')
    onRelease()
  }

  if (state === 'done') {
    return (
      <p className="text-xs text-white/45 text-center mt-6 max-w-xs" role="status">
        Got it — we&rsquo;ll have your stack ready in a moment.
      </p>
    )
  }

  return (
    <form onSubmit={submit} className="w-full max-w-xs mt-8" onFocus={onHold}>
      <p
        className="text-[10px] tracking-[0.22em] uppercase text-white/35 text-center mb-3"
        style={{ fontFamily: 'var(--font-display)' }}
      >
        Want it emailed to you?
      </p>

      <label htmlFor="build-capture-email" className="sr-only">
        Your email address
      </label>
      <input
        id="build-capture-email"
        type="email"
        inputMode="email"
        autoComplete="email"
        value={email}
        onChange={(e) => { setEmail(e.target.value); onHold() }}
        placeholder="you@example.com"
        className="w-full px-4 py-3 rounded-xl bg-white/[0.04] border border-white/10 text-white text-sm placeholder-white/20 focus:outline-none focus:border-[#00D4FF]/50"
        style={{ fontFamily: 'var(--font-display)' }}
      />

      <p className="text-[10px] text-white/25 mt-2 leading-relaxed">
        {EMAIL_CAPTURE_NOTICE}{' '}
        <a href="/legal/privacy" target="_blank" rel="noreferrer" className="text-[#00D4FF]">
          How we handle your data
        </a>
      </p>

      <label className="flex gap-2.5 mt-3 cursor-pointer">
        <input
          type="checkbox"
          checked={optIn}
          onChange={(e) => { setOptIn(e.target.checked); onHold() }}
          className="mt-0.5 h-4 w-4 shrink-0 accent-[#00D4FF]"
        />
        <span className="text-[11px] text-white/40 leading-relaxed">{MARKETING_CONSENT_STATEMENT}</span>
      </label>

      <div className="flex items-center gap-3 mt-4">
        <button
          type="submit"
          disabled={!valid || state === 'sending'}
          className="flex-1 py-2.5 rounded-xl text-xs font-bold transition-opacity disabled:opacity-30"
          style={{ background: '#00D4FF', color: '#001018', fontFamily: 'var(--font-display)' }}
        >
          {state === 'sending' ? 'Saving…' : 'Yes, email it'}
        </button>
        <button
          type="button"
          onClick={() => { funnel.leadDismiss({ source: 'quiz-build' }); onRelease() }}
          className="text-[11px] font-bold text-white/35 px-2"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          No thanks
        </button>
      </div>
    </form>
  )
}
