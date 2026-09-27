'use client'

import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { HELD_BACK, MAX_TEXT } from '@/lib/consult/ai/guard'
import type { ProbePick } from '@/lib/consult/ai/pinpoint'
import type { ConsultAnswers } from '@/lib/consult/types'
import { NextButton, QuietLink } from '../controls'
import { tellPinpoint } from './pinpointAi'

/**
 * Typing for Pinpoint (plan v5 §7): "Tell me about a bad day" before the
 * round, and "It's more complicated" on a question. What's typed is read into
 * answers for the questions listed, and handed back; nothing is a chat reply.
 * Health details are stopped here, before anything is sent.
 */
export function TellSheet({
  title,
  prompt,
  example,
  candidates,
  answers,
  onPicks,
  onClose,
  onThinking,
  nothing,
  tell = tellPinpoint,
}: {
  title: string
  prompt: string
  example: string
  candidates: string[]
  answers: ConsultAnswers
  onPicks: (picks: ProbePick[]) => void
  onClose: () => void
  onThinking?: (thinking: boolean) => void
  /** What to say when nothing matched. */
  nothing: string
  tell?: typeof tellPinpoint
}) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const box = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    box.current?.focus()
  }, [])

  async function send() {
    setBusy(true)
    onThinking?.(true)
    setMessage(null)
    const res = await tell(text, candidates, answers)
    setBusy(false)
    onThinking?.(false)
    if ('picks' in res) {
      if (res.picks.length) return onPicks(res.picks)
      return setMessage(nothing)
    }
    if ('held' in res) {
      if (res.held === 'medical' || res.held === 'too-long') return setMessage(HELD_BACK[res.held])
      if (res.held === 'empty') return setMessage(null)
      return setMessage('I can’t use that one. Try saying it another way?')
    }
    setMessage('I couldn’t read that just now. You can answer on screen as normal.')
  }

  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center"
      style={{ background: 'var(--amp-scrim)' }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
      onKeyDown={(e: KeyboardEvent<HTMLDivElement>) => e.key === 'Escape' && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="amp-anim-rise w-full"
        style={{
          maxWidth: 'var(--amp-column)',
          padding: 'var(--amp-space-5) var(--amp-gutter) max(var(--amp-space-5), env(safe-area-inset-bottom))',
          borderRadius: 'var(--amp-radius-panel) var(--amp-radius-panel) 0 0',
          border: 'var(--amp-hairline) solid var(--amp-edge-strong)',
          background: 'var(--amp-glass-raised)',
          backdropFilter: 'blur(var(--amp-glass-blur)) saturate(var(--amp-glass-saturate))',
        }}
      >
        <div className="flex items-center justify-between">
          <p className="uppercase" style={{ fontFamily: 'var(--amp-font-label)', fontSize: 'var(--amp-text-data)', letterSpacing: 'var(--amp-tracking-data)', color: 'var(--amp-ink-3)' }}>
            {title}
          </p>
          <QuietLink icon="close" aria-label="Close" onClick={onClose}>
            {''}
          </QuietLink>
        </div>
        <label htmlFor="amp-pinpoint-tell" style={{ display: 'block', marginTop: 'var(--amp-space-2)', color: 'var(--amp-ink)' }}>
          {prompt}
        </label>
        <textarea
          id="amp-pinpoint-tell"
          ref={box}
          value={text}
          maxLength={MAX_TEXT}
          rows={4}
          placeholder={example}
          onChange={(e) => setText(e.target.value)}
          className="w-full"
          style={{
            marginTop: 'var(--amp-space-3)',
            padding: 'var(--amp-space-3)',
            borderRadius: 'var(--amp-radius-tile)',
            border: 'var(--amp-hairline) solid var(--amp-edge-strong)',
            background: 'var(--amp-glass-solid)',
            color: 'var(--amp-ink)',
            resize: 'none',
          }}
        />
        <p style={{ marginTop: 'var(--amp-space-2)', fontSize: 'var(--amp-text-meta)', color: 'var(--amp-ink-2)' }}>
          Leave out medical details — the circuit check covers those, and they’re never sent to AI.
        </p>
        <div aria-live="polite">{message && <p style={{ marginTop: 'var(--amp-space-3)', fontSize: 'var(--amp-text-meta)', color: 'var(--amp-caution)' }}>{message}</p>}</div>
        <div style={{ marginTop: 'var(--amp-space-4)' }}>
          <NextButton ready={!busy && text.trim().length > 0} nudge="Type something first." onClick={() => void send()}>
            {busy ? 'Amp is reading…' : 'Send to Amp'}
          </NextButton>
        </div>
      </div>
    </div>
  )
}
