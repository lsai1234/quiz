'use client'

/**
 * Amp, before the animated one (build S10).
 *
 * A bolt in a ring, with a CSS state for each of the character's moods, so Amp
 * is on screen from day one and the flow already drives him through the right
 * states. The Rive character (U5) replaces the drawing and keeps this API:
 * with NEXT_PUBLIC_AMP_RIVE on, `AmpRive` loads once the page is idle and
 * crossfades in over this drawing after its first frame — see `ampRive.ts`.
 *
 *   idle      slow breathe while you decide
 *   watching  leans toward whatever you're touching
 *   thinking  flickers while reading "tell Amp more"
 *   reading   a scan line during uploads
 *   calm      soft and still for the circuit check
 *   charged   full burst at the charge-up
 */

import dynamic from 'next/dynamic'
import { useEffect, useState } from 'react'
import { ampRiveEnabled } from '@/lib/consult/ampRive'
import { AMP_ANIMATION, AMP_REACTION, AMP_SCAN, springTransition, stateTransition, type AmpReaction, type AmpState } from '@/lib/consult/motion'
import { useReducedMotion } from '@/hooks/useReducedMotion'

const AmpRive = dynamic(() => import('./AmpRive'), { ssr: false })

/** Wait for the page to be idle before fetching the Rive runtime: never on the first paint's path. */
function useRiveUpgrade(): boolean {
  const reduced = useReducedMotion()
  const [go, setGo] = useState(false)
  useEffect(() => {
    if (!ampRiveEnabled() || reduced) return
    const w = window as Window & { requestIdleCallback?: (cb: () => void) => number; cancelIdleCallback?: (id: number) => void }
    if (w.requestIdleCallback) {
      const id = w.requestIdleCallback(() => setGo(true))
      return () => w.cancelIdleCallback?.(id)
    }
    const t = setTimeout(() => setGo(true), 1)
    return () => clearTimeout(t)
  }, [reduced])
  return go
}

export type { AmpState }

interface Props {
  state: AmpState
  /** Diameter, in the spacing scale's units. */
  size?: 'sm' | 'md' | 'lg'
  /** For "watching": which way to lean, -1 (left) to 1 (right). */
  lean?: number
  /** A micro-reaction to play once (U6). A new `id` plays it again. */
  reaction?: { name: AmpReaction; id: number } | null
}

const REACTION_NAMES = new Set(['amp-flex', 'amp-sun', 'amp-full'])

const SIZE = {
  sm: 'var(--amp-space-6)',
  md: 'var(--amp-space-10)',
  lg: 'calc(var(--amp-space-10) * 2)',
} as const

export function Amp({ state, size = 'sm', lean = 0, reaction = null }: Props) {
  const upgrade = useRiveUpgrade()
  const [rive, setRive] = useState(false)
  // A reaction plays until its own animation ends — no timer.
  const [ended, setEnded] = useState<number | null>(null)
  const playing = reaction && reaction.id !== ended ? reaction : null
  // Once Rive has drawn, it is the whole character: the ring and bolt step aside.
  const lit = state === 'charged' && !rive
  const quiet = state === 'calm' && !rive
  return (
    <span
      role="img"
      aria-label={`Amp, ${state}`}
      data-amp-state={state}
      data-amp-drawn={rive ? 'rive' : 'css'}
      data-amp-reaction={playing?.name}
      onAnimationEnd={(e) => {
        if (playing && REACTION_NAMES.has(e.animationName)) setEnded(playing.id)
      }}
      className="relative inline-flex shrink-0 items-center justify-center overflow-hidden"
      style={{
        width: SIZE[size],
        height: SIZE[size],
        borderRadius: 'var(--amp-radius-pill)',
        // Rive's burst can reach past the ring.
        overflow: rive ? 'visible' : undefined,
        border: `var(--amp-hairline) solid ${rive || lit ? 'transparent' : quiet ? 'var(--amp-edge-strong)' : 'var(--amp-accent-line)'}`,
        background: rive ? 'transparent' : lit ? 'var(--amp-accent)' : quiet ? 'var(--amp-glass-solid)' : 'var(--amp-accent-fill)',
        color: lit ? 'var(--amp-ink-on-accent)' : quiet ? 'var(--amp-ink-2)' : 'var(--amp-accent)',
        boxShadow: rive || quiet ? 'none' : lit ? 'var(--amp-glow-strong)' : 'var(--amp-glow-soft)',
        animation: rive ? undefined : AMP_ANIMATION[state],
        transform: !rive && state === 'watching' ? `translateX(calc(var(--amp-hairline) * ${Math.round(lean * 3)})) rotate(${Math.round(lean * 8)}deg) scale(1.06)` : undefined,
        transition: `${springTransition('transform')}, ${stateTransition('background-color', 'box-shadow')}`,
      }}
    >
      {!rive && playing && playing.name !== 'flex' && (
        <span
          key={playing.id}
          aria-hidden
          className="absolute inset-0"
          style={{
            borderRadius: 'var(--amp-radius-pill)',
            background: `radial-gradient(circle, ${playing.name === 'sun' ? 'var(--amp-sun-glow)' : 'var(--amp-accent-glow)'}, transparent 70%)`,
            animation: AMP_REACTION[playing.name],
          }}
        />
      )}
      <svg
        key={playing?.name === 'flex' ? playing.id : 'still'}
        viewBox="0 0 24 24"
        width="58%"
        height="58%"
        aria-hidden
        fill="currentColor"
        style={{ opacity: rive ? 0 : 1, transition: stateTransition('opacity'), animation: playing?.name === 'flex' ? AMP_REACTION.flex : undefined }}
      >
        <path d="M13 2 5 13h6l-1 9 8-11h-6l1-9Z" />
      </svg>
      {upgrade && <AmpRive state={state} lean={lean} reaction={reaction} ready={rive} onReady={() => setRive(true)} />}
      {state === 'reading' && !rive && (
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
