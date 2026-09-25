'use client'

/**
 * Amp, before the animated one (build S10).
 *
 * A bolt in a ring, with a CSS state for each of the character's moods, so Amp
 * is on screen from day one and the flow already drives him through the right
 * states. The Rive character (U5) replaces the drawing and keeps this API.
 *
 *   idle      slow breathe while you decide
 *   watching  leans toward whatever you're touching
 *   thinking  flickers while reading "tell Amp more"
 *   reading   a scan line during uploads
 *   calm      soft and still for the circuit check
 *   charged   full burst at the charge-up
 */

import { AMP_ANIMATION, AMP_SCAN, springTransition, stateTransition, type AmpState } from '@/lib/consult/motion'

export type { AmpState }

interface Props {
  state: AmpState
  /** Diameter, in the spacing scale's units. */
  size?: 'sm' | 'md' | 'lg'
  /** For "watching": which way to lean, -1 (left) to 1 (right). */
  lean?: number
}

const SIZE = {
  sm: 'var(--amp-space-6)',
  md: 'var(--amp-space-10)',
  lg: 'calc(var(--amp-space-10) * 2)',
} as const

export function Amp({ state, size = 'sm', lean = 0 }: Props) {
  const lit = state === 'charged'
  const quiet = state === 'calm'
  return (
    <span
      role="img"
      aria-label={`Amp, ${state}`}
      data-amp-state={state}
      className="relative inline-flex shrink-0 items-center justify-center overflow-hidden"
      style={{
        width: SIZE[size],
        height: SIZE[size],
        borderRadius: 'var(--amp-radius-pill)',
        border: `var(--amp-hairline) solid ${lit ? 'transparent' : quiet ? 'var(--amp-edge-strong)' : 'var(--amp-accent-line)'}`,
        background: lit ? 'var(--amp-accent)' : quiet ? 'var(--amp-glass-solid)' : 'var(--amp-accent-fill)',
        color: lit ? 'var(--amp-ink-on-accent)' : quiet ? 'var(--amp-ink-2)' : 'var(--amp-accent)',
        boxShadow: quiet ? 'none' : lit ? 'var(--amp-glow-strong)' : 'var(--amp-glow-soft)',
        animation: AMP_ANIMATION[state],
        transform: state === 'watching' ? `translateX(calc(var(--amp-hairline) * ${Math.round(lean * 3)})) rotate(${Math.round(lean * 8)}deg) scale(1.06)` : undefined,
        transition: `${springTransition('transform')}, ${stateTransition('background-color', 'box-shadow')}`,
      }}
    >
      <svg viewBox="0 0 24 24" width="58%" height="58%" aria-hidden fill="currentColor">
        <path d="M13 2 5 13h6l-1 9 8-11h-6l1-9Z" />
      </svg>
      {state === 'reading' && (
        <span
          aria-hidden
          className="absolute inset-x-0"
          style={{
            height: '30%',
            background: 'linear-gradient(to bottom, transparent, var(--amp-accent-glow), transparent)',
            animation: AMP_SCAN,
          }}
        />
      )}
    </span>
  )
}
