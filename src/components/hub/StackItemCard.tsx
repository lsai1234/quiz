'use client'

import { useState } from 'react'
import { formatGBP } from '@/lib/stack-blueprint/pricing'
import { dimensionForSlot } from '@/lib/feedback'
import type { MemberSubscriptionLine } from '@/lib/recharge/types'
import type { LineRecommendation, FeedbackDimension } from '@/lib/feedback'

const ACCENT = '#00D4FF'
const GREEN = '#34d399'
const AMBER = '#fbbf24'
const MUTED = 'var(--color-muted)'

interface Props {
  line: MemberSubscriptionLine
  recommendation: LineRecommendation
  onChange: (lineId: string) => void
  onManage: (lineId: string) => void
  onMicroFeedback: (dimension: FeedbackDimension, rating: number) => void
}

function status(rec: LineRecommendation): { label: string; color: string } {
  switch (rec.phase) {
    case 'review': return { label: 'Worth reviewing', color: AMBER }
    case 'working': return { label: 'Working well', color: GREEN }
    case 'unfelt': return { label: 'Essential', color: ACCENT }
    case 'too-early': return { label: 'Settling in', color: MUTED }
    case 'check': return { label: 'Tap to rate', color: ACCENT }
  }
}

function cadence(line: MemberSubscriptionLine): string {
  const qty = line.quantity > 1 ? `${line.quantity}× · ` : ''
  return line.deliveryIntervalMonths > 1 ? `${qty}every ${line.deliveryIntervalMonths} months` : `${qty}every month`
}

// Quick inline check-in faces → 1–5 rating.
const MICRO = [
  { emoji: '😞', rating: 1, label: 'Not feeling it' },
  { emoji: '😐', rating: 3, label: 'So-so' },
  { emoji: '😄', rating: 5, label: 'Feeling great' },
]

export function StackItemCard({ line, recommendation, onChange, onManage, onMicroFeedback }: Props) {
  const { label, color } = status(recommendation)
  const review = recommendation.phase === 'review'
  const dimension = dimensionForSlot(line.stackSlot)
  // Only invite a quick rating once the product has had time to be felt.
  const canMicro = dimension != null && (recommendation.phase === 'working' || recommendation.phase === 'review' || recommendation.phase === 'check')
  const [tapped, setTapped] = useState<number | null>(null)

  function micro(rating: number) {
    if (!dimension) return
    setTapped(rating)
    onMicroFeedback(dimension, rating)
  }

  return (
    <div
      className="rounded-2xl border p-4"
      style={{
        background: 'var(--color-surface)',
        borderColor: review ? `color-mix(in srgb, ${AMBER} 40%, transparent)` : 'var(--color-border)',
      }}
    >
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <span className="text-[9px] font-bold tracking-widest uppercase px-2 py-0.5 rounded-full"
          style={{ color: ACCENT, background: `color-mix(in srgb, ${ACCENT} 12%, transparent)`, fontFamily: 'var(--font-display)' }}>
          {line.slotTitle}
        </span>
        <span className="text-[9px] font-bold tracking-wide uppercase px-2 py-0.5 rounded-full flex-shrink-0"
          style={{ color, background: `color-mix(in srgb, ${color} 14%, transparent)`, fontFamily: 'var(--font-display)' }}>
          {label}
        </span>
      </div>

      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-bold text-[var(--color-text)] leading-snug" style={{ fontFamily: 'var(--font-display)' }}>
            {line.productTitle}
          </p>
          {line.variantTitle && <p className="text-xs text-[var(--color-muted)] mt-0.5">{line.variantTitle}</p>}
          <p className="text-[11px] text-[var(--color-text-2)] mt-1">{cadence(line)}</p>
        </div>
        <span className="text-sm font-black flex-shrink-0" style={{ color: ACCENT, fontFamily: 'var(--font-display)' }}>
          {formatGBP(line.pricePerDelivery)}
        </span>
      </div>

      <p className="text-[11px] leading-relaxed mt-2.5" style={{ color: 'var(--color-text-2)' }}>
        {recommendation.reason}
      </p>

      {/* Inline micro check-in — interactive, only when the benefit can be felt */}
      {canMicro && (
        <div className="mt-3 flex items-center gap-2">
          {tapped == null ? (
            <>
              <span className="text-[11px] font-semibold text-[var(--color-muted)]">Feeling it?</span>
              <div className="flex gap-1">
                {MICRO.map((m) => (
                  <button
                    key={m.rating}
                    onClick={() => micro(m.rating)}
                    className="w-8 h-8 rounded-lg text-lg flex items-center justify-center active:scale-90 transition-all"
                    style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border)' }}
                    aria-label={m.label}
                    title={m.label}
                  >
                    {m.emoji}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <span className="text-[11px] font-semibold" style={{ color: GREEN }}>Thanks — logged ✓</span>
          )}
        </div>
      )}

      <div className="flex gap-2 mt-3">
        <button
          onClick={() => onChange(line.id)}
          className="flex-1 py-2.5 rounded-xl text-xs font-bold transition-all active:scale-95"
          style={
            review
              ? { background: `color-mix(in srgb, ${AMBER} 14%, transparent)`, color: AMBER, border: `1px solid color-mix(in srgb, ${AMBER} 30%, transparent)`, fontFamily: 'var(--font-display)' }
              : { border: '1px solid var(--color-border-2)', color: 'var(--color-text-2)', fontFamily: 'var(--font-display)' }
          }
        >
          {review ? 'Find a better fit' : 'Change product'}
        </button>
        <button
          onClick={() => onManage(line.id)}
          className="px-4 py-2.5 rounded-xl text-xs font-bold transition-all active:scale-95"
          style={{ border: '1px solid var(--color-border-2)', color: 'var(--color-text-2)', fontFamily: 'var(--font-display)' }}
        >
          Manage
        </button>
      </div>
    </div>
  )
}
