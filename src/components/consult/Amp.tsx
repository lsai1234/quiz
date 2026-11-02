'use client'

/**
 * Amp (plan Phase 7.2, redrawn in the clarity pass): a lit glass orb with two
 * glowing eyes, drawn in SVG, with a small procedural rig.
 *
 *   body      a deep teal sphere lit from inside by the accent: light pooling
 *             at the bottom, gathering softly at the edge, a sheen on top.
 *             All gradients: no outlines, no streaks
 *   face      two glowing capsule eyes and a small mouth, nothing else
 *
 * Every pose is a few CSS variables, set from props, so Amp is fully himself
 * on the first paint with no animation library:
 *
 *   state     idle (breathes) · watching (leans) · thinking (looks up) ·
 *             reading (looks down, scan line) · calm (soft, half-lidded) ·
 *             charged (lights up, grins) · hunch (narrows his eyes, leans in)
 *   rig       droop, squint and glow while an input is being dragged; curious
 *             or leaning moods from Pinpoint's model (`amp-rig.ts`)
 *   reaction  one-shots set off by an answer (U6): flex, sun, burst, jitter,
 *             eureka (the spark of a confirmed hunch), puzzled
 *
 * Glows sit behind the orb as a halo, so they light the space round him
 * rather than washing over his face.
 *
 * What needs a clock or the pointer (eyes following the finger, blinks,
 * squash and stretch on taps and Next) is `ampLife.ts`, loaded once the page
 * has been touched or gone idle: never on the first scene's path, and never
 * under reduced motion, where Amp holds each pose still.
 */

import { useEffect, useId, useRef, useState } from 'react'
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
  /** Diameter: `sm` sits inside the day ring at the top of a scene. */
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
  sm: 'calc(var(--amp-space-10) + var(--amp-space-1))',
  md: 'calc(var(--amp-space-10) + var(--amp-space-4))',
  lg: 'calc(var(--amp-space-10) * 2)',
} as const

/** On a 48-unit face: the eyes' centres and size. */
const EYE = { y: 22.6, x: { left: 17.8, right: 30.2 }, w: 5.4, h: 8.8 } as const

const MOUTH = {
  smile: 'M20.6 31.6q3.4 2.5 6.8 0',
  grin: 'M19 30.4q5 5.4 10 0',
  flat: 'M21 32.4h6',
  o: 'M24 30.6a1.7 1.7 0 1 0 0.01 0',
} as const

/** Happy, squeezed-shut eyes when he's charged. */
const HAPPY = { left: 'M14.6 24q3.2-4.2 6.4 0', right: 'M27 24q3.2-4.2 6.4 0' } as const

