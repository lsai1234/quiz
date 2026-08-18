'use client'

import { useState } from 'react'
import { Eyebrow } from './Eyebrow'
import { Button, Card, ChargeScale } from '@/components/system'
import { tint } from '@/lib/ui/tokens'
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
      <Card className="mb-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-bold text-[var(--ink-1)]" style={{ fontFamily: 'var(--font-display)' }}>How are you feeling?</p>
            <p className="text-xs text-[var(--ink-3)] mt-0.5">
              {lastCheckIn
                ? `Last check-in ${new Date(lastCheckIn).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`
                : questions.length > 0
                  ? `${questions.length} quick ${questions.length === 1 ? 'question' : 'questions'} — takes 20 seconds.`
                  : 'A quick look at how your stack is landing.'}
            </p>
          </div>
          <Button variant="primary" size="sm" onClick={() => setOpen(true)} className="shrink-0">
            Check in
          </Button>
        </div>
      </Card>
    )
  }

  // ── Nothing to ask yet — pure reassurance ──
  if (questions.length === 0) {
    return (
      <Card className="mb-4">
        <p className="text-sm font-bold text-[var(--ink-1)]" style={{ fontFamily: 'var(--font-display)' }}>It&apos;s early days</p>
        <p className="text-xs text-[var(--ink-2)] mt-1 leading-relaxed">
          Nothing to rate just yet — your stack is still settling in. Here&apos;s what to expect:
        </p>
        <div className="mt-3 space-y-2">
          {expectations.map((e) => (
            <div key={e.lineId} className="rounded-xl p-3" style={{ background: 'var(--surface-2)', border: `1px solid var(--edge)` }}>
              <p className="text-xs text-[var(--ink-2)] leading-relaxed">{e.message}</p>
            </div>
          ))}
        </div>
        <Button variant="primary" onClick={() => { onComplete({}); reset() }} className="mt-4">
          Got it
        </Button>
      </Card>
    )
  }

  // ── One question at a time ──
  return (
    <div className="rounded-2xl p-5 mb-4" style={{ background: 'var(--surface-1)', border: `1px solid ${tint('var(--accent)', 30)}` }}>
      {/* Progress */}
      <div className="flex items-center gap-1.5 mb-4">
        {questions.map((_, i) => (
          <div key={i} className="h-1 rounded-full flex-1 transition-all" style={{ background: i <= index ? 'var(--accent)' : 'var(--edge)' }} />
        ))}
      </div>

      <Eyebrow color="var(--accent)" className="mb-1">{question.immediate ? 'Felt the same session' : 'How it’s landing'}</Eyebrow>
      <p className="text-base font-black text-[var(--ink-1)] leading-snug mb-4" style={{ fontFamily: 'var(--font-display)' }}>
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

      <Button variant="ghost" size="sm" onClick={reset} className="mt-4 underline">Cancel</Button>
    </div>
  )
}
