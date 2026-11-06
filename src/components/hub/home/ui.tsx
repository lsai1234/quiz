'use client'

import type { CSSProperties, ReactNode } from 'react'

/** Shared pieces of the member hub's home: tokens only. */

export const eyebrow: CSSProperties = {
  fontFamily: 'var(--font-display)',
  fontSize: 'var(--text-micro)',
  fontWeight: 'var(--weight-strong)',
  letterSpacing: 'var(--tracking-eyebrow)',
  textTransform: 'uppercase',
  color: 'var(--accent)',
}
export const quietEyebrow: CSSProperties = { ...eyebrow, color: 'var(--ink-3)' }
export const titleStyle: CSSProperties = {
  fontFamily: 'var(--font-display)',
  fontSize: 'var(--text-title)',
  fontWeight: 'var(--weight-strong)',
  letterSpacing: 'var(--tracking-title)',
  lineHeight: 'var(--leading-tight)',
  color: 'var(--ink-1)',
}
export const strong: CSSProperties = { color: 'var(--ink-1)', fontSize: 'var(--text-body)', fontWeight: 'var(--weight-strong)', lineHeight: 'var(--leading-snug)' }
export const body: CSSProperties = { color: 'var(--ink-2)', fontSize: 'var(--text-body-sm)', lineHeight: 'var(--leading-body)' }
export const meta: CSSProperties = { color: 'var(--ink-3)', fontSize: 'var(--text-meta)', lineHeight: 'var(--leading-snug)' }
export const col = (gap: string): CSSProperties => ({ display: 'flex', flexDirection: 'column', gap })

/** A card that rises in on the spring, in order. */
export function Rise({
  i,
  children,
  className,
  id,
  style,
  ...rest
}: { i: number; children: ReactNode; className?: string; id?: string; style?: CSSProperties } & Record<`data-${string}`, unknown>) {
  return (
    <div id={id} className={`hub-rise ${className ?? ''}`} style={{ ['--rise-i' as string]: i, ...style } as CSSProperties} {...rest}>
      {children}
    </div>
  )
}

/** A section's heading, with an optional action on the right. */
export function SectionHead({ title, eyebrowText, action }: { title: string; eyebrowText?: string; action?: ReactNode }) {
  return (
    <div className="flex items-end justify-between" style={{ gap: 'var(--space-3)', marginBottom: 'var(--space-3)' }}>
      <div className="min-w-0">
        {eyebrowText && <p style={eyebrow}>{eyebrowText}</p>}
        <h2 style={{ ...titleStyle, marginTop: eyebrowText ? 'var(--space-1)' : 0 }}>{title}</h2>
      </div>
      {action}
    </div>
  )
}

/**
 * A ring of progress, drawn on. `value` 0–1; the children sit in the middle.
 * Its name is the label: the ring itself is decoration around the words.
 */
export function Ring({ value, size, stroke, label, children }: { value: number; size: number; stroke: number; label: string; children?: ReactNode }) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const v = Math.max(0, Math.min(1, value))
  return (
    <div role="img" aria-label={label} className="relative inline-flex shrink-0 items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden className="absolute inset-0" style={{ transform: 'rotate(-90deg)' }}>
        <circle className="hub-ring-track" cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} />
        <circle
          className="hub-ring-fill"
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - v)}
        />
      </svg>
      <div className="relative flex flex-col items-center justify-center text-center">{children}</div>
    </div>
  )
}

/** A small round mark: ticked or not. */
export function Dot({ on }: { on: boolean }) {
  return (
    <span
      aria-hidden
      className="inline-block shrink-0"
      style={{
        width: 'var(--space-2)',
        height: 'var(--space-2)',
        borderRadius: 'var(--radius-pill)',
        background: on ? 'var(--accent)' : 'var(--edge-strong)',
        boxShadow: on ? '0 0 var(--space-2) var(--accent-glow)' : 'none',
      }}
    />
  )
}