export function Amp({ state, size = 'sm', lean = 0, reaction = null, rig = {} }: Props) {
  const reduced = useReducedMotion()
  const self = useRef<HTMLSpanElement>(null)
  // Gradient ids, unique per Amp on the page (several share a screen in the workshop).
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '')
  const id = (name: string) => `amp-${name}-${uid}`
  // A reaction plays until its own animation ends — no timer.
  const [ended, setEnded] = useState<number | null>(null)
  const playing = reaction && reaction.id !== ended ? reaction : null
  const lit = state === 'charged'
  const quiet = state === 'calm'
  const mood = state === 'calm' || state === 'charged' ? null : rig.mood ?? null
  // What lights him: the accent, or a soft ink when he's calm.
  const tone = quiet ? 'var(--amp-ink-3)' : 'var(--amp-accent)'
  const featureInk = lit ? 'var(--amp-ink-on-accent)' : quiet ? 'var(--amp-ink-2)' : 'var(--amp-calm)'

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

  const halo = (background: string, extra: React.CSSProperties = {}) => ({
    inset: 'calc(var(--amp-space-1) * -1 - 18%)',
    borderRadius: 'var(--amp-radius-pill)',
    background,
    ...extra,
  })

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
      className="amp-character relative inline-flex shrink-0 items-center justify-center"
      style={{
        width: SIZE[size],
        height: SIZE[size],
        borderRadius: 'var(--amp-radius-pill)',
        isolation: 'isolate',
        boxShadow: quiet ? 'none' : lit ? 'var(--amp-glow-strong)' : 'var(--amp-glow-soft)',
        animation: AMP_ANIMATION[state],
        transform: state === 'watching' ? `translateX(calc(var(--amp-hairline) * ${Math.round(lean * 3)})) rotate(${Math.round(lean * 8)}deg) scale(1.06)` : undefined,
        transition: `${springTransition('transform')}, ${stateTransition('box-shadow')}`,
        ['--amp-eye' as string]: eyeOpen(state, rig),
        ['--amp-lean' as string]: state === 'watching' ? lean : 0,
      }}
    >
      {/* The light round him: follows the energy level while it's being set. */}
      {!quiet && rig.glow !== undefined && (
        <span
          aria-hidden
          data-amp-glow={rig.glow}
          className="absolute"
          style={halo('radial-gradient(circle, var(--amp-accent-glow), transparent 68%)', { opacity: rig.glow, transition: stateTransition('opacity') })}
        />
      )}
      {playing && !MOVES.has(playing.name) && (
        <span
          key={playing.id}
          aria-hidden
          className="absolute"
          style={halo(
            `radial-gradient(circle, ${playing.name === 'sun' ? 'var(--amp-sun-glow)' : playing.name === 'eureka' ? 'var(--amp-go-glow)' : 'var(--amp-accent-glow)'}, transparent 68%)`,
            { animation: AMP_REACTION[playing.name] },
          )}
        />
      )}
      <svg
        key={playing && MOVES.has(playing.name) ? playing.id : 'still'}
        className="amp-face relative"
        viewBox="0 0 48 48"
        width="100%"
        height="100%"
        aria-hidden
        style={{ animation: playing && MOVES.has(playing.name) ? AMP_REACTION[playing.name] : undefined }}
      >
        <defs>
          {/* The body: lit from inside, falling off to the ground at the edge. */}
          <radialGradient id={id('body')} cx="50%" cy="42%" r="62%">
            {lit ? (
              <>
                <stop offset="0%" style={{ stopColor: 'var(--amp-orb-lit)' }} />
                <stop offset="62%" style={{ stopColor: 'var(--amp-accent)' }} />
                <stop offset="100%" style={{ stopColor: 'var(--amp-orb-core)' }} />
              </>
            ) : (
              <>
                <stop offset="0%" style={{ stopColor: 'var(--amp-orb-core)' }} />
                <stop offset="100%" style={{ stopColor: 'var(--amp-orb-deep)' }} />
              </>
            )}
          </radialGradient>
          {/* The edge: light gathering where the glass curves away, soft, never a line. */}
          <radialGradient id={id('edge')} cx="50%" cy="50%" r="50%">
            <stop offset="78%" style={{ stopColor: tone }} stopOpacity={0} />
            <stop offset="100%" style={{ stopColor: tone }} stopOpacity={lit ? 0 : quiet ? 0.18 : 0.42} />
          </radialGradient>
          {/* The sheen across the top of the glass. */}
          <radialGradient id={id('sheen')} cx="50%" cy="50%" r="50%">
            <stop offset="0%" style={{ stopColor: 'var(--amp-ink)' }} stopOpacity={lit ? 0.45 : 0.13} />
            <stop offset="100%" style={{ stopColor: 'var(--amp-ink)' }} stopOpacity={0} />
          </radialGradient>
          {/* The light pooling in the bottom of the glass. */}
          <radialGradient id={id('under')} cx="50%" cy="50%" r="50%">
            <stop offset="0%" style={{ stopColor: tone }} stopOpacity={quiet ? 0.18 : 0.5} />
            <stop offset="100%" style={{ stopColor: tone }} stopOpacity={0} />
          </radialGradient>
          {/* The bloom round each eye: soft, no edge. */}
          <radialGradient id={id('bloom')} cx="50%" cy="50%" r="50%">
            <stop offset="0%" style={{ stopColor: 'var(--amp-accent)' }} stopOpacity={0.55} />
            <stop offset="100%" style={{ stopColor: 'var(--amp-accent)' }} stopOpacity={0} />
          </radialGradient>
          {/* The eyes: white-hot at the top, the accent's pale tint at the bottom. */}
          <linearGradient id={id('eye')} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" style={{ stopColor: quiet ? 'var(--amp-ink-2)' : 'var(--amp-ink)' }} />
            <stop offset="100%" style={{ stopColor: featureInk }} />
          </linearGradient>
        </defs>

        <circle cx="24" cy="24" r="24" fill={`url(#${id('body')})`} />
        {!lit && <ellipse cx="24" cy="36" rx="16" ry="9" fill={`url(#${id('under')})`} />}
        <circle cx="24" cy="24" r="24" fill={`url(#${id('edge')})`} />
        <ellipse cx="24" cy="11.5" rx="14" ry="7" fill={`url(#${id('sheen')})`} />

        {lit ? (
          // Charged: eyes squeezed into happy arcs.
          <g fill="none" stroke="var(--amp-ink-on-accent)" strokeWidth="2.4" strokeLinecap="round">
            <path d={HAPPY.left} />
            <path d={HAPPY.right} />
          </g>
        ) : (
          (['left', 'right'] as const).map((side) => {
            const cx = EYE.x[side]
            return (
              <g key={side} className="amp-eye" data-eye={side}>
                <g className="amp-pupil">
                  {/* The glow round the eye, then the eye. */}
                  {!quiet && <ellipse cx={cx} cy={EYE.y} rx={EYE.w * 1.25} ry={EYE.h * 0.95} fill={`url(#${id('bloom')})`} />}
                  <rect x={cx - EYE.w / 2} y={EYE.y - EYE.h / 2} width={EYE.w} height={EYE.h} rx={EYE.w / 2} fill={`url(#${id('eye')})`} />
                </g>
              </g>
            )
          })
        )}
        <path className="amp-mouth" d={MOUTH[mouthFor(state, mood)]} fill="none" strokeWidth="1.8" strokeLinecap="round" style={{ stroke: featureInk }} strokeOpacity={lit ? 1 : 0.85} />

        {/* A confirmed hunch: a spark round his head. */}
        {playing?.name === 'eureka' && (
          <g key={playing.id} className="amp-spark" strokeWidth="1.8" strokeLinecap="round" style={{ stroke: 'var(--amp-go)' }}>
            <path d="M24 -3.4v3M9.6 2.6l2 2M38.4 2.6l-2 2M-1.4 15.6h3M46.4 15.6h3" />
          </g>
        )}
      </svg>
      {state === 'reading' && (
        <span aria-hidden className="absolute inset-0 overflow-hidden" style={{ borderRadius: 'var(--amp-radius-pill)' }}>
          <span
            className="absolute inset-x-0"
            style={{
              height: '30%',
              background: 'linear-gradient(to bottom, transparent, var(--amp-accent-glow), transparent)',
              animation: AMP_SCAN,
            }}
          />
        </span>
      )}
    </span>
  )
}
