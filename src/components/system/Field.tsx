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
 *
 * ── `compact` ───────────────────────────────────────────────────────────────
 * The stacked label above the control is right for a form and wrong for a dense
 * table row. Founders Hub is full of dense table rows — a rate ladder, a VAT
 * panel, a bundle's line items — where the row already names the value and the
 * field is a 60px box at the end of it. Dropping the stacked version into those
 * puts a second label above every one and doubles the height of the page.
 *
 * So `compact` draws no label, no hint and no error line, and the accessible
 * name comes from `label` via `aria-label` instead. Nothing is dropped, only
 * moved: a hint and an error are still rendered, still referenced by
 * `aria-describedby`, and still announced — they are simply not given space.
 * A screen-reader user gets exactly what the stacked field gives them.
 *
 * The one thing `compact` does NOT do is make the control smaller than a thumb.
 * It sits at `--control-sm`, which is the floor for a secondary control inside a
 * row that is itself tappable.
 */

export interface FieldProps {
  /**
   * The field's name. Rendered as a `<label>` normally, and as `aria-label` when
   * `compact` — required either way, because a field with no name is a field
   * nobody can use.
   */
  label: ReactNode
  /** Quiet guidance under the control. Hidden while an error is showing. */
  hint?: ReactNode
  /** What went wrong. Replaces the hint and marks the control invalid. */
  error?: ReactNode
  /** Marks the control required, and shows the caller's own optional marker. */
  required?: boolean
  disabled?: boolean
  /**
   * Drop the label, hint and error rows and shrink the control, for a field
   * sitting in a row that already names it. See the note above.
   */
  compact?: boolean
  /** `right` for numbers, so a column of figures lines up on its units. */
  align?: 'left' | 'right'
  className?: string
}

/** What `Field` hands back for the control to spread onto itself. */
export interface FieldControlProps {
  id: string
  'aria-label': string | undefined
  'aria-describedby': string | undefined
  'aria-invalid': true | undefined
  required: boolean | undefined
  disabled: boolean | undefined
}

/**
 * `aria-label` only in compact mode: with a visible `<label htmlFor>` present it
 * would override the very thing the member can see, which is the one way to make
 * a correctly-labelled field announce the wrong name.
 */
export function fieldControlProps(
  id: string,
  { label, hint, error, required, disabled, compact }: FieldProps,
): FieldControlProps {
  return {
    id,
    'aria-label': compact && typeof label === 'string' ? label : undefined,
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
  compact,
  className,
  children,
}: FieldProps & { id: string; children: ReactNode }) {
  if (compact) {
    // No layout of its own — the control carries the caller's width, and the row
    // around it owns the spacing. The messages are still here, still referenced,
    // just not taking a line: `sr-only` is exactly the case this exists for.
    return (
      <>
        {children}
        {error ? (
          <p id={`${id}-error`} role="status" className="sr-only">
            {error}
          </p>
        ) : (
          hint && (
            <p id={`${id}-hint`} className="sr-only">
              {hint}
            </p>
          )
        )}
      </>
    )
  }

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
 *
 * `compact` keeps the recess and the ink, and gives up only the room: a tighter
 * inset, the chip radius, and the dense body size. It stays at `--control-sm`,
 * which is a deliberate floor — the fields it replaces sit at about 30px, and a
 * number box nobody can hit is not an improvement on a tall one.
 */
export function controlSurface(
  error: boolean,
  opts: { compact?: boolean; align?: 'left' | 'right' } = {},
): CSSProperties {
  return {
    background: 'var(--surface-input)',
    border: `1px solid ${error ? 'var(--critical-line)' : 'var(--edge)'}`,
    borderRadius: opts.compact ? 'var(--radius-chip)' : 'var(--radius-row)',
    minHeight: opts.compact ? 'var(--control-sm)' : 'var(--control-md)',
    color: 'var(--ink-1)',
    fontSize: opts.compact ? 'var(--text-body-sm)' : 'var(--text-body)',
    lineHeight: 'var(--leading-snug)',
    padding: opts.compact ? 'var(--space-1) var(--space-2)' : 'var(--space-3) var(--space-4)',
    textAlign: opts.align,
    // Tabular figures whenever a field is right-aligned: that is a number, and a
    // column of numbers that shifts width as you type is a column you cannot read.
    fontVariantNumeric: opts.align === 'right' ? 'tabular-nums' : undefined,
    boxShadow: 'var(--inset-well)',
    ['--rest-shadow' as string]: 'var(--inset-well)',
  }
}
