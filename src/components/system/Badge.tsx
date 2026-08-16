import type { CSSProperties, ReactNode } from 'react'
import { Icon, type IconName } from '@/components/ui/Icon'

/**
 * A status mark.
 *
 * Small, and therefore the most dangerous thing in the system: badges are drawn
 * at `--text-micro`, which is the size at which a tone colour has to be checked
 * rather than assumed. Every combination below is asserted in
 * `tokens.test.ts` — the `soft` variants read tone-coloured text on a 12% fill,
 * the `solid` variants read `--ink-on-accent` on the tone itself.
 *
 * `neutral` is the default and should stay the common case. A screen where every
 * row carries a coloured badge has spent all its colour and can no longer say
 * which row is the one that needs attention.
 *
 * The tones mean particular things, and they are not interchangeable:
 * - `positive`  money coming back, or something that completed
 * - `attention` needs a decision — never an error
 * - `critical`  a genuine failure: auth, payment, a rejected import
 * - `info`      works quietly in the background; not something you feel
 */

type Tone = 'neutral' | 'accent' | 'positive' | 'attention' | 'critical' | 'info'

export interface BadgeProps {
  children: ReactNode
  tone?: Tone
  /** `soft` is tinted; `solid` fills with the tone. Solid is for one badge per view. */
  variant?: 'soft' | 'solid'
  /** A leading glyph, for a status that has one. */
  icon?: IconName
  /** A small filled circle instead of an icon — the "live"/"paused" idiom. */
  dot?: boolean
  className?: string
}

const COLOUR: Record<Tone, { ink: string; fill: string; line: string; glow: string }> = {
  neutral: { ink: 'var(--ink-2)', fill: 'var(--surface-2)', line: 'var(--edge)', glow: 'transparent' },
  accent: { ink: 'var(--accent)', fill: 'var(--accent-fill)', line: 'var(--accent-line)', glow: 'var(--accent-glow)' },
  positive: { ink: 'var(--tone-positive)', fill: 'var(--positive-fill)', line: 'var(--positive-line)', glow: 'var(--positive-glow)' },
  attention: { ink: 'var(--tone-attention)', fill: 'var(--attention-fill)', line: 'var(--attention-line)', glow: 'var(--attention-glow)' },
  critical: { ink: 'var(--tone-critical)', fill: 'var(--critical-fill)', line: 'var(--critical-line)', glow: 'var(--critical-glow)' },
  info: { ink: 'var(--tone-info)', fill: 'var(--info-fill)', line: 'var(--info-line)', glow: 'var(--info-glow)' },
}

/**
 * The solid fill for each tone — a gradient, not a flat colour, for the same
 * reason a `primary` button is one: a lit face is brighter at the top, and at
 * badge size that gradient is most of what makes it read as a physical chip
 * rather than a coloured rectangle.
 */
const SOLID: Record<Tone, string> = {
  neutral: 'var(--fill-neutral)',
  accent: 'var(--fill-accent)',
  positive: 'var(--fill-positive)',
  attention: 'var(--fill-attention)',
  critical: 'var(--fill-critical)',
  info: 'var(--fill-info)',
}

export function Badge({ children, tone = 'neutral', variant = 'soft', icon, dot, className }: BadgeProps) {
  const c = COLOUR[tone]

  // The bloom's shape lives in `system.css`; the tone only supplies its colour.
  const paint: CSSProperties =
    variant === 'solid'
      ? {
          background: SOLID[tone],
          color: 'var(--ink-on-accent)',
          border: '1px solid transparent',
          ['--tone-glow' as string]: c.glow,
        }
      : {
          background: c.fill,
          color: c.ink,
          border: `1px solid ${c.line}`,
        }

  return (
    <span
      className={`inline-flex items-center shrink-0 ${
        variant === 'solid' ? 'system-chip-solid' : 'system-chip-soft'
      } ${className ?? ''}`}
      style={{
        gap: 'var(--space-1)',
        padding: 'var(--space-1) var(--space-3)',
        borderRadius: 'var(--radius-pill)',
        fontSize: 'var(--text-micro)',
        fontWeight: 'var(--weight-strong)',
        fontFamily: 'var(--font-display)',
        lineHeight: 'var(--leading-tight)',
        letterSpacing: 'var(--tracking-eyebrow)',
        textTransform: 'uppercase',
        whiteSpace: 'nowrap',
        ...paint,
      }}
    >
      {dot && (
        <span
          aria-hidden
          className="shrink-0"
          style={{
            width: 'var(--space-1)',
            height: 'var(--space-1)',
            borderRadius: 'var(--radius-pill)',
            background: 'currentColor',
          }}
        />
      )}
      {icon && !dot && <Icon name={icon} size={11} className="shrink-0" />}
      {children}
    </span>
  )
}
