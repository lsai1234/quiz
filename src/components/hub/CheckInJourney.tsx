'use client'

import { useEffect, useRef } from 'react'
import confetti from 'canvas-confetti'
import type { LineRecommendation } from '@/lib/feedback'

const ACCENT = '#00D4FF'
const GREEN = '#34d399'
const AMBER = '#fbbf24'

interface Props {
  recommendations: LineRecommendation[]
  onChange: (lineId: string) => void
  onDismiss: () => void
}

interface Group {
  key: string
  title: string
  color: string
  items: LineRecommendation[]
}

export function CheckInJourney({ recommendations, onChange, onDismiss }: Props) {
  const firedRef = useRef(false)

  const flagged = recommendations.filter((r) => r.phase === 'review')
  const working = recommendations.filter((r) => r.phase === 'working' || r.phase === 'unfelt')
  const building = recommendations.filter((r) => r.phase === 'too-early' || r.phase === 'check')

  // Celebrate when everything that can be judged is working and nothing needs a change.
  useEffect(() => {
    if (firedRef.current) return
    if (flagged.length === 0 && working.length > 0) {
      firedRef.current = true
      confetti({ particleCount: 70, spread: 70, origin: { y: 0.3 }, colors: [ACCENT, GREEN, '#ffffff'] })
    }
  }, [flagged.length, working.length])

  const groups: Group[] = [
    { key: 'flagged', title: 'Worth a look', color: AMBER, items: flagged },
    { key: 'working', title: 'Working for you', color: GREEN, items: working },
    { key: 'building', title: 'Still settling in', color: ACCENT, items: building },
  ].filter((g) => g.items.length > 0)

  return (
    <div className="rounded-2xl border p-5 mb-4"
      style={{ background: 'color-mix(in srgb, var(--color-accent) 6%, transparent)', borderColor: 'color-mix(in srgb, var(--color-accent) 25%, transparent)' }}>
      <div className="flex items-start justify-between gap-2 mb-1">
        <p className="text-sm font-bold text-[var(--color-text)]" style={{ fontFamily: 'var(--font-display)' }}>Your stack, right now</p>
        <button onClick={onDismiss} className="text-xs text-[var(--color-muted)]" aria-label="Dismiss">✕</button>
      </div>
      <p className="text-xs text-[var(--color-text-2)] leading-relaxed">
        {flagged.length > 0
          ? `Most things are landing well — ${flagged.length} ${flagged.length === 1 ? 'product' : 'products'} could be worth a tweak.`
          : 'Everything that can be felt yet is landing well. Nice work. 💪'}
      </p>

      <div className="mt-4 space-y-4">
        {groups.map((g) => (
          <div key={g.key}>
            <div className="flex items-center gap-2 mb-2">
              <span className="w-2 h-2 rounded-full" style={{ background: g.color }} />
              <p className="text-[10px] font-bold tracking-widest uppercase" style={{ color: g.color, fontFamily: 'var(--font-display)' }}>{g.title}</p>
            </div>
            <div className="space-y-2">
              {g.items.map((r) => (
                <div key={r.lineId} className="rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] p-3">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-bold text-[var(--color-text)] leading-snug" style={{ fontFamily: 'var(--font-display)' }}>{r.productTitle}</p>
                    {r.phase === 'review' && (
                      <button onClick={() => onChange(r.lineId)} className="text-xs font-bold flex-shrink-0" style={{ color: AMBER }}>
                        Find a better fit →
                      </button>
                    )}
                  </div>
                  <p className="text-[11px] text-[var(--color-text-2)] mt-1 leading-relaxed">{r.reason}</p>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
