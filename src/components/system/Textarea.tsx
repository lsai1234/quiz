'use client'

import { useId, type Ref, type TextareaHTMLAttributes } from 'react'
import { Field, controlSurface, fieldControlProps, type FieldProps } from './Field'

/**
 * A multi-line field.
 *
 * The same box as `Input` — same recess, same ring, same label shell — with the
 * height opened up. Splitting it out rather than adding a `multiline` prop to
 * `Input` keeps the two element types honest: a `<textarea>` has `rows` and no
 * `type`, and a prop that silently changes which element renders is how a `ref`
 * ends up typed as the wrong thing.
 *
 * No `prefix`/`suffix`: a unit belongs to a single value, and this is prose.
 * No `compact` either — a compact field exists to fit a table row, and a
 * paragraph does not go in one. `align` is inherited from `FieldProps` and left
 * alone for the same reason.
 */

export interface TextareaProps
  extends Omit<
      TextareaHTMLAttributes<HTMLTextAreaElement>,
      'className' | 'style' | 'id' | 'required' | 'disabled'
    >,
    Omit<FieldProps, 'compact' | 'align'> {
  ref?: Ref<HTMLTextAreaElement>
}

export function Textarea({
  label,
  hint,
  error,
  required,
  disabled,
  className,
  rows = 3,
  ref,
  ...rest
}: TextareaProps) {
  const id = useId()
  const field = { label, hint, error, required, disabled, className }

  return (
    <Field id={id} {...field}>
      <textarea
        {...rest}
        {...fieldControlProps(id, field)}
        ref={ref}
        rows={rows}
        className="system-field system-focus w-full"
        style={{
          ...controlSurface(Boolean(error)),
          fontFamily: 'var(--font-body)',
          // Prose wants room between lines in a way a single-line value does not.
          lineHeight: 'var(--leading-loose)',
          // Vertical only. Horizontal drag pulls the field out of the grid it
          // sits in and there is no way to put it back.
          resize: 'vertical',
          // `minHeight` on the surface is a single control's worth; `rows` has
          // to win or every textarea in the system is one line tall.
          minHeight: 'auto',
        }}
      />
    </Field>
  )
}
