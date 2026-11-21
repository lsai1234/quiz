'use client'

import type { ButtonHTMLAttributes, ReactNode, Ref } from 'react'

/**
 * A filter or a category. One shape, two states.
 *
 * A chip is a **pill**, and it is the only pill in the storefront. That is what
 * makes it distinguishable from a button at a glance: a rounded rectangle means
 * "this does something", a full round means "this narrows something".
 *
 * Selected is white with dark ink (`.sf-chip[aria-pressed='true']` in
 * `storefront.css`). Selection is a state, not an action, so it does not borrow
 * the action colour; cyan is kept for the one thing a region is for.
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
      type="button"
      aria-pressed={selected}
      data-interactive
      className={`sf-chip flex-shrink-0 ${className ?? ''}`}
      {...rest}
    >
      {children}
    </button>
  )
}
