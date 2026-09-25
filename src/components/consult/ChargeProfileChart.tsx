'use client'

import { useEffect, useState } from 'react'
import { PROFILE_AREAS, PROFILE_LABEL, type ChargeProfile } from '@/lib/consult/profile'
import { useReducedMotion } from '@/hooks/useReducedMotion'
import { chargeTransition } from '@/lib/consult/motion'

/**
 * The charge profile, drawn (build H5).
 *
 * A six-point radar in hand-drawn SVG — no chart library for forty lines of
 * geometry. Three rings for scale, six spokes, the shape, and each area's
 * label with its number. The shape grows in from the centre when `grow` turns
 * on (the analysis starting), and is simply there under reduced motion.
 *
 * The numbers are text, not just the shape, so it reads on a small phone and
 * to a screen reader: the whole chart is one image with a description listing
 * all six.
 */

/**
 * Wider than tall: the side labels ("RECOVERY", "NUTRITION") run outwards from
 * the rings and need the room, or a small phone clips their first letters.
 */
const W = 360
const H = 300
const CX = W / 2
const CY = H / 2
const R = 92
/** Where the labels sit, outside the outer ring. */
const LABEL_R = R + 26

function point(i: number, r: number): [number, number] {
  // Start at the top and go clockwise.
  const a = -Math.PI / 2 + (i * 2 * Math.PI) / PROFILE_AREAS.length
  return [CX + r * Math.cos(a), CY + r * Math.sin(a)]
}

export function ChargeProfileChart({ profile, grow = true }: { profile: ChargeProfile; grow?: boolean }) {
  const reduced = useReducedMotion()
  const [scale, setScale] = useState(grow && !reduced ? 0 : 1)

  useEffect(() => {
    if (!grow) return
    // Next frame, so the transition has a start to run from.
    const id = requestAnimationFrame(() => setScale(1))
    return () => cancelAnimationFrame(id)
  }, [grow])

  const shape = PROFILE_AREAS.map((area, i) => point(i, (R * profile[area]) / 100).join(',')).join(' ')
  const description = PROFILE_AREAS.map((a) => `${PROFILE_LABEL[a]} ${profile[a]}`).join(', ')

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={`Your charge profile: ${description}`} style={{ maxWidth: '22rem', display: 'block', margin: '0 auto', overflow: 'visible' }}>
      {[1 / 3, 2 / 3, 1].map((f) => (
        <polygon
          key={f}
          points={PROFILE_AREAS.map((_, i) => point(i, R * f).join(',')).join(' ')}
          fill="none"
          stroke="var(--amp-edge-strong)"
          strokeWidth={1}
        />
      ))}
      {PROFILE_AREAS.map((_, i) => {
        const [x, y] = point(i, R)
        return <line key={i} x1={CX} y1={CY} x2={x} y2={y} stroke="var(--amp-edge)" strokeWidth={1} />
      })}
      <g
        data-profile-shape
        style={{
          transformOrigin: `${CX}px ${CY}px`,
          transform: `scale(${scale})`,
          transition: chargeTransition('transform'),
        }}
      >
        <polygon points={shape} fill="var(--amp-accent-fill)" stroke="var(--amp-accent)" strokeWidth={2.5} strokeLinejoin="round" />
      </g>
      {PROFILE_AREAS.map((area, i) => {
        const [x, y] = point(i, LABEL_R)
        const anchor = Math.abs(x - CX) < 4 ? 'middle' : x > CX ? 'start' : 'end'
        return (
          <g key={area} aria-hidden>
            <text x={x} y={y - 4} textAnchor={anchor} style={{ fontFamily: 'var(--amp-font-mono)', fontSize: 11, letterSpacing: '0.12em', fill: 'var(--amp-ink-3)' }}>
              {PROFILE_LABEL[area].toUpperCase()}
            </text>
            <text x={x} y={y + 13} textAnchor={anchor} style={{ fontFamily: 'var(--amp-font-mono)', fontSize: 14, fontWeight: 600, fill: 'var(--amp-ink)' }}>
              {profile[area]}
            </text>
          </g>
        )
      })}
    </svg>
  )
}
