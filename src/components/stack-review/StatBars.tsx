'use client'

import { useEffect, useState, type CSSProperties } from 'react'
import { MAX_STAT, type StatBar } from '@/lib/stack-stats'

const ACCENT = '#00D4FF'

interface Props {
  bars: StatBar[]
  /** Play the fill sweep on mount (deck deal-in). When false, bars render full. */
  animate?: boolean
  /** Section label above the bars. */
  label?: string
  className?: string
  style?: CSSProperties
}

/**
 * The top-trumps stat bars — the shared visual for a product's strengths across
 * a set of axes. Targeted goals light up in accent (the product's "boost"); the
 * rest sit as faint context. Owns its own fill state so both the quiz stack
 * cards and the shop cards get the sweep for free.
 */
export function StatBars({ bars, animate = true, label = 'What it supports', className, style }: Props) {
  const [filled, setFilled] = useState(!animate)

  useEffect(() => {
    if (!animate) { setFilled(true); return }
    // Let the deck's deal-in settle first, then sweep the bars.
    const id = setTimeout(() => setFilled(true), 280)
    return () => clearTimeout(id)
  }, [animate])

  return (
    <div className={`flex flex-col gap-2 ${className ?? ''}`} style={style}>
      {label && (
        <p className="text-[9px] font-bold tracking-widest uppercase mb-0.5" style={{ color: 'var(--color-muted)', fontFamily: 'var(--font-display)' }}>
          {label}
        </p>
      )}
      {bars.map((b) => (
        <div key={b.goal} className="flex items-center gap-2.5">
          <span
            className="text-[10px] font-semibold w-[68px] flex-shrink-0 truncate"
            style={{ color: b.targeted ? 'var(--color-text)' : 'var(--color-muted)' }}
          >
            {b.label}
          </span>
          <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: 'var(--color-surface-2)' }}>
            <div
              className="h-full rounded-full"
              style={{
                width: filled ? `${(b.score / MAX_STAT) * 100}%` : '0%',
                background: b.targeted
                  ? `linear-gradient(to right, color-mix(in srgb, ${ACCENT} 55%, transparent), ${ACCENT})`
                  : 'var(--color-border-2)',
                boxShadow: b.targeted ? `0 0 8px -1px color-mix(in srgb, ${ACCENT} 60%, transparent)` : 'none',
                transition: animate ? 'width 0.7s cubic-bezier(0.22,1,0.36,1)' : 'none',
              }}
            />
          </div>
          {b.targeted && (
            <span className="text-[9px] font-black flex-shrink-0" style={{ color: ACCENT, fontFamily: 'var(--font-display)' }}>
              ✦
            </span>
          )}
        </div>
      ))}
    </div>
  )
}
