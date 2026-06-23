'use client'

import { formatGBP } from '@/lib/stack-blueprint/pricing'
import type { MemberSubscriptionLine } from '@/lib/recharge/types'
import type { LineRecommendation } from '@/lib/feedback'

const ACCENT = '#00D4FF'
const GREEN = '#34d399'
const AMBER = '#fbbf24'

interface Props {
  line: MemberSubscriptionLine
  recommendation: LineRecommendation
  onChange: (lineId: string) => void
}

function status(rec: LineRecommendation): { label: string; color: string } {
  if (rec.action === 'consider-change') return { label: 'Worth reviewing', color: AMBER }
  if (rec.basis === 'objective') return { label: 'Essential', color: ACCENT }
  return { label: 'Working well', color: GREEN }
}

function cadence(line: MemberSubscriptionLine): string {
  const qty = line.quantity > 1 ? `${line.quantity}× · ` : ''
  return line.deliveryIntervalMonths > 1 ? `${qty}every ${line.deliveryIntervalMonths} months` : `${qty}every month`
}

export function StackItemCard({ line, recommendation, onChange }: Props) {
  const { label, color } = status(recommendation)
  const review = recommendation.action === 'consider-change'

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

      <button
        onClick={() => onChange(line.id)}
        className="mt-3 w-full py-2.5 rounded-xl text-xs font-bold transition-all active:scale-95"
        style={
          review
            ? { background: `color-mix(in srgb, ${AMBER} 14%, transparent)`, color: AMBER, border: `1px solid color-mix(in srgb, ${AMBER} 30%, transparent)`, fontFamily: 'var(--font-display)' }
            : { border: '1px solid var(--color-border-2)', color: 'var(--color-text-2)', fontFamily: 'var(--font-display)' }
        }
      >
        {review ? 'Find a better fit' : 'Change product'}
      </button>
    </div>
  )
}
