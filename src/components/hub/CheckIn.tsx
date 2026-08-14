'use client'

import { useState } from 'react'
import { ChargeScale } from '@/components/ui/ChargeScale'
import { ACCENT } from '@/lib/ui/tokens'
import type { CheckInPlan, FeedbackDimension } from '@/lib/feedback'

interface Props {
  lastCheckIn?: string
  plan: CheckInPlan
  onComplete: (ratings: Partial<Record<FeedbackDimension, number>>) => void
}

export function CheckIn({ lastCheckIn, plan, onComplete }: Props) {
  const [open, setOpen] = useState(false)
  const [index, setIndex] = useState(0)
  const [ratings, setRatings] = useState<Partial<Record<FeedbackDimension, number>>>({})

  const { questions, expectations } = plan
  const question = questions[index]

  function reset() {
    setOpen(false)
    setIndex(0)
    setRatings({})
  }

  function answer(dim: FeedbackDimension, rating: number) {
    const next = { ...ratings, [dim]: rating }
    setRatings(next)
    if (index + 1 < questions.length) {
      setIndex(index + 1)
    } else {
      onComplete(next)
      reset()
    }
  }

  // ── Collapsed prompt ──
  if (!open) {
    return (
      <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-2)] p-5 mb-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-bold text-[var(--color-text)]" style={{ fontFamily: 'var(--font-display)' }}>How are you feeling?</p>
            <p className="text-xs text-[var(--color-muted)] mt-0.5">
              {lastCheckIn
                ? `Last check-in ${new Date(lastCheckIn).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`
                : questions.length > 0
                  ? `${questions.length} quick ${questions.length === 1 ? 'question' : 'questions'} — takes 20 seconds.`
                  : 'A quick look at how your stack is landing.'}
            </p>
          </div>
          <button
            onClick={() => setOpen(true)}
            className="py-2 px-4 rounded-xl text-xs font-bold bg-[var(--color-accent)] text-[var(--color-bg)] active:scale-95 transition-all flex-shrink-0"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            Check in
          </button>
        </div>
      </div>
    )
  }

  // ── Nothing to ask yet — pure reassurance ──
  if (questions.length === 0) {
    return (
      <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-2)] p-5 mb-4">
        <p className="text-sm font-bold text-[var(--color-text)]" style={{ fontFamily: 'var(--font-display)' }}>It&apos;s early days</p>
        <p className="text-xs text-[var(--color-text-2)] mt-1 leading-relaxed">
          Nothing to rate just yet — your stack is still settling in. Here&apos;s what to expect:
        </p>
        <div className="mt-3 space-y-2">
          {expectations.map((e) => (
            <div key={e.lineId} className="rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] p-3">
              <p className="text-xs text-[var(--color-text-2)] leading-relaxed">{e.message}</p>
            </div>
          ))}
        </div>
        <button
          onClick={() => { onComplete({}); reset() }}
          className="mt-4 w-full py-3 rounded-2xl text-sm font-bold bg-[var(--color-accent)] text-[var(--color-bg)] active:scale-95 transition-all"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          Got it
        </button>
      </div>
    )
  }

  // ── One question at a time ──
  return (
    <div className="rounded-2xl border p-5 mb-4" style={{ background: 'var(--color-surface-2)', borderColor: `color-mix(in srgb, ${ACCENT} 30%, transparent)` }}>
      {/* Progress */}
      <div className="flex items-center gap-1.5 mb-4">
        {questions.map((_, i) => (
          <div key={i} className="h-1 rounded-full flex-1 transition-all" style={{ background: i <= index ? ACCENT : 'var(--color-border-2)' }} />
        ))}
      </div>

      <p className="text-[10px] font-bold tracking-widest uppercase mb-1" style={{ color: ACCENT, fontFamily: 'var(--font-display)' }}>
        {question.immediate ? 'Felt the same session' : 'How it’s landing'}
      </p>
      <p className="text-base font-black text-[var(--color-text)] leading-snug mb-4" style={{ fontFamily: 'var(--font-display)' }}>
        {question.prompt}
      </p>

      {/* The five emoji faces this replaces were the loudest cheap thing in the
          hub. A charge meter says the same thing in the brand's own language —
          and sends the identical 1–5 rating, so nothing downstream moves. */}
      <ChargeScale
        key={question.dimension}
        label={question.prompt}
        onChange={(rating) => answer(question.dimension, rating)}
      />

      <button onClick={reset} className="mt-4 w-full text-xs font-semibold text-[var(--color-muted)] underline">
        Cancel
      </button>
    </div>
  )
}
