import type { ReactNode } from 'react'

/**
 * A non-interactive label on a thing.
 *
 * Deliberately colourless. The layer this replaces carried twelve category
 * hues, a merchandising badge in accent, an amber scarcity chip and a red
 * sold-out chip — four colour systems on one card, none of which a shopper
 * could have learned. Category is said by the section heading it sits under and
 * status is said by the words in the badge, so neither needs a hue.
 *
 * It is a rounded rectangle, not a pill: pills are chips, and a chip is
 * something you can press.
 */

export function Badge({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={`sf-label inline-flex items-center ${className ?? ''}`}
      style={{
        padding: '0 var(--space-2)',
        minHeight: 22,
        borderRadius: 'var(--r-control)',
        background: 'var(--surface-hi)',
        color: 'var(--text-dim)',
      }}
    >
      {children}
    </span>
  )
}
