import type { ReactNode } from 'react'
import { GLASS } from '@/lib/ui/tokens'
import { Icon, type IconName } from './Icon'

/**
 * "There's nothing here" — said deliberately.
 *
 * The hub's empty states were single muted sentences floating in whitespace:
 * "No upcoming deliveries scheduled.", "Nothing ships in this box." Each one is
 * a moment where a member is looking for something and not finding it, which is
 * exactly when a screen should look most considered — and when a next action is
 * worth the most.
 *
 * A glyph in a disc, a line that says what's true, and (where there is one) a
 * way out.
 */
export function EmptyState({
  icon,
  title,
  children,
  action,
  className,
}: {
  icon: IconName
  title: ReactNode
  /** One line on why, or what happens next. */
  children?: ReactNode
  /** A `Button`, when there is something useful to do about it. */
  action?: ReactNode
  className?: string
}) {
  return (
    <div className={`flex flex-col items-center text-center py-8 px-4 ${className ?? ''}`}>
      <span
        className="inline-flex items-center justify-center w-11 h-11 rounded-full mb-3"
        style={{ background: GLASS.raised, color: 'var(--color-muted)' }}
      >
        <Icon name={icon} size={19} />
      </span>
      <p className="text-sm font-bold text-[var(--color-text)]" style={{ fontFamily: 'var(--font-display)' }}>
        {title}
      </p>
      {children && (
        <p className="text-xs text-[var(--color-text-2)] mt-1.5 leading-relaxed max-w-[34ch]">{children}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}
