'use client'

import { useState } from 'react'
import { ACCENT } from '@/lib/ui/tokens'
import { EMAIL_CAPTURE_NOTICE, MARKETING_CONSENT_STATEMENT } from '@/lib/legal/content'
import { funnel } from '@/lib/analytics/quiz'
import type { LeadSource } from '@/lib/audience/types'

/**
 * "Keep your stack" — where the quiz asks for an email address.
 *
 * It sits under the stack somebody has just been given, and everything about it
 * follows from that placement:
 *
 *  • **It is a favour, not a toll.** The offer is to save the thing they are
 *    already looking at. Nothing is gated behind it, no modal covers the reveal,
 *    and the quiz prices and checks out identically for somebody who never
 *    types an address. A capture that costs a sale is not worth the address.
 *
 *  • **The tick is unticked, separate, and optional.** The button works either
 *    way, which is exactly what makes the consent freely given (UK GDPR Art.
 *    4(11)) — see the route for why bundling the two would put the whole list
 *    beyond use. The sentence beside it comes from `legal/content.ts`, which is
 *    the same string the consent record hashes, so what was shown and what was
 *    stored cannot become two different sentences.
 *
 *  • **It says what happens before it happens.** The address's purpose, the
 *    promise not to share it and the link to the privacy notice are all at the
 *    field, because Art. 13 puts the telling at the point of collection.
 *
 * The honeypot input is hidden from sight and from screen readers, and carries
 * `tabIndex={-1}` so keyboard users skip it: a bot that fills every field gives
 * itself away, and a person can never reach it by accident.
 */

export interface StackEmailPayload {
  stackName: string
  items: { title: string; reason: string }[]
  monthly: number
  oneOff: number
}

interface Props {
  /** Pre-filled for a signed-in member; they should not retype what we know. */
  defaultEmail?: string | null
  defaultFirstName?: string | null
  /**
   * True when this person has already agreed to marketing — on the build screen,
   * or at checkout. The tick is then replaced by a plain statement of what they
   * already said yes to: asking twice invites a second answer to a question that
   * has one, and a box they have to tick again reads as though the first one
   * didn't count.
   */
  alreadyOptedIn?: boolean
  source: LeadSource
  track: string | null
  primaryGoal: string | null
  stack: StackEmailPayload
  /** Remembered by the caller, so a sent or dismissed card stays gone. */
  onDone: () => void
}

type State = 'idle' | 'sending' | 'sent' | 'error'

