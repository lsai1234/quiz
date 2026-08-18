'use client'

import { useId, type InputHTMLAttributes, type ReactNode, type Ref } from 'react'

/**
 * A checkbox and the sentence it belongs to.
 *
 * Not built on `Field`. Every other control in the system puts its name above
 * itself; a checkbox puts it alongside, and the label is usually a sentence
 * rather than a name — "First order only. Leave this on unless you mean it." So
 * it takes the whole clickable row as its own shape.
 *
 * The box is drawn rather than native. `appearance: none` loses the platform
 * tick, so one is drawn back in CSS as a rotated corner — the alternative is a
 * UA checkbox rendering as a light square on a dark page, which is the single
 * most obviously-unstyled control a dark interface can have.
 *
 * What is *not* given up is the real `<input type="checkbox">` underneath: the
 * space bar, the label association, the announced checked state and the value in
 * a form all still come from the platform. A `<div role="checkbox">` gets none
 * of that for free and this codebase would not have added it back.
 */

export interface CheckboxProps
  extends Omit<
    InputHTMLAttributes<HTMLInputElement>,
    'className' | 'style' | 'id' | 'type' | 'disabled'
  > {
  /** The sentence beside the box. Rendered inside the `<label>`, so it toggles. */
  label: ReactNode
  /** Quieter text under the label, for the consequence of turning it off. */
  hint?: ReactNode
  disabled?: boolean
  /** Layout only. */
  className?: string
  ref?: Ref<HTMLInputElement>
}

export function Checkbox({ label, hint, disabled, className, ref, ...rest }: CheckboxProps) {
  const id = useId()

  return (
    <div className={className}>
      <label
        htmlFor={id}
        className="flex items-start"
        style={{
          gap: 'var(--space-2)',
          // The whole row is the target, not the 18px box.
          cursor: disabled ? 'default' : 'pointer',
          opacity: disabled ? 'var(--disabled-opacity)' : undefined,
        }}
      >
        <input
          {...rest}
          ref={ref}
          id={id}
          type="checkbox"
          disabled={disabled}
          aria-describedby={hint ? `${id}-hint` : undefined}
          className="system-checkbox system-focus shrink-0"
        />
        <span style={{ fontSize: 'var(--text-body-sm)', lineHeight: 'var(--leading-snug)', color: 'var(--ink-2)' }}>
          {label}
        </span>
      </label>
      {hint && (
        <p
          id={`${id}-hint`}
          style={{
            fontSize: 'var(--text-meta)',
            lineHeight: 'var(--leading-snug)',
            color: 'var(--ink-3)',
            // Indented to clear the box, so the hint reads as part of the label
            // rather than as the next item in the list.
            marginTop: 'var(--space-1)',
            marginLeft: 'var(--space-6)',
          }}
        >
          {hint}
        </p>
      )}
    </div>
  )
}
