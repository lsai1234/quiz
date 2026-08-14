'use client'

import type { ButtonHTMLAttributes, Ref } from 'react'
import { ACCENT, GLASS, tint } from '@/lib/ui/tokens'
import { Icon, type IconName } from './Icon'

/**
 * A round, icon-only control — sheet close buttons, quantity steppers, the
 * dismiss on a notice.
 *
 * `label` is required, because an icon-only button with no accessible name is
 * an unusable button. The seven `✕` characters this replaces did at least carry
 * `aria-label`; the `+` and `−` steppers in the delivery sheet had one too. What
 * none of them had was a focus ring or a 44px target.
 */

type Size = 'sm' | 'md'

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className' | 'style' | 'aria-label'> {
  icon: IconName
  /** The accessible name. Not optional — see above. */
  label: string
  size?: Size
  /** Tinted rather than transparent — for a control that must be found quickly. */
  filled?: boolean
  /** Overrides the glyph colour; defaults to muted. */
  color?: string
  className?: string
  ref?: Ref<HTMLButtonElement>
}

const SIZES: Record<Size, { box: string; glyph: number }> = {
  // 36px visual, 44px touch target via the ::after inset in `hit-target`.
  sm: { box: 'w-9 h-9', glyph: 15 },
  md: { box: 'w-11 h-11', glyph: 18 },
}

export function IconButton({
  icon,
  label,
  size = 'md',
  filled,
  color,
  className,
  ref,
  ...rest
}: IconButtonProps) {
  const s = SIZES[size]

  return (
    <button
      {...rest}
      ref={ref}
      type="button"
      aria-label={label}
      title={label}
      className={[
        'relative inline-flex items-center justify-center rounded-full shrink-0',
        'transition-all duration-200 active:scale-90',
        'focus-visible:outline-none focus-visible:ring-2',
        // Extends the tappable area to 44px without changing the drawn size.
        size === 'sm' ? 'hit-target' : '',
        s.box,
        className ?? '',
      ].join(' ')}
      style={{
        color: color ?? 'var(--color-muted)',
        background: filled ? GLASS.raised : 'transparent',
        border: filled ? `1px solid ${GLASS.hairline}` : '1px solid transparent',
        ['--tw-ring-color' as string]: tint(color ?? ACCENT, 45),
      }}
    >
      <Icon name={icon} size={s.glyph} />
    </button>
  )
}