export function SaveStackCard({
  defaultEmail, defaultFirstName, alreadyOptedIn, source, track, primaryGoal, stack, onDone,
}: Props) {
  const [email, setEmail] = useState(defaultEmail ?? '')
  const [optIn, setOptIn] = useState(alreadyOptedIn === true)
  const [website, setWebsite] = useState('')
  const [state, setState] = useState<State>('idle')

  const valid = /\S+@\S+\.\S+/.test(email.trim())

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!valid || state === 'sending') return
    setState('sending')
    funnel.leadSubmit({ source, optIn })

    try {
      const res = await fetch('/api/audience/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          firstName: defaultFirstName ?? null,
          marketingOptIn: optIn,
          source,
          track,
          primaryGoal,
          stack,
          website,
        }),
      })
      if (!res.ok) throw new Error(String(res.status))
      setState('sent')
      if (optIn) funnel.leadOptIn({ source })
    } catch {
      // The address may well have been saved; what failed is our knowing. Ask
      // once more rather than claiming a send we cannot see.
      setState('error')
    }
  }

  if (state === 'sent') {
    return (
      <div
        className="mx-5 max-w-lg lg:mx-auto rounded-2xl border px-4 py-4"
        style={{ borderColor: 'var(--color-border-2)', background: 'var(--color-surface)' }}
        role="status"
      >
        <p className="text-sm font-bold" style={{ color: 'var(--color-text)', fontFamily: 'var(--font-display)' }}>
          Sent — check your inbox
        </p>
        <p className="text-xs mt-1 leading-relaxed" style={{ color: 'var(--color-muted)' }}>
          Your stack is on its way to {email.trim()}. It has the products, what each one is for, and
          both prices — so you can pick this up whenever you like.
        </p>
        <button
          onClick={onDone}
          className="mt-3 text-xs font-bold underline underline-offset-2"
          style={{ color: ACCENT, fontFamily: 'var(--font-display)' }}
        >
          Back to my stack
        </button>
      </div>
    )
  }

  return (
    <form
      onSubmit={submit}
      className="mx-5 max-w-lg lg:mx-auto rounded-2xl border px-4 py-4"
      style={{ borderColor: 'var(--color-border-2)', background: 'var(--color-surface)' }}
    >
      <p
        className="text-[9px] font-bold tracking-widest uppercase mb-1"
        style={{ color: ACCENT, fontFamily: 'var(--font-display)' }}
      >
        Don&rsquo;t lose it
      </p>
      <h3
        className="text-lg font-black leading-tight"
        style={{ color: 'var(--color-text)', fontFamily: 'var(--font-display)' }}
      >
        Keep your stack
      </h3>

      <label htmlFor="save-stack-email" className="sr-only">
        Your email address
      </label>
      <input
        id="save-stack-email"
        type="email"
        inputMode="email"
        autoComplete="email"
        value={email}
        onChange={(e) => { setEmail(e.target.value); if (state === 'error') setState('idle') }}
        placeholder="you@example.com"
        className="w-full mt-3 px-4 py-3 rounded-xl text-sm font-medium focus:outline-none"
        style={{
          background: 'var(--color-bg)',
          border: '1px solid var(--color-border-2)',
          color: 'var(--color-text)',
        }}
      />

      {/* Not a real field. Hidden from sight, from screen readers and from the
          tab order — only something filling every input reaches it. */}
      <input
        type="text"
        name="website"
        value={website}
        onChange={(e) => setWebsite(e.target.value)}
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        style={{ position: 'absolute', left: '-9999px', width: 1, height: 1, opacity: 0 }}
      />

      <p className="text-[11px] mt-2 leading-relaxed" style={{ color: 'var(--color-muted)' }}>
        {EMAIL_CAPTURE_NOTICE}{' '}
        <a href="/legal/privacy" target="_blank" rel="noreferrer" style={{ color: ACCENT }}>
          How we handle your data
        </a>
      </p>

      {alreadyOptedIn ? (
        <p className="text-xs mt-3 leading-relaxed" style={{ color: 'var(--color-muted)' }}>
          You already asked us for tips and offers — there&rsquo;s a one-click way out at the foot
          of every one.
        </p>
      ) : (
        <label className="flex gap-3 mt-3 cursor-pointer">
          <input
            type="checkbox"
            checked={optIn}
            onChange={(e) => setOptIn(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 accent-[#00D4FF]"
          />
          <span className="text-xs leading-relaxed" style={{ color: 'var(--color-muted)' }}>
            {MARKETING_CONSENT_STATEMENT}
          </span>
        </label>
      )}

      {state === 'error' && (
        <p className="text-xs mt-3" style={{ color: '#fbbf24' }} role="alert">
          That didn&rsquo;t go through. Have another go — nothing has been sent yet.
        </p>
      )}

      <div className="flex items-center gap-3 mt-4">
        <button
          type="submit"
          disabled={!valid || state === 'sending'}
          className="flex-1 py-3 rounded-xl text-sm font-bold transition-opacity disabled:opacity-40"
          style={{ background: ACCENT, color: '#001018', fontFamily: 'var(--font-display)' }}
        >
          {state === 'sending' ? 'Sending…' : 'Email me my stack'}
        </button>
        <button
          type="button"
          onClick={() => { funnel.leadDismiss({ source }); onDone() }}
          className="text-xs font-bold px-2"
          style={{ color: 'var(--color-muted)', fontFamily: 'var(--font-display)' }}
        >
          No thanks
        </button>
      </div>
    </form>
  )
}
