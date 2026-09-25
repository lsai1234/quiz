'use client'

import { useCallback, type KeyboardEvent } from 'react'
import { haptic, springTransition, stateTransition } from '@/lib/consult/motion'
import { useDrag, type DragPoint } from '../useDrag'
import { Glyph } from '../Glyph'
import type { SceneProps } from './registry'

/**
 * The charge dial (build C5).
 *
 * A battery you fill to rate 1–10. Drag across it, tap where you are, or use
 * the arrow keys — it is a real slider underneath. A word above it changes as
 * it fills, and on phones with a motor each step ticks.
 */

export const ENERGY_MIN = 1
export const ENERGY_MAX = 10

export function energyWord(level: number): string {
  if (level <= 2) return 'Running on empty'
  if (level <= 4) return 'Pretty flat'
  if (level <= 6) return 'Getting by'
  if (level <= 8) return 'Pretty charged'
  return 'Buzzing'
}

/** Where along the battery (0–1) → which level. The left edge is 1, never 0. */
export function levelAt(x: number): number {
  return Math.min(ENERGY_MAX, Math.max(ENERGY_MIN, Math.ceil(x * ENERGY_MAX)))
}

export function ChargeDial({ answers, onAnswer, onInteract, comfort }: SceneProps) {
  const level = answers.energy

  const set = useCallback(
    (next: number) => {
      const clamped = Math.min(ENERGY_MAX, Math.max(ENERGY_MIN, next))
      if (clamped !== level) {
        haptic('tick')
        onAnswer({ energy: clamped })
      }
    },
    [level, onAnswer],
  )

  const onMove = useCallback(
    (p: DragPoint) => {
      onInteract?.(p.x * 2 - 1)
      set(levelAt(p.x))
    },
    [set, onInteract],
  )
  const { ref, dragging, handlers } = useDrag<HTMLDivElement>({ onMove })

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const from = level ?? 5
    const map: Record<string, number> = {
      ArrowRight: from + 1,
      ArrowUp: from + 1,
      ArrowLeft: from - 1,
      ArrowDown: from - 1,
      PageUp: from + 3,
      PageDown: from - 3,
      Home: ENERGY_MIN,
      End: ENERGY_MAX,
    }
    if (!(e.key in map)) return
    e.preventDefault()
    set(map[e.key])
  }

  const fill = level ? level / ENERGY_MAX : 0

  // Comfort mode (C14): no dragging — a big number between two big buttons.
  if (comfort) {
    const step = (delta: number, label: string, icon: 'minus' | 'plus') => (
      <button
        type="button"
        aria-label={label}
        onClick={() => set((level ?? (delta > 0 ? 4 : 6)) + delta)}
        className="amp-press flex items-center justify-center"
        style={{ width: 'calc(var(--amp-target) * 1.25)', height: 'calc(var(--amp-target) * 1.25)', borderRadius: 'var(--amp-radius-pill)', border: 'var(--amp-hairline) solid var(--amp-accent-line)', color: 'var(--amp-accent)' }}
      >
        <Glyph name={icon} size={28} />
      </button>
    )
    return (
      <div className="flex flex-col items-center" style={{ gap: 'var(--amp-space-4)' }}>
        <div className="flex items-center" style={{ gap: 'var(--amp-space-6)' }}>
          {step(-1, 'Less energy', 'minus')}
          <p aria-live="polite" className="flex flex-col items-center">
            <span style={{ fontFamily: 'var(--amp-font-display)', fontWeight: 'var(--amp-weight-heavy)', fontSize: 'var(--amp-text-hero)', lineHeight: 1 }}>{level ?? '–'}</span>
            <span style={{ color: 'var(--amp-ink-2)' }}>out of 10</span>
          </p>
          {step(1, 'More energy', 'plus')}
        </div>
        <p className="uppercase" style={{ fontFamily: 'var(--amp-font-display)', fontWeight: 'var(--amp-weight-heavy)', fontSize: 'var(--amp-text-title)', color: level ? 'var(--amp-calm)' : 'var(--amp-ink-3)' }}>
          {level ? energyWord(level) : 'Tap to set'}
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center" style={{ gap: 'var(--amp-space-4)' }}>
      <p
        aria-hidden
        className="uppercase"
        style={{
          fontFamily: 'var(--amp-font-display)',
          fontWeight: 'var(--amp-weight-heavy)',
          fontSize: 'var(--amp-text-title)',
          color: level ? 'var(--amp-calm)' : 'var(--amp-ink-3)',
          minHeight: 'var(--amp-space-8)',
        }}
      >
        {level ? energyWord(level) : 'Drag to fill'}
      </p>

      <div className="flex w-full items-center" style={{ gap: 'var(--amp-space-4)' }}>
        <div className="flex flex-1 flex-col" style={{ gap: 'var(--amp-space-1)' }}>
          <div
            ref={ref}
            {...handlers}
            role="slider"
            tabIndex={0}
            aria-label="Afternoon energy"
            aria-valuemin={ENERGY_MIN}
            aria-valuemax={ENERGY_MAX}
            aria-valuenow={level ?? undefined}
            aria-valuetext={level ? `${level} out of 10, ${energyWord(level).toLowerCase()}` : 'Not set'}
            onKeyDown={onKeyDown}
            className="relative w-full cursor-pointer touch-none select-none"
            style={{
              height: 'calc(var(--amp-target) * 1.9)',
              padding: 'var(--amp-space-2)',
              borderRadius: 'var(--amp-radius-tile)',
              border: `calc(var(--amp-hairline) * 3) solid ${level ? 'var(--amp-ink-2)' : 'var(--amp-edge-strong)'}`,
              boxShadow: level ? '0 0 0 calc(var(--amp-hairline) * 2) var(--amp-accent-line)' : 'none',
              transition: stateTransition('border-color', 'box-shadow'),
            }}
          >
            <div
              className="h-full origin-left"
              style={{
                width: '100%',
                transform: `scaleX(${fill})`,
                borderRadius: 'var(--amp-radius-chip)',
                background: 'linear-gradient(to right, var(--amp-volt-line), var(--amp-volt))',
                boxShadow: fill ? 'var(--amp-glow)' : 'none',
                // Live under the finger; springs to a step on tap and keys.
                transition: dragging ? 'none' : springTransition('transform'),
              }}
            />
            {/* The terminal. */}
            <span
              aria-hidden
              className="absolute top-1/2 -translate-y-1/2"
              style={{
                right: 'calc(var(--amp-space-3) * -1)',
                width: 'var(--amp-space-2)',
                height: 'var(--amp-space-8)',
                borderRadius: '0 var(--amp-space-1) var(--amp-space-1) 0',
                background: 'var(--amp-ink-3)',
              }}
            />
          </div>
          <div
            aria-hidden
            className="flex justify-between"
            style={{ fontFamily: 'var(--amp-font-mono)', fontSize: 'var(--amp-text-data)', color: 'var(--amp-ink-3)' }}
          >
            <span>Flat</span>
            <span>Buzzing</span>
          </div>
        </div>

        <p aria-hidden className="flex items-baseline" style={{ minWidth: 'calc(var(--amp-space-10) * 1.6)' }}>
          <span
            style={{
              fontFamily: 'var(--amp-font-display)',
              fontWeight: 'var(--amp-weight-heavy)',
              fontSize: 'var(--amp-text-hero)',
              lineHeight: 1,
              color: level ? 'var(--amp-ink)' : 'var(--amp-ink-3)',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {level ?? '–'}
          </span>
          <span style={{ fontFamily: 'var(--amp-font-display)', fontSize: 'var(--amp-text-title)', color: 'var(--amp-ink-3)' }}>/10</span>
        </p>
      </div>
    </div>
  )
}
