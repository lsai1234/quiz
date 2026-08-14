'use client'

import { useEffect, useRef } from 'react'
import confetti from 'canvas-confetti'
import { Icon } from '@/components/ui/Icon'
import { IconButton } from '@/components/ui/IconButton'
import { Eyebrow } from '@/components/ui/Eyebrow'
import { ACCENT, GLASS, GREEN } from '@/lib/ui/tokens'
import { toneColor } from './StatusBadge'
import type { LineRecommendation, StatusTone } from '@/lib/feedback'

interface Props {
  recommendations: LineRecommendation[]
  onChange: (lineId: string) => void
  onDismiss: () => void
}

interface Group {
  key: StatusTone
  title: string
  items: LineRecommendation[]
}

export function CheckInJourney({ recommendations, onChange, onDismiss }: Props) {
  const firedRef = useRef(false)

  const byTone = (tone: StatusTone) => recommendations.filter((r) => r.statusTone === tone)
  const review = byTone('review')
  const good = byTone('good')
  const building = byTone('building')
  const essential = byTone('essential')

  // Celebrate when something is actively felt and nothing needs a change.
  useEffect(() => {
    if (firedRef.current) return
    if (review.length === 0 && good.length > 0) {
      firedRef.current = true
      confetti({ particleCount: 70, spread: 70, origin: { y: 0.3 }, colors: [ACCENT, GREEN, '#ffffff'] })
    }
  }, [review.length, good.length])

  const allGroups: Group[] = [
    { key: 'review', title: 'Worth a look', items: review },
    { key: 'good', title: 'Felt & working', items: good },
    { key: 'building', title: 'Building up', items: building },
    { key: 'essential', title: 'Working away in the background', items: essential },
  ]
  const groups = allGroups.filter((g) => g.items.length > 0)

  const headline =
    review.length > 0
      ? `${review.length} thing${review.length === 1 ? '' : 's'} to look at — the rest is on track.`
      : building.length > 0
        ? `On track. ${building.length} still building — give ${building.length === 1 ? 'it' : 'them'} a little time.`
        : 'Everything’s on track. Nice work.'

  return (
    <div className="rounded-2xl border p-5 mb-4"
      style={{ background: 'color-mix(in srgb, var(--color-accent) 6%, transparent)', borderColor: 'color-mix(in srgb, var(--color-accent) 25%, transparent)' }}>
      <div className="flex items-start justify-between gap-2 mb-1">
        <p className="text-sm font-bold text-[var(--color-text)]" style={{ fontFamily: 'var(--font-display)' }}>Here’s where your stack is at</p>
        <IconButton icon="x" label="Dismiss" size="sm" onClick={onDismiss} className="-mr-1 -mt-1" />
      </div>
      <p className="text-xs text-[var(--color-text-2)] leading-relaxed">{headline}</p>

      <div className="mt-4 space-y-4">
        {groups.map((g) => {
          const color = toneColor(g.key)
          return (
            <div key={g.key}>
              <div className="flex items-center gap-2 mb-2">
                <span className="w-2 h-2 rounded-full" style={{ background: color }} />
                <Eyebrow color={color}>{g.title}</Eyebrow>
              </div>
              <div className="space-y-2">
                {g.items.map((r) => (
                  <div key={r.lineId} className="rounded-xl p-3" style={{ background: GLASS.surface, border: `1px solid ${GLASS.hairline}` }}>
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-bold text-[var(--color-text)] leading-snug" style={{ fontFamily: 'var(--font-display)' }}>{r.productTitle}</p>
                      {r.phase === 'review' && (
                        <button onClick={() => onChange(r.lineId)} className="text-xs font-bold shrink-0 inline-flex items-center gap-1" style={{ color, fontFamily: 'var(--font-display)' }}>
                          Find a better fit
                          <Icon name="chevron-right" size={12} />
                        </button>
                      )}
                    </div>
                    <p className="text-[11px] text-[var(--color-text-2)] mt-1 leading-relaxed">{r.reason}</p>
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
