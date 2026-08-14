import type { ReactNode } from 'react'
import { GLASS, tint } from '@/lib/ui/tokens'
import { Eyebrow } from './Eyebrow'

/**
 * A surface.
 *
 * The whole argument for this component is `variant="glass"` being the default.
 * The hub paints every card `bg-[var(--color-surface-2)]` with a solid
 * `--color-border`, which puts a hero, a billing panel and an inline hint at
 * identical visual weight — a wall of same-grey boxes. A translucent white over
 * the page background recedes instead, and stacks: a card inside a sheet inside
 * the page reads as three planes without three greys being invented for it.
 *
 * `tone` is the tinted variant for a card that carries a consequence — a saving,
 * a settlement, a scheduled exit. The tint is the meaning; it should be rare.
 */

type Variant = 'glass' | 'solid' | 'tone'

export interface CardProps {
  children: ReactNode
  variant?: Variant
  /** Colour for `variant="tone"`. */
  tone?: string
  /** Optional caps label rendered above the content. */
  eyebrow?: ReactNode
  /** Padding scale. `tight` for nested cards, `none` to own it yourself. */
  padding?: 'none' | 'tight' | 'normal'
  className?: string
  /** Rendered as `<section>` when it is one; a plain `<div>` otherwise. */
  as?: 'div' | 'section'
}

const PADDING = { none: '', tight: 'p-3.5', normal: 'p-5' } as const

export function Card({
  children,
  variant = 'glass',
  tone,
  eyebrow,
  padding = 'normal',
  className,
  as: Tag = 'div',
}: CardProps) {
  const paint: React.CSSProperties =
    variant === 'tone' && tone
      ? { background: tint(tone, 6), border: `1px solid ${tint(tone, 35)}` }
      : variant === 'solid'
        ? { background: 'var(--color-surface)', border: '1px solid var(--color-border)' }
        : { background: GLASS.surface, border: `1px solid ${GLASS.hairline}` }

  return (
    <Tag className={`rounded-2xl ${PADDING[padding]} ${className ?? ''}`} style={paint}>
      {eyebrow && <Eyebrow className="mb-3" color={variant === 'tone' && tone ? tone : undefined}>{eyebrow}</Eyebrow>}
      {children}
    </Tag>
  )
}
