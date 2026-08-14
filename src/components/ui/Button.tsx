'use client'

import type { ButtonHTMLAttributes, Ref } from 'react'
import { ACCENT, AMBER, GLASS, tint } from '@/lib/ui/tokens'
import { Icon, type IconName } from './Icon'

/**
 * One button.
 *
 * The hub hand-rolled roughly forty of these inline, and no two agreed: the same
 * "secondary" action is `rounded-xl` in one card and `rounded-2xl` in the card
 * below it, `text-xs` here and `text-sm` there, and none of them has a focus
 * ring, so a keyboard user gets the UA default outline over a dark surface or
 * nothing at all.
 *
 * Variants, by the job they do — not by how they look:
 * - `primary`   the one thing this screen wants you to do. Accent fill.
 * - `secondary` a real alternative. Hairline, no fill.
 * - `ghost`     navigation and dismissal. Text only.
 * - `danger`    consequential and hard to undo. Amber — never red; nothing the
 *               member does here is an error, and red says "you broke it".
 * - `tone`      a tinted call to action inside a tinted card (the save flow's
 *               offers), coloured by `tone`.
 */

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'tone'
type Size = 'sm' | 'md' | 'lg'

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className' | 'style'> {
  variant?: Variant
  size?: Size
  /** Leading glyph. */
  icon?: IconName
  /** Trailing glyph — for "onward" actions. */
  iconRight?: IconName
  /** Stretch to the container. Default for `md`/`lg`, off for `sm`. */
  fullWidth?: boolean
  /** The accent colour for `variant="tone"`. Ignored by every other variant. */
  tone?: string
  className?: string
  ref?: Ref<HTMLButtonElement>
}

/**
 * Minimum heights, not fixed ones — the button grows if its label wraps.
 * `md` and `lg` clear the 44px tap target; `sm` is deliberately smaller and is
 * only for secondary actions sitting inside a row that is itself tappable.
 */
const SIZES: Record<Size, { pad: string; text: string; radius: string; minH: string; gap: string; glyph: number }> = {
  sm: { pad: 'px-3.5 py-2', text: 'text-xs', radius: 'rounded-xl', minH: 'min-h-10', gap: 'gap-1.5', glyph: 14 },
  md: { pad: 'px-4 py-3', text: 'text-sm', radius: 'rounded-2xl', minH: 'min-h-11', gap: 'gap-2', glyph: 16 },
  lg: { pad: 'px-5 py-3.5', text: 'text-sm', radius: 'rounded-2xl', minH: 'min-h-13', gap: 'gap-2', glyph: 18 },
}

function paint(variant: Variant, tone: string): React.CSSProperties {
  switch (variant) {
    case 'primary':
      return { background: ACCENT, color: 'var(--color-bg)' }
    case 'secondary':
      return { background: GLASS.surface, border: `1px solid ${GLASS.hairline}`, color: 'var(--color-text)' }
    case 'ghost':
      return { background: 'transparent', color: 'var(--color-text-2)' }
    case 'danger':
      return { background: AMBER, color: 'var(--color-bg)' }
    case 'tone':
      return { background: tone, color: 'var(--color-bg)' }
  }
}

export function Button({
  variant = 'secondary',
  size = 'md',
  icon,
  iconRight,
  fullWidth,
  tone = AMBER,
  className,
  children,
  type = 'button',
  ref,
  ...rest
}: ButtonProps) {
  const s = SIZES[size]
  const stretch = fullWidth ?? size !== 'sm'
  // The ring is the variant's own colour, so it reads on a tinted card as well
  // as on the page — one ring colour for everything disappears against amber.
  const ring = variant === 'danger' || variant === 'tone' ? tone : ACCENT

  return (
    <button
      {...rest}
      ref={ref}
      type={type}
      className={[
        'inline-flex items-center justify-center font-bold transition-all duration-200',
        'active:scale-[0.97] disabled:opacity-40 disabled:pointer-events-none',
        'focus-visible:outline-none focus-visible:ring-2',
        s.pad, s.text, s.radius, s.minH, s.gap,
        stretch ? 'w-full' : '',
        className ?? '',
      ].join(' ')}
      style={{
        fontFamily: 'var(--font-display)',
        // Tailwind's ring utilities can't read a runtime colour, so the ring is
        // painted here and switched on by the `focus-visible:ring-2` class.
        ['--tw-ring-color' as string]: tint(ring, 45),
        ...paint(variant, tone),
      }}
    >
      {icon && <Icon name={icon} size={s.glyph} className="shrink-0" />}
      {children}
      {iconRight && <Icon name={iconRight} size={s.glyph} className="shrink-0" />}
    </button>
  )
}
