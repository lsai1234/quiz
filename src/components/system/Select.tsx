'use client'

import { useId, type ReactNode, type Ref, type SelectHTMLAttributes } from 'react'
import { Icon } from '@/components/ui/Icon'
import { Field, controlSurface, fieldControlProps, type FieldProps } from './Field'

/**
 * A single-choice field.
 *
 * A real `<select>` rather than a custom listbox, deliberately. The native
 * control gets the platform picker on a phone — a full-height wheel a thumb can
 * actually hit — plus type-ahead, keyboard handling and screen-reader support
 * that no hand-built menu in this codebase would match. What it does not get is
 * a styleable arrow, so the UA one is switched off and ours is drawn on top.
 *
 * The overlay glyph is `pointer-events-none`. Without it, the arrow — the exact
 * spot people aim at — is the one part of the control that does not open it.
 */

export interface SelectProps
  extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'className' | 'style' | 'id' | 'required' | 'disabled'>,
    FieldProps {
  children: ReactNode
  ref?: Ref<HTMLSelectElement>
}

export function Select({
  label,
  hint,
  error,
  required,
  disabled,
  className,
  children,
  ref,
  ...rest
}: SelectProps) {
  const id = useId()
  const field = { label, hint, error, required, disabled, className }

  return (
    <Field id={id} {...field}>
      <div className="relative">
        <select
          {...rest}
          {...fieldControlProps(id, field)}
          ref={ref}
          className="system-field w-full appearance-none focus-visible:outline-none focus-visible:ring-2"
          style={{
            ...controlSurface(Boolean(error)),
            fontFamily: 'var(--font-body)',
            // Room for the glyph, so a long option label never runs under it.
            paddingRight: 'var(--space-8)',
            // Renders the native option list dark. Without it the picker opens
            // as a white sheet in the middle of a dark app.
            colorScheme: 'dark',
          }}
        >
          {children}
        </select>
        <span
          className="absolute top-1/2 pointer-events-none flex"
          style={{
            right: 'var(--space-3)',
            transform: 'translateY(-50%)',
            color: 'var(--ink-3)',
          }}
        >
          <Icon name="chevron-down" size={16} />
        </span>
      </div>
    </Field>
  )
}
