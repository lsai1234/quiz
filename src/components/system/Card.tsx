import type { CSSProperties, ReactNode } from 'react'

/**
 * A surface.
 *
 * Three elevations, not five. The hubs currently run three unrelated card
 * systems side by side — two opaque greys, two glass levels and six ad-hoc
 * colour tints — which is what a scale nobody can tell apart turns into. A
 * translucent white over the ground recedes and stacks: a card on a panel on the
 * page reads as three planes without three greys being invented for it.
 *
 * ── No backdrop filter ──────────────────────────────────────────────────────
 * Cards are translucent but never blurred. Blur is rationed to persistent
 * chrome — the header, an open modal, its scrim — because `backdrop-filter`
 * costs a full-surface recomposite per frame, and a list of thirty glass cards
 * is thirty of them per scroll frame. A card gets its depth from the ground
 * showing through it, which costs nothing.
 *
 * ── `solid` ─────────────────────────────────────────────────────────────────
 * For rows inside a scrolling list, and anything virtualised. Translucency over
 * a scrolling parent is the other thing that gets expensive, and `--surface-solid`
 * is tuned to sit at the same visual weight as `--surface-2` composited on the
 * ground, so a solid row and a glass card do not read as two different objects.
 * `tokens.test.ts` holds them within 0.01 luminance of each other.
 *
 * ── `tone` ──────────────────────────────────────────────────────────────────
 * A card carrying a consequence: a saving, a settlement, a scheduled exit. The
 * tint is the meaning, so it should be rare — a screen where three cards are
 * tinted has told you nothing about which one matters.
 */

type Elevation = 1 | 2 | 3
type Tone = 'accent' | 'positive' | 'attention' | 'critical' | 'info'
type Padding = 'none' | 'tight' | 'normal' | 'roomy'

export interface CardProps {
  children: ReactNode
  /** How high off the ground. 1 rests, 2 is raised, 3 is the top of the stack. */
  elevation?: Elevation
  /** Opaque instead of translucent. Required inside a scrolling list. */
  solid?: boolean
  /** Tint the whole card with a semantic tone. Use sparingly. */
  tone?: Tone
  padding?: Padding
  /** Hover and press feedback, for a card that is itself a control. */
  interactive?: boolean
  /** Layout only — design values belong in the props above. */
  className?: string
  as?: 'div' | 'section' | 'article' | 'li'
}

const SURFACE: Record<Elevation, string> = {
  1: 'var(--surface-1)',
  2: 'var(--surface-2)',
  3: 'var(--surface-3)',
}

const PADDING: Record<Padding, string | undefined> = {
  none: undefined,
  tight: 'var(--space-3)',
  normal: 'var(--space-4)',
  roomy: 'var(--space-5)',
}

const TONE_FILL: Record<Tone, string> = {
  accent: 'var(--accent-fill)',
  positive: 'var(--positive-fill)',
  attention: 'var(--attention-fill)',
  critical: 'var(--critical-fill)',
  info: 'var(--info-fill)',
}

const TONE_LINE: Record<Tone, string> = {
  accent: 'var(--accent-line)',
  positive: 'var(--positive-line)',
  attention: 'var(--attention-line)',
  critical: 'var(--critical-line)',
  info: 'var(--info-line)',
}

export function Card({
  children,
  elevation = 1,
  solid = false,
  tone,
  padding = 'normal',
  interactive = false,
  className,
  as: Tag = 'div',
}: CardProps) {
  const paint: CSSProperties = tone
    ? { background: TONE_FILL[tone], border: `1px solid ${TONE_LINE[tone]}` }
    : {
        background: solid ? 'var(--surface-solid)' : SURFACE[elevation],
        border: '1px solid var(--edge)',
        // Only the top edge takes the bright hairline. It is the highlight that
        // makes a translucent panel read as a sheet catching the light, and it
        // stops working the moment it is drawn on all four sides.
        borderTopColor: 'var(--edge-top)',
      }

  return (
    <Tag
      className={[interactive ? 'system-card-interactive' : '', className ?? ''].filter(Boolean).join(' ')}
      style={{
        borderRadius: 'var(--radius-card)',
        padding: PADDING[padding],
        boxShadow: elevation === 1 ? 'var(--shadow-card)' : 'var(--shadow-raised)',
        ...paint,
      }}
    >
      {children}
    </Tag>
  )
}
