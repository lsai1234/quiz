'use client'

import type { ButtonHTMLAttributes, CSSProperties, Ref } from 'react'
import { Icon, type IconName } from '@/components/ui/Icon'

/**
 * One button.
 *
 * The three hubs hand-roll 151 of these. No two agree: the same secondary action
 * is `rounded-xl` in one card and `rounded-2xl` in the card below it, `text-xs`
 * here and `text-[11px]` there, and two files carry their own `const BTN =` that
 * differ in radius and press behaviour. Most have no focus ring, so a keyboard
 * user gets the user-agent outline over a dark surface, or nothing.
 *
 * Variants are named for the job they do, not for how they look:
 *
 * - `primary`     the one thing this screen wants. Accent fill. One per view.
 * - `secondary`   a real alternative. Glass and a hairline, no fill.
 * - `ghost`       navigation and dismissal. Text only.
 * - `destructive` deletes something that does not come back.
 *
 * `destructive` is the critical tone — actual red — and it is for actions that
 * destroy data: deleting a bundle, removing a product from the catalogue. It is
 * deliberately not the variant for a member cancelling a subscription. Nothing a
 * member does to their own plan is an error, and painting it red says "you broke
 * it" about a decision they are entitled to make; those actions are `secondary`
 * with an honest label. See DESIGN.md.
 *
 * Buttons are solid. Glass belongs on the surfaces a button sits on, not on the
 * button — a translucent control over a moving background loses its edge, and
 * the whole point of a call to action is that it is unambiguously an object.
 */

type Variant = 'primary' | 'secondary' | 'ghost' | 'destructive'
type Size = 'sm' | 'md' | 'lg'

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className' | 'style'> {
  variant?: Variant
  size?: Size
  /** Leading glyph. */
  icon?: IconName
  /** Trailing glyph — for onward actions. */
  iconRight?: IconName
  /**
   * Stretch to the container. Off by default, at every size.
   *
   * The layer this replaces stretched `md` and `lg` automatically, which suited
   * My Hub — a phone-width column of full-width calls to action — and is wrong
   * everywhere else. Founders Hub is a dense desktop tool whose buttons sit in
   * rows and table cells, and a default that silently fills the container puts
   * the second button in a dialog footer off the edge of the panel. Opt in.
   */
  fullWidth?: boolean
  /**
   * Work in progress. Swaps the leading glyph for a spinner, blocks presses and
   * marks the control busy — so the caller never has to disable it separately
   * and remember to re-enable it on the error path.
   */
  loading?: boolean
  /** Layout only. Design values belong in the variant, not at the call site. */
  className?: string
  ref?: Ref<HTMLButtonElement>
}

const SIZES: Record<Size, { padding: string; font: string; radius: string; minHeight: string; gap: string; glyph: number }> = {
  sm: {
    padding: 'var(--space-2) var(--space-3)',
    font: 'var(--text-meta)',
    radius: 'var(--radius-row)',
    minHeight: 'var(--control-sm)',
    gap: 'var(--space-1)',
    glyph: 14,
  },
  md: {
    padding: 'var(--space-3) var(--space-4)',
    font: 'var(--text-body)',
    radius: 'var(--radius-card)',
    minHeight: 'var(--control-md)',
    gap: 'var(--space-2)',
    glyph: 16,
  },
  lg: {
    padding: 'var(--space-3) var(--space-5)',
    font: 'var(--text-body)',
    radius: 'var(--radius-card)',
    minHeight: 'var(--control-lg)',
    gap: 'var(--space-2)',
    glyph: 18,
  },
}

/**
 * `--hover-bg` and `--hover-edge` are read by `.system-control:hover` in
 * `system.css`, which is where the `@media (hover: hover)` guard lives — an
 * unguarded hover sticks after a tap on a touch screen.
 */
const PAINT: Record<Variant, CSSProperties> = {
  primary: {
    background: 'var(--accent)',
    color: 'var(--ink-on-accent)',
    border: '1px solid transparent',
    ['--hover-bg' as string]: 'var(--accent-hover)',
    ['--hover-edge' as string]: 'transparent',
  },
  secondary: {
    background: 'var(--surface-2)',
    color: 'var(--ink-1)',
    // The top edge catches the light; the rest is a plain hairline. Ringing all
    // four sides with the bright value turns the button into a drawn outline.
    border: '1px solid var(--edge)',
    borderTopColor: 'var(--edge-top)',
    ['--hover-bg' as string]: 'var(--surface-3)',
    ['--hover-edge' as string]: 'var(--edge-strong)',
  },
  ghost: {
    background: 'transparent',
    color: 'var(--ink-2)',
    border: '1px solid transparent',
    ['--hover-bg' as string]: 'var(--surface-hover)',
    ['--hover-edge' as string]: 'transparent',
  },
  destructive: {
    background: 'var(--tone-critical)',
    color: 'var(--ink-on-accent)',
    border: '1px solid transparent',
    ['--hover-bg' as string]: 'var(--critical-hover)',
    ['--hover-edge' as string]: 'transparent',
  },
}

/** The ring takes the variant's own colour so it survives a tinted background. */
const RING: Record<Variant, string> = {
  primary: 'var(--accent-line)',
  secondary: 'var(--accent-line)',
  ghost: 'var(--accent-line)',
  destructive: 'var(--critical-line)',
}

export function Button({
  variant = 'secondary',
  size = 'md',
  icon,
  iconRight,
  fullWidth = false,
  loading = false,
  className,
  children,
  type = 'button',
  disabled,
  ref,
  ...rest
}: ButtonProps) {
  const s = SIZES[size]
  const blocked = disabled || loading

  return (
    <button
      {...rest}
      ref={ref}
      type={type}
      disabled={blocked}
      aria-busy={loading || undefined}
      className={[
        'system-control inline-flex items-center justify-center shrink-0',
        'focus-visible:outline-none focus-visible:ring-2',
        fullWidth ? 'w-full' : '',
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
      style={{
        padding: s.padding,
        fontSize: s.font,
        lineHeight: 'var(--leading-tight)',
        borderRadius: s.radius,
        minHeight: s.minHeight,
        gap: s.gap,
        fontFamily: 'var(--font-display)',
        fontWeight: 'var(--weight-strong)',
        // Tailwind's ring utilities cannot read a custom property through their
        // own scale, so the colour is set here and the class switches it on.
        ['--tw-ring-color' as string]: RING[variant],
        ...PAINT[variant],
      }}
    >
      {loading ? (
        <Spinner size={s.glyph} />
      ) : (
        icon && <Icon name={icon} size={s.glyph} className="shrink-0" />
      )}
      {children}
      {iconRight && !loading && <Icon name={iconRight} size={s.glyph} className="shrink-0" />}
    </button>
  )
}

/**
 * The busy glyph.
 *
 * Deliberately not gated on `prefers-reduced-motion`: a spinner is the only
 * signal that a press was received, it occupies a 16px square, and freezing it
 * would leave a reduced-motion user staring at a static mark with no way to tell
 * a slow request from a dead one. The setting exists to stop large-area motion
 * and parallax, not to remove progress feedback.
 */
function Spinner({ size }: { size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className="animate-spin shrink-0"
      aria-hidden
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth={2.5} opacity={0.25} />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" />
    </svg>
  )
}
