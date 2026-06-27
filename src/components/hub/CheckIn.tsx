'use client'

import { useState } from 'react'
import type { CheckInPlan, FeedbackDimension } from '@/lib/feedback'

const ACCENT = '#00D4FF'
const FACES = ['😞', '😕', '😐', '🙂', '😄']
const SCALE = [1, 2, 3, 4, 5]

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

      <div className="flex gap-1.5">
        {SCALE.map((n) => (
          <button
            key={n}
            onClick={() => answer(question.dimension, n)}
            className="flex-1 aspect-square rounded-xl text-2xl flex items-center justify-center transition-all active:scale-90"
            style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
            aria-label={`${n} out of 5`}
          >
            {FACES[n - 1]}
          </button>
        ))}
      </div>
      <div className="flex justify-between mt-1.5 px-1">
        <span className="text-[10px] text-[var(--color-muted)]">Not great</span>
        <span className="text-[10px] text-[var(--color-muted)]">Brilliant</span>
      </div>

      <button onClick={reset} className="mt-4 w-full text-xs font-semibold text-[var(--color-muted)] underline">
        Cancel
      </button>
    </div>
  )
}
