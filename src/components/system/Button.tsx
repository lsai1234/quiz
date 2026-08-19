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
 * ── Why a solid button is never one flat colour ─────────────────────────────
 * Light falls from above, so a raised face is brighter at the top. A `primary`
 * here is a vertical gradient, an inset white highlight along its top edge, and
 * a coloured bloom underneath — the three things that make it read as an object
 * sitting on the page rather than as a coloured rectangle drawn on it. On hover
 * it lifts a pixel, the bloom grows, and a band of light crosses the face once.
 *
 * Variants are named for the job they do, not for how they look:
 *
 * - `primary`     the one thing this screen wants. Accent fill. One per view.
 * - `secondary`   a real alternative. Glass, a lit top edge, no fill.
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
   * How the label is arranged inside the control.
   *
   * `row` — the default, and what a button normally is: an optional glyph
   * beside a short label, both centred.
   *
   * `stack` — a column whose children stretch to the full width, for the few
   * controls that are really a small card you press. My Hub has three: the
   * delivery calendar's boxes, the line-manage rows and the product-change
   * options.
   *
   * This is a prop rather than something a caller styles because styling it
   * *looks* like it works and does not. The children live inside a wrapper span
   * that is always `inline-flex items-center justify-center`, so `flex-col` in
   * `className` reached the button and never reached its content: the calendar's
   * boxes laid four stacked rows out side by side inside a 160px-wide card,
   * and — being centred — spilled out of both edges at once. On a 390px phone
   * that read as a row of half-cut dates and prices.
   */
  layout?: 'row' | 'stack'
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
    radius: 'var(--radius-chip)',
    minHeight: 'var(--control-sm)',
    gap: 'var(--space-1)',
    glyph: 14,
  },
  md: {
    padding: 'var(--space-3) var(--space-5)',
    font: 'var(--text-body)',
    radius: 'var(--radius-row)',
    minHeight: 'var(--control-md)',
    gap: 'var(--space-2)',
    glyph: 16,
  },
  lg: {
    padding: 'var(--space-4) var(--space-6)',
    font: 'var(--text-lead)',
    radius: 'var(--radius-row)',
    minHeight: 'var(--control-lg)',
    gap: 'var(--space-2)',
    glyph: 18,
  },
}

/**
 * `--hover-*` and `--rest-shadow` are read by `system.css`, which is where the
 * `@media (hover: hover)` guard and the focus ring live. An unguarded hover
 * sticks after a tap on a touch screen; a focus ring that replaces the resting
 * shadow flattens the button the moment you tab to it.
 */
const PAINT: Record<Variant, CSSProperties> = {
  primary: {
    background: 'var(--fill-accent)',
    color: 'var(--ink-on-accent)',
    border: '1px solid transparent',
    ['--rest-shadow' as string]: 'var(--inset-highlight), var(--glow-accent)',
    ['--hover-bg' as string]: 'var(--fill-accent)',
    ['--hover-edge' as string]: 'transparent',
    ['--hover-shadow' as string]: 'var(--inset-highlight), var(--glow-accent-strong)',
  },
  secondary: {
    background: 'var(--fill-glass)',
    color: 'var(--ink-1)',
    // The top edge catches the light; the rest is a plain hairline. Ringing all
    // four sides with the bright value turns the button into a drawn outline.
    border: '1px solid var(--edge)',
    borderTopColor: 'var(--edge-top)',
    ['--rest-shadow' as string]: 'var(--inset-hairline), var(--shadow-card)',
    ['--hover-bg' as string]: 'var(--surface-hover)',
    ['--hover-edge' as string]: 'var(--edge-strong)',
    ['--hover-shadow' as string]: 'var(--inset-hairline), var(--shadow-raised)',
  },
  ghost: {
    background: 'transparent',
    color: 'var(--ink-2)',
    border: '1px solid transparent',
    ['--rest-shadow' as string]: 'var(--shadow-none)',
    ['--hover-bg' as string]: 'var(--surface-2)',
    ['--hover-edge' as string]: 'var(--edge)',
    ['--hover-shadow' as string]: 'var(--shadow-none)',
  },
  destructive: {
    background: 'var(--fill-critical)',
    color: 'var(--ink-on-accent)',
    border: '1px solid transparent',
    ['--rest-shadow' as string]: 'var(--inset-highlight), var(--glow-critical)',
    ['--hover-bg' as string]: 'var(--fill-critical)',
    ['--hover-edge' as string]: 'transparent',
    ['--hover-shadow' as string]: 'var(--inset-highlight), var(--glow-critical)',
  },
}

/**
 * The button's paint and shape, for the one thing a `<button>` cannot be: a link.
 *
 * A few places in the hub navigate rather than act — "Edit this bundle", "Open
 * the live page" — and those have to stay anchors. A `<button>` with a router
 * push in it loses the middle-click, the open-in-new-tab and the status bar, and
 * announces itself as a button to someone who is looking for a link.
 *
 * So the element stays the caller's (a Next `<Link>`, an `<a>`) and only the
 * surface comes from here. Spread both halves onto it. Everything else a Button
 * does — the sheen, the focus ring, the resting shadow — rides on the class
 * names, so a link styled this way behaves like the buttons beside it.
 */
export function buttonSurface(
  variant: Variant = 'secondary',
  size: Size = 'md',
): { className: string; style: CSSProperties } {
  const s = SIZES[size]
  return {
    className: [
      'system-control system-sheen inline-flex items-center justify-center',
      variant === 'destructive' ? 'system-focus-critical' : 'system-focus',
    ].join(' '),
    style: {
      padding: s.padding,
      fontSize: s.font,
      lineHeight: 'var(--leading-tight)',
      borderRadius: s.radius,
      minHeight: s.minHeight,
      gap: s.gap,
      fontFamily: 'var(--font-display)',
      fontWeight: 'var(--weight-strong)',
      letterSpacing: 'var(--tracking-title)',
      textDecoration: 'none',
      ...PAINT[variant],
    },
  }
}

export function Button({
  variant = 'secondary',
  size = 'md',
  icon,
  iconRight,
  fullWidth = false,
  layout = 'row',
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
        // No `shrink-0`: a button that cannot shrink, sitting in a flex row
        // beside a `fullWidth` one, pushes itself off the end of the container.
        // That is how the "Add" button left the screen in the hub comparison.
        'system-control system-sheen inline-flex',
        layout === 'stack' ? 'flex-col items-stretch justify-start text-left' : 'items-center justify-center',
        variant === 'destructive' ? 'system-focus-critical' : 'system-focus',
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
        letterSpacing: 'var(--tracking-title)',
        ...PAINT[variant],
      }}
    >
      {/* One element, so `.system-sheen > *` lifts the whole label above the
          travelling highlight rather than only its first child. */}
      <span
        className={
          layout === 'stack'
            ? 'flex flex-col items-stretch w-full min-w-0'
            : 'inline-flex items-center justify-center min-w-0'
        }
        style={{ gap: s.gap }}
      >
        {loading ? (
          <Spinner size={s.glyph} />
        ) : (
          icon && <Icon name={icon} size={s.glyph} className="shrink-0" />
        )}
        {children}
        {iconRight && !loading && <Icon name={iconRight} size={s.glyph} className="shrink-0" />}
      </span>
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
