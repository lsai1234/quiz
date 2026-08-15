'use client'

import type { CSSProperties, ReactNode } from 'react'
import { Icon } from '@/components/ui/Icon'

/**
 * The label / hint / error scaffolding shared by `Input` and `Select`.
 *
 * Not exported from the barrel — it is an implementation detail of the two
 * fields, and a third thing that renders labels is how the two of them start
 * disagreeing about where the error message goes.
 *
 * The wiring is the point. Of the 79 hand-rolled inputs across the three hubs,
 * most have a `<p>` above them that is not a `<label>`, so tapping the text does
 * not focus the field and a screen reader announces an unlabelled edit box; the
 * error text is usually a sibling with no `aria-describedby`, so it is never
 * announced at all. This threads `htmlFor`, `aria-describedby` and
 * `aria-invalid` from one set of props so a call site cannot get it wrong.
 */

export interface FieldProps {
  /** The visible label. Required — a field without one is a field nobody can use. */
  label: ReactNode
  /** Quiet guidance under the control. Hidden while an error is showing. */
  hint?: ReactNode
  /** What went wrong. Replaces the hint and marks the control invalid. */
  error?: ReactNode
  /** Marks the control required, and shows the caller's own optional marker. */
  required?: boolean
  disabled?: boolean
  className?: string
}

/** What `Field` hands back for the control to spread onto itself. */
export interface FieldControlProps {
  id: string
  'aria-describedby': string | undefined
  'aria-invalid': true | undefined
  required: boolean | undefined
  disabled: boolean | undefined
}

export function fieldControlProps(
  id: string,
  { hint, error, required, disabled }: FieldProps,
): FieldControlProps {
  return {
    id,
    // Only one of the two is ever rendered, so only one is ever referenced.
    'aria-describedby': error ? `${id}-error` : hint ? `${id}-hint` : undefined,
    'aria-invalid': error ? true : undefined,
    required: required || undefined,
    disabled: disabled || undefined,
  }
}

export function Field({
  id,
  label,
  hint,
  error,
  required,
  disabled,
  className,
  children,
}: FieldProps & { id: string; children: ReactNode }) {
  return (
    <div
      className={`flex flex-col ${className ?? ''}`}
      style={{ gap: 'var(--space-2)', opacity: disabled ? 'var(--disabled-opacity)' : undefined }}
    >
      <label
        htmlFor={id}
        style={{
          fontSize: 'var(--text-micro)',
          fontWeight: 'var(--weight-strong)',
          fontFamily: 'var(--font-display)',
          letterSpacing: 'var(--tracking-eyebrow)',
          textTransform: 'uppercase',
          color: 'var(--ink-3)',
          lineHeight: 'var(--leading-snug)',
        }}
      >
        {label}
        {required && (
          <span style={{ color: 'var(--tone-critical)', marginLeft: 'var(--space-1)' }} aria-hidden>
            *
          </span>
        )}
      </label>

      {children}

      {error ? (
        <p
          id={`${id}-error`}
          // Announced when it appears, without stealing focus from the field the
          // member is still typing in.
          role="status"
          className="flex items-start"
          style={{
            gap: 'var(--space-1)',
            fontSize: 'var(--text-meta)',
            lineHeight: 'var(--leading-snug)',
            color: 'var(--tone-critical)',
          }}
        >
          <Icon name="alert-triangle" size={13} className="shrink-0" />
          {error}
        </p>
      ) : (
        hint && (
          <p
            id={`${id}-hint`}
            style={{
              fontSize: 'var(--text-meta)',
              lineHeight: 'var(--leading-snug)',
              color: 'var(--ink-3)',
            }}
          >
            {hint}
          </p>
        )
      )}
    </div>
  )
}

/**
 * The painted box every field control shares.
 *
 * Solid, never glass. A translucent field over a moving background is where
 * glass interfaces become unreadable, and it is the one surface a member stares
 * at while typing.
 *
 * Lit from outside rather than from within: `--inset-well` is a soft shadow
 * along the top inner edge, which reads as a recess cut into the surface. Every
 * other control in the system is a raised face with a highlight on top; a field
 * is the one thing that should look like a hole you put something into.
 */
export function controlSurface(error: boolean): CSSProperties {
  return {
    background: 'var(--surface-input)',
    border: `1px solid ${error ? 'var(--critical-line)' : 'var(--edge)'}`,
    borderRadius: 'var(--radius-row)',
    minHeight: 'var(--control-md)',
    color: 'var(--ink-1)',
    fontSize: 'var(--text-body)',
    lineHeight: 'var(--leading-snug)',
    padding: 'var(--space-3) var(--space-4)',
    boxShadow: 'var(--inset-well)',
    ['--rest-shadow' as string]: 'var(--inset-well)',
  }
}
