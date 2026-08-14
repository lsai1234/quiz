import type { ReactNode } from 'react'
import { tint } from '@/lib/ui/tokens'
import { Icon, type IconName } from './Icon'

/**
 * A small tinted pill — a status, a category, a count.
 *
 * Replaces the hand-rolled `inline-flex … rounded-full` spans scattered through
 * the hub, including `StatusBadge`, whose `icon` prop took a *string* and
 * rendered whatever character it was handed (`⚠`, `🌱`, `⚡`). Here the icon is
 * a glyph name, so it cannot be an emoji by construction.
 */
export function Chip({
  children,
  color = 'var(--color-muted)',
  icon,
  className,
}: {
  children: ReactNode
  /** Drives both the text and the 14%-tinted background. */
  color?: string
  icon?: IconName
  className?: string
}) {
  return (
    <span
      className={[
        'inline-flex items-center gap-1 text-[9px] font-bold tracking-wide uppercase',
        'px-2 py-0.5 rounded-full shrink-0',
        className ?? '',
      ].join(' ')}
      style={{ color, background: tint(color, 14), fontFamily: 'var(--font-display)' }}
    >
      {icon && <Icon name={icon} size={10} />}
      {children}
    </span>
  )
}
