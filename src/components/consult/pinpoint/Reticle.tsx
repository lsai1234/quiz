'use client'

import type { ReactNode } from 'react'
import { springTransition } from '@/lib/consult/motion'

/**
 * Pinpoint's signature (plan v5 §5.3): Amp inside a focusing ring. Four arcs
 * that close in as Amp gets surer, and snap shut on a pinpoint. The ring is
 * drawn once and scaled, so the change rides the one spring.
 */
export function Reticle({ focus, children, locked = false }: { focus: number; children: ReactNode; locked?: boolean }) {
  const f = Math.max(0, Math.min(1, focus))
  // A loose ring at 0, tight around Amp at 1.
  const scale = locked ? 0.74 : 1 - 0.22 * f
  const r = 44
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
        className="absolute inset-0 h-full w-full"
        style={{ transform: `scale(${scale})`, transition: springTransition('transform'), color: 'var(--amp-accent)' }}
      >
        <circle
          cx="50"
          cy="50"
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth={locked ? 5 : 4}
          strokeLinecap="round"
          strokeDasharray={`${arc} ${quarter - arc}`}
          transform="rotate(-45 50 50)"
        />
      </svg>
      {children}
    </span>
  )
}
