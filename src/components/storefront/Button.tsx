'use client'

import type { ButtonHTMLAttributes, ReactNode, Ref } from 'react'

/**
 * The storefront's only button.
 *
 * It replaces 121 raw `<button>` elements across 48 files and 29 distinct
 * inline style signatures in the shop alone — the same "secondary" action was
 * `rounded-xl text-sm font-bold` in one card and `rounded-full text-xs
 * font-bold tracking-wide` in the row above it, and almost none of them had a
 * focus ring.
 *
 * ── Three variants, by the job they do ──────────────────────────────────────
 * `primary`   the one thing this screen wants. Accent fill. **One per screen.**
 *             A second one is not a second priority, it is the loss of the
 *             first.
 * `secondary` a real alternative, or a repeated action in a list — the Add on
 *             a grid card is a secondary because the shelf's primary is the
 *             basket, not any one product.
 * `ghost`     dismissal, navigation, and controls that must be available
 *             without being offered.
 *
 * ── No pills ────────────────────────────────────────────────────────────────
 * Every size is `--r-control`. A pill-shaped button reads as a tag, and a
 * screen where the buttons and the filter chips are the same shape has no
 * grammar left.
 *
 * ── Weight 500, sentence case ───────────────────────────────────────────────
 * The layer this replaces ran `font-bold` and `font-black` with uppercase
 * tracking on controls. Everything was shouting, so the actual call to action
 * had nothing left to escalate to.
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

/** Heights are minimums, not fixed: the control grows if its label wraps. */
const SIZE: Record<Size, { minH: string; pad: string; font: string }> = {
  sm: { minH: '36px', pad: '0 var(--space-3)', font: 'var(--meta-size)' },
  md: { minH: '44px', pad: '0 var(--space-4)', font: 'var(--body-size)' },
  lg: { minH: '52px', pad: '0 var(--space-5)', font: 'var(--body-size)' },
}

const VARIANT: Record<Variant, { bg: string; fg: string; hover: string; active: string }> = {
  primary: {
    bg: 'var(--accent)',
    fg: 'var(--accent-ink)',
    hover: 'color-mix(in srgb, var(--accent) 88%, #fff)',
    active: 'color-mix(in srgb, var(--accent) 88%, #fff)',
  },
  secondary: {
    bg: 'var(--surface-hi)',
    fg: 'var(--text)',
    hover: 'color-mix(in srgb, var(--surface-hi) 82%, #fff)',
    active: 'color-mix(in srgb, var(--surface-hi) 82%, #fff)',
  },
  ghost: {
    bg: 'transparent',
    fg: 'var(--text-dim)',
    hover: 'var(--surface-hi)',
    active: 'var(--surface-hi)',
  },
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
  const v = VARIANT[variant]
  const s = SIZE[size]
  const blocked = disabled || loading

  return (
    <button
      ref={ref}
      disabled={blocked}
      aria-busy={loading || undefined}
      data-interactive
      className={`sf-button inline-flex items-center justify-center gap-2 ${fullWidth ? 'w-full' : ''} ${className ?? ''}`}
      style={{
        minHeight: s.minH,
        padding: s.pad,
        fontSize: s.font,
        fontFamily: 'var(--font-sans)',
        fontWeight: 'var(--weight-medium)',
        lineHeight: 1.2,
        borderRadius: 'var(--r-control)',
        border: 'none',
        background: v.bg,
        color: v.fg,
        ['--sf-hover' as string]: v.hover,
        ['--sf-active' as string]: v.active,
      }}
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
