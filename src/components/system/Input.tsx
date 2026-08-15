'use client'

import { useId, type InputHTMLAttributes, type ReactNode, type Ref } from 'react'
import { Field, controlSurface, fieldControlProps, type FieldProps } from './Field'

/**
 * A text field.
 *
 * There are 79 hand-rolled inputs across the three hubs and no input primitive
 * at all, which is how two files ended up with their own `const INPUT =` string
 * — both of which set `outline-none` and put nothing back, so a keyboard user
 * gets no visible focus on those fields whatsoever.
 *
 * `prefix` and `suffix` are for units that belong to the value rather than to
 * the label: a currency mark, a `%`, a `/month`. They sit inside the box so the
 * field reads as one object, and they are `aria-hidden` because the label
 * already says what the number is.
 */

export interface InputProps
  extends Omit<
      InputHTMLAttributes<HTMLInputElement>,
      // `prefix` is a real HTML attribute (RDFa, typed `string`), and ours takes
      // a node. Without dropping it here the two collide and the whole prop type
      // silently resolves to something no call site can satisfy — invisible,
      // because the build sets `typescript.ignoreBuildErrors`.
      'className' | 'style' | 'id' | 'required' | 'disabled' | 'prefix'
    >,
    FieldProps {
  /** A unit or symbol shown before the value — currency, for instance. */
  prefix?: ReactNode
  /** A unit or symbol shown after the value — `%`, `kg`, `/month`. */
  suffix?: ReactNode
  ref?: Ref<HTMLInputElement>
}

export function Input({
  label,
  hint,
  error,
  required,
  disabled,
  className,
  prefix,
  suffix,
  ref,
  ...rest
}: InputProps) {
  const id = useId()
  const field = { label, hint, error, required, disabled, className }
  const surface = controlSurface(Boolean(error))

  const input = (
    <input
      {...rest}
      {...fieldControlProps(id, field)}
      ref={ref}
      // With a unit, the box belongs to the wrapper and so does the ring —
      // otherwise focusing draws two, one inside the other.
      className={`system-field w-full min-w-0 ${prefix || suffix ? '' : 'system-focus'}`}
      style={
        prefix || suffix
          ? // The box is drawn by the wrapper in this case, so the input itself
            // contributes nothing but the text.
            {
              background: 'transparent',
              border: 'none',
              color: 'var(--ink-1)',
              fontSize: 'var(--text-body)',
              lineHeight: 'var(--leading-snug)',
              outline: 'none',
            }
          : surface
      }
    />
  )

  return (
    <Field id={id} {...field}>
      {prefix || suffix ? (
        <div
          // `focus-within` rather than `focus`: the ring belongs to the box the
          // member sees, and the thing taking focus is the bare input inside it.
          className="system-field system-focus-within flex items-center"
          style={surface}
        >
          {prefix && (
            <span aria-hidden style={{ color: 'var(--ink-3)', marginRight: 'var(--space-2)' }}>
              {prefix}
            </span>
          )}
          {input}
          {suffix && (
            <span aria-hidden style={{ color: 'var(--ink-3)', marginLeft: 'var(--space-2)' }}>
              {suffix}
            </span>
          )}
        </div>
      ) : (
        input
      )}
    </Field>
  )
}
