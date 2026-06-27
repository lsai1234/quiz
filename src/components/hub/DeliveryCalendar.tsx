'use client'

import { formatGBP } from '@/lib/stack-blueprint/pricing'
import type { Delivery } from '@/lib/recharge/schedule'

const ACCENT = '#00D4FF'
const AMBER = '#fbbf24'

interface Props {
  deliveries: Delivery[]
  onSelect: (delivery: Delivery) => void
}

function parts(iso: string) {
  const d = new Date(iso)
  return {
    weekday: d.toLocaleDateString('en-GB', { weekday: 'short' }).toUpperCase(),
    day: d.getDate(),
    month: d.toLocaleDateString('en-GB', { month: 'short' }).toUpperCase(),
  }
}

export function DeliveryCalendar({ deliveries, onSelect }: Props) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className="text-[10px] font-bold tracking-widest uppercase text-[var(--color-muted)]" style={{ fontFamily: 'var(--font-display)' }}>
          Delivery calendar
        </p>
        <span className="text-[11px] text-[var(--color-muted)]">Tap a box to edit</span>
      </div>

      <div
        className="flex gap-3 overflow-x-auto pb-2 -mx-5 px-5"
        style={{ scrollSnapType: 'x mandatory', WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none' }}
      >
        {deliveries.map((d) => {
          const { weekday, day, month } = parts(d.date)
          const skipped = d.status === 'skipped'
          const accent = d.isNext ? ACCENT : skipped ? AMBER : 'var(--color-border-2)'
          return (
            <button
              key={d.id}
              onClick={() => onSelect(d)}
              className="flex-shrink-0 w-36 rounded-2xl p-3.5 text-left active:scale-[0.97] transition-all"
              style={{
                scrollSnapAlign: 'start',
                background: 'var(--color-surface)',
                border: `1px solid ${d.isNext ? `color-mix(in srgb, ${ACCENT} 55%, transparent)` : skipped ? `color-mix(in srgb, ${AMBER} 40%, transparent)` : 'var(--color-border)'}`,
                ...(d.isNext ? { boxShadow: `0 0 24px -10px ${ACCENT}` } : {}),
                opacity: skipped ? 0.7 : 1,
              }}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-[9px] font-bold tracking-widest uppercase" style={{ color: accent, fontFamily: 'var(--font-display)' }}>
                  {d.isNext ? 'Next' : skipped ? 'Skipped' : month}
                </span>
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: accent }} />
              </div>

              <div className="flex items-baseline gap-1.5">
                <span className="text-3xl font-black leading-none" style={{ color: 'var(--color-text)', fontFamily: 'var(--font-display)' }}>{day}</span>
                <span className="text-xs font-bold text-[var(--color-text-2)]">{weekday}</span>
              </div>

              <p className="text-[11px] text-[var(--color-muted)] mt-2 leading-snug line-clamp-2">
                {skipped
                  ? 'Tap to restore'
                  : d.items.length === 0
                    ? 'Nothing due'
                    : d.items.map((it) => it.slotTitle).slice(0, 3).join(' · ')}
              </p>

              {!skipped && d.items.length > 0 && (
                <div className="flex items-center justify-between mt-2.5">
                  <span className="text-[10px] font-bold text-[var(--color-text-2)]">{d.items.length} item{d.items.length === 1 ? '' : 's'}</span>
                  <span className="text-[11px] font-black" style={{ color: ACCENT, fontFamily: 'var(--font-display)' }}>{formatGBP(d.total)}</span>
                </div>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
