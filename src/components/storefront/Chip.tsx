'use client'

import type { ButtonHTMLAttributes, ReactNode, Ref } from 'react'

/**
 * A filter or a category. One shape, two states.
 *
 * Replaces 25-odd distinct pill signatures across the storefront — sizes from
 * 8px to 11px, three weights, some bordered, some not, some `rounded-full` and
 * some `rounded-lg`, all meaning the same thing.
 *
 * A chip is a **pill**, and it is the only pill in the storefront. That is what
 * makes it distinguishable from a button at a glance: rounded rectangle means
 * "this does something", full round means "this narrows something".
 */

export interface ChipProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className' | 'style'> {
  selected?: boolean
  children?: ReactNode
  /** Layout only. */
  className?: string
  ref?: Ref<HTMLButtonElement>
}

export function Chip({ selected = false, children, className, ref, ...rest }: ChipProps) {
  return (
    <button
      ref={ref}
      aria-pressed={selected}
      data-interactive
      className={`sf-chip inline-flex items-center gap-1.5 whitespace-nowrap flex-shrink-0 ${className ?? ''}`}
      style={{
        minHeight: 36,
        padding: '0 var(--space-3)',
        borderRadius: 'var(--r-pill)',
        border: 'none',
        fontFamily: 'var(--font-sans)',
        fontSize: 'var(--meta-size)',
        fontWeight: 'var(--weight-medium)',
        lineHeight: 1.2,
        background: selected ? 'var(--accent)' : 'var(--surface-hi)',
        color: selected ? 'var(--accent-ink)' : 'var(--text-dim)',
      }}
      {...rest}
    >
      {children}
    </button>
  )
}
