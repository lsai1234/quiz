'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { NOT_COVERED, REDIRECT_MEDICAL, glossaryEntry, type GlossaryKey } from '@/lib/consult/glossary'
import { screenText } from '@/lib/consult/ai/guard'
import { Glyph } from './Glyph'

/**
 * "What's this?" (build V7): a small info button beside a term, opening its
 * approved explanation. With the AI layer on, a follow-up question can be
 * asked — answered only from that explanation. A medical question is
 * redirected to a GP or pharmacist, in the browser, before anything is sent.
 */

type Ask = (key: GlossaryKey, question: string) => Promise<{ answer?: string | null; medical?: boolean }>

export const ask: Ask = async (key, question) => {
  try {
    const res = await fetch('/api/consult/explain', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, question }),
    })
    return (await res.json()) as { answer?: string | null; medical?: boolean }
  } catch {
    return { answer: null }
  }
}

interface Props {
  term: GlossaryKey
  /** Allow follow-up questions (AI layer on, and never on the circuit check). */
  questions?: boolean
  send?: Ask
}

export function WhatsThis({ term, questions = false, send = ask }: Props) {
  const [open, setOpen] = useState(false)
  const [question, setQuestion] = useState('')
  const [reply, setReply] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const panelId = useId()
  const wrap = useRef<HTMLSpanElement>(null)
  const entry = glossaryEntry(term)
  const allowQuestions = questions && term !== 'circuit-check'

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  async function submit() {
    const verdict = screenText(question)
    if (!verdict.ok) {
      setReply(verdict.reason === 'medical' ? REDIRECT_MEDICAL : null)
      return
    }
    setBusy(true)
    const res = await send(term, verdict.text)
    setBusy(false)
    setReply(res.medical ? REDIRECT_MEDICAL : res.answer ?? NOT_COVERED)
  }

  return (
    <span ref={wrap} className="relative inline-flex" onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}>
      <button
        type="button"
        aria-label={`What’s ${entry.title.toLowerCase()}?`}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={(e) => {
          e.stopPropagation()
          setOpen((o) => !o)
        }}
        className="amp-press flex items-center justify-center"
        style={{ width: 'var(--amp-space-8)', height: 'var(--amp-space-8)', borderRadius: 'var(--amp-radius-pill)', color: 'var(--amp-ink-3)' }}
      >
        <Glyph name="info" size={16} />
      </button>
      {open && (
        <span
          id={panelId}
          role="note"
          className="absolute z-30 flex flex-col amp-anim-rise"
          style={{
            right: 0,
            bottom: 'calc(100% + var(--amp-space-1))',
            width: 'min(18rem, 80vw)',
            gap: 'var(--amp-space-2)',
            padding: 'var(--amp-space-4)',
            borderRadius: 'var(--amp-radius-tile)',
            border: 'var(--amp-hairline) solid var(--amp-edge-strong)',
            background: 'var(--amp-glass-solid)',
            color: 'var(--amp-ink)',
            textAlign: 'left',
            fontSize: 'var(--amp-text-meta)',
            lineHeight: 'var(--amp-leading-body)',
            fontWeight: 'var(--amp-weight-regular)',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <strong>{entry.title}</strong>
          <span style={{ color: 'var(--amp-ink-2)' }}>{entry.body}</span>
          {allowQuestions && (
            <span className="flex flex-col" style={{ gap: 'var(--amp-space-2)' }}>
              <input
                aria-label={`Ask about ${entry.title.toLowerCase()}`}
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && void submit()}
                placeholder="Ask a question"
                style={{
                  minHeight: 'var(--amp-target)',
                  padding: '0 var(--amp-space-3)',
                  borderRadius: 'var(--amp-radius-chip)',
                  border: 'var(--amp-hairline) solid var(--amp-edge-strong)',
                  background: 'var(--amp-ground)',
                  color: 'var(--amp-ink)',
                }}
              />
              <button type="button" onClick={() => void submit()} className="amp-press self-start" style={{ color: 'var(--amp-accent)' }}>
                {busy ? 'Checking…' : 'Ask'}
              </button>
              {reply && (
                <span aria-live="polite" style={{ color: 'var(--amp-ink-2)' }}>
                  {reply}
                </span>
              )}
            </span>
          )}
        </span>
      )}
    </span>
  )
}
