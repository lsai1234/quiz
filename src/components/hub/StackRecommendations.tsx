'use client'

import type { LineRecommendation } from '@/lib/feedback'

const ACCENT = '#00D4FF'
const AMBER = '#fbbf24'

interface Props {
  recommendations: LineRecommendation[]
  hasFeedback: boolean
  onSwap: (lineId: string) => void
}

export function StackRecommendations({ recommendations, hasFeedback, onSwap }: Props) {
  if (recommendations.length === 0) return null

  const changes = recommendations.filter((r) => r.action === 'consider-change')

  return (
    <div className="mb-4">
      <p className="text-[10px] font-bold tracking-widest uppercase text-[var(--color-muted)] mb-1" style={{ fontFamily: 'var(--font-display)' }}>
        What to keep vs change
      </p>
      <p className="text-xs text-[var(--color-muted)] mb-3 leading-relaxed">
        {hasFeedback
          ? changes.length > 0
            ? `Based on your check-ins, ${changes.length} ${changes.length === 1 ? 'product' : 'products'} might be worth changing. The rest are working — or are essentials you keep regardless.`
            : 'Everything looks good — your feeling-based products are working and your essentials stay put.'
          : 'Essentials are kept regardless of how you feel. Log a check-in to get advice on the rest.'}
      </p>

      <div className="space-y-2.5">
        {recommendations.map((rec) => {
          const isChange = rec.action === 'consider-change'
          const color = isChange ? AMBER : ACCENT
          return (
            <div
              key={rec.lineId}
              className="rounded-2xl border p-4"
              style={{
                background: 'var(--color-surface)',
                borderColor: isChange ? `color-mix(in srgb, ${AMBER} 40%, transparent)` : 'var(--color-border)',
              }}
            >
              <div className="flex items-start justify-between gap-2 mb-1">
                <p className="text-sm font-bold text-[var(--color-text)] leading-snug" style={{ fontFamily: 'var(--font-display)' }}>
                  {rec.productTitle}
                </p>
                <span
                  className="text-[9px] font-bold tracking-wide uppercase px-2 py-0.5 rounded-full flex-shrink-0"
                  style={{ color, background: `color-mix(in srgb, ${color} 12%, transparent)`, fontFamily: 'var(--font-display)' }}
                >
                  {isChange ? 'Consider changing' : 'Keep'}
                </span>
              </div>
              <p className="text-xs leading-relaxed" style={{ color: 'var(--color-text-2)' }}>
                {rec.reason}
              </p>
              {isChange && (
                <button
                  onClick={() => onSwap(rec.lineId)}
                  className="mt-3 w-full py-2.5 rounded-xl text-xs font-bold transition-all active:scale-95"
                  style={{ background: `color-mix(in srgb, ${AMBER} 14%, transparent)`, color: AMBER, border: `1px solid color-mix(in srgb, ${AMBER} 30%, transparent)`, fontFamily: 'var(--font-display)' }}
                >
                  See alternatives
                </button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
