import type { ReactNode } from 'react'
import { Icon, type IconName } from '@/components/ui/Icon'

/**
 * "There is nothing here" — said deliberately.
 *
 * Both hubs wrote these as a single muted sentence floating in whitespace: "No
 * upcoming deliveries scheduled.", "Nothing waiting.", "No products match."
 * Every one of those is a moment where somebody is looking for something and not
 * finding it, which is exactly when a screen should look most considered, and
 * when a way out is worth the most.
 *
 * A glyph in a disc, a line that says what is true, and — where there is one —
 * something to do about it.
 *
 * The glyph is `aria-hidden` and the title is ordinary text rather than a
 * heading: an empty state is not a section of the document, and promoting it to
 * one puts a phantom entry in the heading outline a screen-reader user navigates
 * by.
 */

export interface EmptyStateProps {
  icon: IconName
  title: ReactNode
  /** One line on why, or on what happens next. */
  children?: ReactNode
  /** A `Button`, when there is something useful to do. */
  action?: ReactNode
  className?: string
}

export function EmptyState({ icon, title, children, action, className }: EmptyStateProps) {
  return (
    <div
      className={`flex flex-col items-center text-center ${className ?? ''}`}
      style={{ padding: 'var(--space-8) var(--space-4)' }}
    >
      <span
        className="inline-flex items-center justify-center"
        style={{
          width: 'var(--control-md)',
          height: 'var(--control-md)',
          borderRadius: 'var(--radius-pill)',
          background: 'var(--surface-2)',
          color: 'var(--ink-3)',
          marginBottom: 'var(--space-3)',
        }}
      >
        <Icon name={icon} size={19} />
      </span>
      <p
        style={{
          fontSize: 'var(--text-body)',
          fontWeight: 'var(--weight-display)',
          fontFamily: 'var(--font-display)',
          color: 'var(--ink-1)',
        }}
      >
        {title}
      </p>
      {children && (
        <p
          style={{
            fontSize: 'var(--text-body-sm)',
            lineHeight: 'var(--leading-loose)',
            color: 'var(--ink-2)',
            marginTop: 'var(--space-2)',
            maxWidth: '34ch',
          }}
        >
          {children}
        </p>
      )}
      {action && <div style={{ marginTop: 'var(--space-4)' }}>{action}</div>}
    </div>
  )
}
