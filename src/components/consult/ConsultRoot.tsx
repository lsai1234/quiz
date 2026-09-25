'use client'

import type { ReactNode } from 'react'
import { useReducedMotion } from '@/hooks/useReducedMotion'
import { motionVars, stateTransition } from '@/lib/consult/motion'
import { consultFontVars } from './fonts'

/**
 * The surface every consult screen sits on.
 *
 * Owns the three things a scene should never have to think about: the token
 * scope (`.amp-consult`), the motion variables (so reduced motion is decided
 * once, here) and the lit ground behind the glass. `mode` switches the whole
 * surface into the circuit check's calm register; `comfort` lifts the type and
 * target scale.
 */

interface Props {
  children: ReactNode
  mode?: 'charge' | 'calm'
  comfort?: boolean
  /** Fill the viewport (the live consult) or sit inline (the workshop). */
  fullScreen?: boolean
  className?: string
}

export function ConsultRoot({ children, mode = 'charge', comfort = false, fullScreen = true, className }: Props) {
  const reduced = useReducedMotion()
  return (
    <div
      className={`amp-consult relative isolate overflow-hidden ${consultFontVars} ${className ?? ''}`}
      data-mode={mode}
      data-comfort={comfort ? 'true' : 'false'}
      data-reduced-motion={reduced ? 'true' : 'false'}
      style={{
        ...motionVars(reduced),
        minHeight: fullScreen ? 'var(--app-height, 100dvh)' : undefined,
      }}
    >
      <Bloom />
      {children}
    </div>
  )
}

/**
 * The light behind the glass. One volt bloom high on the page, which the
 * calm mode turns most of the way down via `--amp-bloom-alpha`.
 */
function Bloom() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 -z-10"
      style={{
        background:
          'radial-gradient(ellipse 80% 45% at 50% 0%, var(--amp-accent-fill), transparent 70%), radial-gradient(ellipse 60% 40% at 50% 100%, var(--amp-accent-fill), transparent 75%)',
        opacity: 'calc(var(--amp-bloom-alpha) * 6)',
        transition: stateTransition('opacity'),
      }}
    />
  )
}
