'use client'

import { useState } from 'react'
import { FEEDBACK_DIMENSIONS, DIMENSION_LABEL } from '@/lib/feedback'
import type { FeedbackDimension } from '@/lib/feedback'

const ACCENT = '#00D4FF'
const SCALE = [1, 2, 3, 4, 5]

interface Props {
  lastCheckIn?: string // ISO date of most recent check-in
  onSubmit: (
    ratings: Partial<Record<FeedbackDimension, number>>,
    noticedImprovements: boolean,
    notes?: string,
  ) => void
}

export function FeedbackPanel({ lastCheckIn, onSubmit }: Props) {
  const [ratings, setRatings] = useState<Partial<Record<FeedbackDimension, number>>>({})
  const [improvements, setImprovements] = useState<boolean | null>(null)
  const [notes, setNotes] = useState('')
  const [open, setOpen] = useState(false)

  const ratedCount = Object.keys(ratings).length
  const canSubmit = ratedCount > 0 && improvements !== null

  function submit() {
    onSubmit(ratings, improvements ?? false, notes.trim() || undefined)
    setRatings({})
    setImprovements(null)
    setNotes('')
    setOpen(false)
  }

  return (
    <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-2)] p-5 mb-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-bold text-[var(--color-text)]" style={{ fontFamily: 'var(--font-display)' }}>
            How are you feeling?
          </p>
          <p className="text-xs text-[var(--color-muted)] mt-0.5">
            {lastCheckIn
              ? `Last check-in ${new Date(lastCheckIn).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`
              : 'Log a check-in so we can tailor your stack.'}
          </p>
        </div>
        {!open && (
          <button
            onClick={() => setOpen(true)}
            className="py-2 px-4 rounded-xl text-xs font-bold bg-[var(--color-accent)] text-[var(--color-bg)] active:scale-95 transition-all"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            Check in
          </button>
        )}
      </div>

      {open && (
        <div className="mt-4 space-y-4">
          {FEEDBACK_DIMENSIONS.map((dim) => (
            <div key={dim}>
              <p className="text-xs font-semibold capitalize mb-1.5" style={{ color: 'var(--color-text-2)' }}>
                {DIMENSION_LABEL[dim]}
              </p>
              <div className="flex gap-1.5">
                {SCALE.map((n) => {
                  const active = ratings[dim] === n
                  return (
                    <button
                      key={n}
                      onClick={() => setRatings((r) => ({ ...r, [dim]: n }))}
                      className="flex-1 h-9 rounded-lg text-sm font-bold transition-all active:scale-90"
                      style={{
                        background: active ? 'var(--color-accent)' : 'var(--color-surface)',
                        color: active ? 'var(--color-bg)' : 'var(--color-muted)',
                        border: '1px solid var(--color-border)',
                      }}
                    >
                      {n}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
          <p className="text-[10px] text-[var(--color-muted)] -mt-1">1 = poor · 5 = great</p>

          <div>
            <p className="text-xs font-semibold mb-1.5" style={{ color: 'var(--color-text-2)' }}>
              Noticed improvements since starting?
            </p>
            <div className="flex gap-2">
              {[{ v: true, l: 'Yes' }, { v: false, l: 'Not yet' }].map(({ v, l }) => (
                <button
                  key={l}
                  onClick={() => setImprovements(v)}
                  className="flex-1 py-2.5 rounded-xl text-xs font-bold transition-all active:scale-95"
                  style={{
                    background: improvements === v ? 'var(--color-accent)' : 'var(--color-surface)',
                    color: improvements === v ? 'var(--color-bg)' : 'var(--color-muted)',
                    border: '1px solid var(--color-border)',
                  }}
                >
                  {l}
                </button>
              ))}
            </div>
          </div>

          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Anything else? (optional)"
            rows={2}
            className="w-full px-3 py-2.5 rounded-xl text-sm outline-none resize-none"
            style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }}
          />

          <div className="flex gap-2">
            <button
              onClick={() => setOpen(false)}
              className="py-3 px-4 rounded-2xl text-sm font-semibold border border-[var(--color-border)] text-[var(--color-muted)] active:scale-95 transition-all"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              Cancel
            </button>
            <button
              onClick={submit}
              disabled={!canSubmit}
              className="flex-1 py-3 rounded-2xl text-sm font-bold bg-[var(--color-accent)] text-[var(--color-bg)] active:scale-95 transition-all disabled:opacity-50"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              Save check-in
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
