'use client'

import type { ReactNode } from 'react'
import { GLASS } from '@/lib/ui/tokens'

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
      <div className="flex items-baseline gap-2">
        <span
          className={strong ? 'text-sm font-bold' : 'text-xs'}
          style={{
            color: strong ? 'var(--color-text)' : 'var(--color-text-2)',
            fontFamily: strong ? 'var(--font-display)' : undefined,
          }}
        >
          {label}
        </span>
        <span
          aria-hidden
          className="flex-1 translate-y-[-3px]"
          style={{ borderBottom: `1px dotted ${GLASS.hairlineStrong}`, minWidth: 12 }}
        />
        <span
          className={strong ? 'text-sm font-black' : 'text-xs font-semibold'}
          style={{
            color: color ?? 'var(--color-text)',
            fontFamily: 'var(--font-display)',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {value}
        </span>
      </div>
      {sub && <p className="text-[11px] text-[var(--color-muted)] mt-0.5 leading-snug">{sub}</p>}
    </div>
  )
}
