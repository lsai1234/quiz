'use client'

import { springTransition, stateTransition } from '@/lib/consult/motion'

/**
 * Progress through the consult, as a battery (build S6).
 *
 * Split into one cell per section. Completed cells are full, the current one
 * fills with the scenes done inside it, later ones are empty. A completed
 * section is a button: tapping it jumps back to that section's first scene.
 * The current and later sections are not — you cannot jump ahead of what you
 * have answered.
 *
 * The fill moves on the spring, so a jump back drains visibly rather than
 * snapping; the percentage beside it is the same number, rounded.
 */

export interface MeterSection {
  id: string
  label: string
  /** 0–1: how much of this section is answered. */
  fill: number
}

interface Props {
  sections: MeterSection[]
  /** The section the visitor is in now. */
  currentId: string
  /** Called with a completed section's id. Omit to make the meter read-only. */
  onJump?: (sectionId: string) => void
  /** Show the percentage beside the battery. */
  showPercent?: boolean
}

export function chargePercent(sections: MeterSection[]): number {
  if (sections.length === 0) return 0
  const total = sections.reduce((sum, s) => sum + Math.min(1, Math.max(0, s.fill)), 0)
  return Math.round((total / sections.length) * 100)
}

export function ChargeMeter({ sections, currentId, onJump, showPercent = true }: Props) {
  const percent = chargePercent(sections)
  const currentIndex = sections.findIndex((s) => s.id === currentId)

  return (
    <div className="flex items-center" style={{ gap: 'var(--amp-space-2)' }}>
      <div
        role="group"
        aria-label={`Charge ${percent}%`}
        className="relative flex items-stretch"
        style={{
          gap: 'calc(var(--amp-hairline) * 2)',
          padding: 'calc(var(--amp-hairline) * 3)',
          borderRadius: 'var(--amp-radius-chip)',
          border: 'var(--amp-hairline) solid var(--amp-edge-strong)',
          height: 'var(--amp-space-5)',
        }}
      >
        {sections.map((section, i) => {
          const done = section.fill >= 1 && i < currentIndex
          const jumpable = Boolean(onJump) && done
          const fill = Math.min(1, Math.max(0, section.fill))
          const cell = (
            <span
              aria-hidden
              className="relative block h-full overflow-hidden"
              style={{
                width: 'var(--amp-space-3)',
                borderRadius: 'calc(var(--amp-hairline) * 2)',
                background: 'var(--amp-edge)',
              }}
            >
              <span
                className="absolute inset-0 origin-left"
                style={{
                  background: 'var(--amp-accent)',
                  boxShadow: fill > 0 ? 'var(--amp-glow-soft)' : 'none',
                  transform: `scaleX(${fill})`,
                  transition: springTransition('transform'),
                }}
              />
            </span>
          )
          return jumpable ? (
            <button
              key={section.id}
              type="button"
              onClick={() => onJump?.(section.id)}
              aria-label={`Back to ${section.label}`}
              className="amp-press relative flex h-full items-stretch"
              style={{ borderRadius: 'var(--amp-space-1)' }}
            >
              {cell}
            </button>
          ) : (
            <span key={section.id} className="flex h-full" aria-current={i === currentIndex ? 'step' : undefined}>
              {cell}
            </span>
          )
        })}
        {/* The battery's terminal nub. */}
        <span
          aria-hidden
          className="absolute top-1/2 -translate-y-1/2"
          style={{
            right: 'calc(var(--amp-space-1) * -1 - var(--amp-hairline) * 2)',
            width: 'var(--amp-space-1)',
            height: 'var(--amp-space-2)',
            borderRadius: '0 var(--amp-hairline) var(--amp-hairline) 0',
            background: 'var(--amp-edge-strong)',
          }}
        />
      </div>
      {showPercent && (
        <span
          aria-hidden
          style={{
            fontFamily: 'var(--amp-font-mono)',
            fontSize: 'var(--amp-text-data)',
            letterSpacing: 'var(--amp-tracking-data)',
            color: 'var(--amp-accent)',
            minWidth: 'calc(var(--amp-space-8) + var(--amp-space-1))',
            textAlign: 'right',
            fontVariantNumeric: 'tabular-nums',
            transition: stateTransition('color'),
          }}
        >
          {percent}%
        </span>
      )}
    </div>
  )
}
