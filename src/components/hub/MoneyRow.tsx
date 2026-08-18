'use client'

import type { ReactNode } from 'react'

/**
 * A label, a dotted leader, and a figure.
 *
 * The hub's money panels — billing summary, change impact, exit statement — each
 * laid their rows out as `justify-between`, so with two rows the amounts landed
 * on two different x-positions and the eye had nothing to run down. The printed
 * receipt already solved this: a leader between the words and the number, every
 * figure on one axis. Borrowing it makes these panels easier to read and, more
 * to the point, makes them look like the artefact the member already trusts.
 *
 * Tabular figures are the other half of it — without them, `£9.99` and `£11.11`
 * are different widths and the column only looks aligned.
 */
export function MoneyRow({
  label,
  value,
  color,
  strong,
  sub,
  className,
}: {
  label: ReactNode
  value: ReactNode
  /** Tone for the figure — a credit in green, a settlement in amber. */
  color?: string
  /** The line that totals the ones above it. */
  strong?: boolean
  /** A quieter second line under the label. */
  sub?: ReactNode
  className?: string
}) {
  return (
    <div className={className}>
      <div className="flex items-baseline" style={{ gap: 'var(--space-2)' }}>
        <span
          style={{
            fontSize: strong ? 'var(--text-body-sm)' : 'var(--text-meta)',
            fontWeight: strong ? 'var(--weight-strong)' : undefined,
            fontFamily: strong ? 'var(--font-display)' : undefined,
            color: strong ? 'var(--ink-1)' : 'var(--ink-2)',
          }}
        >
          {label}
        </span>
        <span
          aria-hidden
          className="flex-1 translate-y-[-3px]"
          style={{ borderBottom: '1px dotted var(--edge-strong)', minWidth: 'var(--space-3)' }}
        />
        <span
          style={{
            fontSize: strong ? 'var(--text-body-sm)' : 'var(--text-meta)',
            fontWeight: strong ? 'var(--weight-display)' : 'var(--weight-strong)',
            fontFamily: 'var(--font-display)',
            fontVariantNumeric: 'tabular-nums',
            color: color ?? 'var(--ink-1)',
          }}
        >
          {value}
        </span>
      </div>
      {sub && (
        <p style={{ fontSize: 'var(--text-meta)', lineHeight: 'var(--leading-snug)', color: 'var(--ink-3)', marginTop: 'var(--space-1)' }}>
          {sub}
        </p>
      )}
    </div>
  )
}
