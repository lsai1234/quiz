'use client'

import type { ButtonHTMLAttributes, ReactNode, Ref } from 'react'

/**
 * The storefront's only button.
 *
 * ── Three variants, by the job they do ──────────────────────────────────────
 * `primary`   the one thing this region is for. Cyan, with a highlight along
 *             the top edge so it reads as a key, not a coloured rectangle.
 *             **One per region.** A second one is not a second priority, it is
 *             the loss of the first.
 * `secondary` a real alternative, or a repeated action in a list.
 * `ghost`     dismissal, navigation, and controls that must be available
 *             without being offered.
 *
 * ── Filled, never outlined ──────────────────────────────────────────────────
 * The look lives in `storefront.css` (`.sf-button--*`), not inline, because the
 * states a button needs — hover, pressed, disabled — cannot be written inline,
 * and an inline fill outranks the stylesheet rule that would dim it.
 *
 * ── Rounded rectangles, never pills ─────────────────────────────────────────
 * Pills are chips. A screen where the buttons and the filter chips are the same
 * shape has no grammar left.
 */

type Variant = 'primary' | 'secondary' | 'ghost'
type Size = 'sm' | 'md' | 'lg'

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className' | 'style'> {
  variant?: Variant
  size?: Size
  /** Stretch to the container. Off by default at every size. */
  fullWidth?: boolean
  /**
   * Work in progress. Shows a spinner, blocks presses and marks the control
   * busy — so a caller never has to disable it separately and remember to
   * re-enable it on the error path.
   */
  loading?: boolean
  children?: ReactNode
  /** Layout only. Design values belong in the variant and the size. */
  className?: string
  ref?: Ref<HTMLButtonElement>
}

/** The classes for a button's look, for the few places that must stay a link. */
export function buttonClasses(variant: Variant = 'secondary', size: Size = 'md', fullWidth = false): string {
  return `sf-button sf-button--${variant} sf-button--${size}${fullWidth ? ' sf-button--full' : ''}`
}

export function Button({
  variant = 'secondary',
  size = 'md',
  fullWidth = false,
  loading = false,
  disabled,
  children,
  className,
  ref,
  ...rest
}: ButtonProps) {
  const blocked = disabled || loading

  return (
    <button
      ref={ref}
      disabled={blocked}
      aria-busy={loading || undefined}
      data-interactive
      className={`${buttonClasses(variant, size, fullWidth)} ${className ?? ''}`}
      {...rest}
    >
      {loading && <Spinner />}
      {children}
    </button>
  )
}

/**
 * A ring, not a chasing dot: at 14px a segmented spinner reads as a flicker.
 * `currentColor` so it is legible on every variant without being told which.
 */
function Spinner() {
  return (
    <span
      aria-hidden
      className="sf-spinner"
      style={{
        width: 14,
        height: 14,
        borderRadius: '50%',
        border: '2px solid currentColor',
        borderTopColor: 'transparent',
        opacity: 0.9,
        flexShrink: 0,
      }}
    />
  )
}
