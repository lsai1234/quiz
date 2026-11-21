import type { ReactNode } from 'react'

/**
 * A non-interactive label on a thing.
 *
 * Deliberately colourless. Category is said by the section heading it sits under
 * and status by the words in the badge, so neither needs a hue.
 *
 * A small rounded rectangle in sentence case, not a pill: pills are chips, and a
 * chip is something you can press.
 */

export function Badge({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={`sf-label inline-flex items-center whitespace-nowrap max-w-full truncate ${className ?? ''}`}
      style={{
        padding: '0 var(--space-2)',
        minHeight: 22,
        borderRadius: 6,
        background: 'var(--surface-mid)',
        boxShadow: 'inset 0 0 0 1px var(--line)',
        color: 'var(--text-2)',
      }}
    >
      {children}
    </span>
  )
}
