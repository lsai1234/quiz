'use client'

import type { StatusTone } from '@/lib/feedback'

const TONE: Record<StatusTone, string> = {
  good: '#34d399',
  building: '#00D4FF',
  essential: '#7dd3fc',
  review: '#fbbf24',
}

export function toneColor(tone: StatusTone): string {
  return TONE[tone]
}

interface Props {
  label: string
  icon: string
  tone: StatusTone
}

/** A small, glanceable status pill used on product cards. */
export function StatusBadge({ label, icon, tone }: Props) {
  const color = TONE[tone]
  return (
    <span
      className="inline-flex items-center gap-1 text-[9px] font-bold tracking-wide uppercase px-2 py-0.5 rounded-full flex-shrink-0"
      style={{ color, background: `color-mix(in srgb, ${color} 14%, transparent)`, fontFamily: 'var(--font-display)' }}
    >
      <span aria-hidden>{icon}</span>
      {label}
    </span>
  )
}
