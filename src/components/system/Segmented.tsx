'use client'

import type { ReactNode } from 'react'

/**
 * A row of equal-weight choices, one of which is on.
 *
 * The shape both hubs reach for when the options are short and comparable: how
 * much do you get through, when should this start, which day of the month. Five
 * hand-rolled copies existed between them, each rebuilding `role="radiogroup"`
 * and `role="radio"` by hand, each with its own idea of what "selected" looks
 * like, and none with a focus ring.
 *
 * ── Why radios and not buttons ──────────────────────────────────────────────
 * One answer out of a fixed, visible set is the textbook radio case, and the
 * roles are what make it navigable: a screen reader announces "2 of 5" and
 * arrow keys move within the group rather than tabbing through every option.
 * `OptionRow` is the same question asked as a list — reach for that when the
 * options need a sentence each, and for this when they need a word.
 *
 * ── Why it takes a `columns` rather than measuring ──────────────────────────
 * A ship-day picker wraps across many rows; a three-way usage picker must not
 * wrap at all. Both are legitimate and the component cannot tell which it is
 * looking at, so the caller says.
 */

export interface SegmentedOption<T extends string | number> {
  value: T
  /** What the segment says. Keep it to a word or two. */
  label: ReactNode
  /** A quieter second line, where a word alone would be ambiguous. */
  sub?: ReactNode
  /** Spoken name, when the visible label is a bare number. */
  ariaLabel?: string
  disabled?: boolean
}

export interface SegmentedProps<T extends string | number> {
  /** Names the group. Required — a set of radios with no name is unusable. */
  label: string
  options: SegmentedOption<T>[]
  value: T | null
  onChange: (value: T) => void
  /** `wrap` for a long set that flows onto several rows. */
  columns?: 2 | 3 | 4 | 'wrap'
  className?: string
}

const GRID: Record<2 | 3 | 4, string> = {
  2: 'grid grid-cols-2',
  3: 'grid grid-cols-3',
  4: 'grid grid-cols-4',
}

export function Segmented<T extends string | number>({
  label,
  options,
  value,
  onChange,
  columns = 'wrap',
  className,
}: SegmentedProps<T>) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={`${columns === 'wrap' ? 'flex flex-wrap' : GRID[columns]} ${className ?? ''}`}
      style={{ gap: 'var(--space-2)' }}
    >
      {options.map((option) => {
        const active = value === option.value
        return (
          <button
            key={String(option.value)}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={option.ariaLabel}
            disabled={option.disabled}
            onClick={() => onChange(option.value)}
            className="system-control system-focus flex flex-col items-center justify-center text-center"
            style={{
              minHeight: 'var(--control-md)',
              padding: 'var(--space-2) var(--space-3)',
              borderRadius: 'var(--radius-row)',
              fontSize: 'var(--text-body-sm)',
              fontWeight: 'var(--weight-strong)',
              fontFamily: 'var(--font-display)',
              background: active ? 'var(--accent-fill)' : 'var(--surface-1)',
              border: `1px solid ${active ? 'var(--accent-line)' : 'var(--edge)'}`,
              color: active ? 'var(--accent)' : 'var(--ink-2)',
              ['--hover-bg' as string]: active ? 'var(--accent-fill)' : 'var(--surface-hover)',
              ['--hover-edge' as string]: active ? 'var(--accent-line)' : 'var(--edge-strong)',
            }}
          >
            <span>{option.label}</span>
            {option.sub && (
              <span
                style={{
                  fontSize: 'var(--text-micro)',
                  fontWeight: 'var(--weight-body)',
                  color: 'var(--ink-3)',
                  marginTop: 'var(--space-1)',
                }}
              >
                {option.sub}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
