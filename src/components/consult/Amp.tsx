'use client'

/**
 * Amp (plan Phase 7.2): drawn in SVG, with a small procedural rig.
 *
 * A face in the ring: the bolt as his mark, two eyes and a mouth. Every pose
 * is a few CSS variables, set from props, so Amp is fully himself on the first
 * paint with no animation library:
 *
 *   state     idle (breathes) · watching (leans) · thinking (looks up) ·
 *             reading (looks down, scan line) · calm (soft, half-lidded) ·
 *             charged (grins, bursts) · hunch (narrows his eyes, leans in)
 *   rig       droop, squint and glow while an input is being dragged; curious
 *             or leaning moods from Pinpoint's model (`amp-rig.ts`)
 *   reaction  one-shots set off by an answer (U6): flex, sun, burst, jitter,
 *             eureka (the spark of a confirmed hunch), puzzled
 *
 * What needs a clock or the pointer (eyes following the finger, blinks,
 * squash and stretch on taps and Next) is `ampLife.ts`, loaded once the page
 * has been touched or gone idle: never on the first scene's path, and never
 * under reduced motion, where Amp holds each pose still.
 */

import { useEffect, useRef, useState } from 'react'
import { eyeOpen, mouthFor, type AmpRig } from '@/lib/consult/amp-rig'
import { AMP_ANIMATION, AMP_REACTION, AMP_SCAN, springTransition, stateTransition, type AmpReaction, type AmpState } from '@/lib/consult/motion'
import { useReducedMotion } from '@/hooks/useReducedMotion'

/**
 * Amp's life, fetched once: on the first touch anywhere, or a few seconds
 * after the page has loaded and gone idle, whichever comes first.
 */
let life: Promise<typeof import('./ampLife')> | null = null
function whenLively(): Promise<typeof import('./ampLife')> {
  life ??= new Promise<void>((go) => {
    const start = () => {
      window.removeEventListener('pointerdown', start, true)
      go()
    }
    window.addEventListener('pointerdown', start, { capture: true, once: true })
    const idle = () => setTimeout(start, 3000)
    if (document.readyState === 'complete') idle()
    else window.addEventListener('load', idle, { once: true })
  }).then(() => import('./ampLife'))
  return life
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
  /** Live poses and moods (plan Phase 7.2). */
  rig?: AmpRig
}

const REACTION_NAMES = new Set(['amp-flex', 'amp-sun', 'amp-full', 'amp-eureka', 'amp-puzzled', 'amp-jitter'])
/** Reactions that move Amp, rather than glowing behind. */
const MOVES = new Set(['flex', 'puzzled', 'jitter'])

const SIZE = {
  sm: 'var(--amp-space-6)',
  md: 'var(--amp-space-10)',
  lg: 'calc(var(--amp-space-10) * 2)',
} as const

const MOUTH = {
  smile: 'M9.6 17.2q2.4 1.7 4.8 0',
  grin: 'M8.6 16.4q3.4 3.6 6.8 0',
  flat: 'M10 17.6h4',
  o: 'M12 16.6a1.1 1.1 0 1 0 0.01 0',
} as const

export function Amp({ state, size = 'sm', lean = 0, reaction = null, rig = {} }: Props) {
  const reduced = useReducedMotion()
  const self = useRef<HTMLSpanElement>(null)
  // A reaction plays until its own animation ends — no timer.
  const [ended, setEnded] = useState<number | null>(null)
  const playing = reaction && reaction.id !== ended ? reaction : null
  const lit = state === 'charged'
  const quiet = state === 'calm'
  const mood = state === 'calm' || state === 'charged' ? null : rig.mood ?? null

  // His life: the eyes, the blinks, the squash. Not under reduced motion.
  useEffect(() => {
    if (reduced || !self.current) return
    let detach: (() => void) | undefined
    let live = true
    void whenLively().then((m) => {
      if (live && self.current) detach = m.attachLife(self.current)
    })
    return () => {
      live = false
      detach?.()
    }
  }, [reduced])

  return (
    <span
      ref={self}
      role="img"
      aria-label={`Amp, ${state}`}
      data-amp-state={state}
      data-amp-mood={mood ?? undefined}
      data-amp-reaction={playing?.name}
      onAnimationEnd={(e) => {
        if (playing && REACTION_NAMES.has(e.animationName)) setEnded(playing.id)
      }}
      className="amp-character relative inline-flex shrink-0 items-center justify-center overflow-hidden"
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
        ['--amp-eye' as string]: eyeOpen(state, rig),
        ['--amp-lean' as string]: state === 'watching' ? lean : 0,
      }}
    >
      {/* The light behind him: follows the energy level while it's being set. */}
      {!quiet && rig.glow !== undefined && (
        <span
          aria-hidden
          data-amp-glow={rig.glow}
          className="absolute inset-0"
          style={{
            borderRadius: 'var(--amp-radius-pill)',
            background: 'radial-gradient(circle, var(--amp-accent-glow), transparent 72%)',
            opacity: rig.glow,
            transition: stateTransition('opacity'),
          }}
        />
      )}
      {playing && !MOVES.has(playing.name) && (
        <span
          key={playing.id}
          aria-hidden
          className="absolute inset-0"
          style={{
            borderRadius: 'var(--amp-radius-pill)',
            background: `radial-gradient(circle, ${playing.name === 'sun' ? 'var(--amp-sun-glow)' : playing.name === 'eureka' ? 'var(--amp-go-glow)' : 'var(--amp-accent-glow)'}, transparent 70%)`,
            animation: AMP_REACTION[playing.name],
          }}
        />
      )}
      <svg
        key={playing && MOVES.has(playing.name) ? playing.id : 'still'}
        className="amp-face"
        viewBox="0 0 24 24"
        width="78%"
        height="78%"
        aria-hidden
        fill="currentColor"
        style={{ animation: playing && MOVES.has(playing.name) ? AMP_REACTION[playing.name] : undefined }}
      >
        {/* His mark: the bolt, small, above the eyes. */}
        <path className="amp-mark" d="M13 2 5 13h6l-1 9 8-11h-6l1-9Z" transform="translate(9.3 2.2) scale(0.22)" />
        {lit ? (
          // Charged: eyes squeezed into happy arcs.
          <g fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
            <path d="M6.6 12.6q1.9-2.4 3.8 0" />
            <path d="M13.6 12.6q1.9-2.4 3.8 0" />
          </g>
        ) : (
          (['left', 'right'] as const).map((side) => (
            <g key={side} className="amp-eye" data-eye={side}>
              <ellipse cx={side === 'left' ? 8.5 : 15.5} cy="12" rx="2.1" ry="2.7" />
              <circle className="amp-pupil" cx={side === 'left' ? 8.5 : 15.5} cy="12.3" r="1.05" fill="var(--amp-ground)" />
            </g>
          ))
        )}
        <path className="amp-mouth" d={MOUTH[mouthFor(state, mood)]} fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        {/* A confirmed hunch: a spark round his head. */}
        {playing?.name === 'eureka' && (
          <g key={playing.id} className="amp-spark" stroke="var(--amp-go)" strokeWidth="1" strokeLinecap="round">
            <path d="M12 0.6v1.6M4.2 3.8l1.1 1.1M19.8 3.8l-1.1 1.1M1.2 10.6h1.6M21.2 10.6h1.6" />
          </g>
        )}
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
