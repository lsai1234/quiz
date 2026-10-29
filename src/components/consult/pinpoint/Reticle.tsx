'use client'

import type { ReactNode } from 'react'
import { springTransition } from '@/lib/consult/motion'

/**
 * Pinpoint's signature (plan v5 §5.3): four arcs that close in as Amp gets
 * surer, and snap shut on a pinpoint. The ring is drawn once and scaled, so
 * the change rides the one spring.
 *
 * They close in round the outside of Amp's day ring (option B, agreed
 * 2026-10-29), so their day keeps filling in while Pinpoint learns it. The
 * slot stays the ring's own 48px, so nothing moves as Pinpoint starts and its
 * questions still fit a phone: the arcs draw 4px out into the space round it
 * (56px across), and close in only as far as the ring's edge.
 */
export function Reticle({ focus, children, locked = false }: { focus: number; children: ReactNode; locked?: boolean }) {
  const f = Math.max(0, Math.min(1, focus))
  // Loose at 0, against the day ring at 1, a touch tighter on a pinpoint.
  const scale = locked ? 0.91 : 1 - 0.08 * f
  const r = 47
  const quarter = (2 * Math.PI * r) / 4
  const arc = locked ? quarter * 0.86 : quarter * (0.55 + 0.25 * f)
  return (
    <span
      className="relative inline-flex shrink-0 items-center justify-center"
      style={{ width: 'calc(var(--amp-space-10) + var(--amp-space-2))', height: 'calc(var(--amp-space-10) + var(--amp-space-2))' }}
      data-reticle={locked ? 'locked' : Math.round(f * 100)}
    >
      <svg
        viewBox="0 0 100 100"
        aria-hidden
        className="absolute"
        style={{ inset: 'calc(var(--amp-space-1) * -1)', transform: `scale(${scale})`, transition: springTransition('transform'), color: 'var(--amp-accent)' }}
      >
        <circle
          cx="50"
          cy="50"
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth={locked ? 4 : 3}
          strokeLinecap="round"
          strokeDasharray={`${arc} ${quarter - arc}`}
          transform="rotate(-45 50 50)"
        />
      </svg>
      {children}
    </span>
  )
}
