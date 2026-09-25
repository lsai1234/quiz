'use client'

import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Glyph } from './Glyph'

/**
 * The consult's shared answer controls.
 *
 * Every scene builds from these rather than drawing its own buttons, so a
 * tile, chip or Next button looks and behaves the same on every screen.
 */

interface NextButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  children?: ReactNode
}

/** The primary action at the foot of every scene. */
export function NextButton({ children = 'Next', disabled, style, className, ...rest }: NextButtonProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      className={`amp-press flex w-full items-center justify-center ${className ?? ''}`}
      style={{
        minHeight: 'calc(var(--amp-target) + var(--amp-space-1))',
        borderRadius: 'var(--amp-radius-tile)',
        background: disabled ? 'var(--amp-edge)' : 'var(--amp-accent)',
        color: disabled ? 'var(--amp-ink-3)' : 'var(--amp-ink-on-accent)',
        boxShadow: disabled ? 'none' : 'var(--amp-glow)',
        fontFamily: 'var(--amp-font-body)',
        fontWeight: 'var(--amp-weight-bold)',
        fontSize: 'var(--amp-text-lead)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        ...style,
      }}
      {...rest}
    >
      {children}
    </button>
  )
}

/** A quiet text link under the action, e.g. "Tell Amp more". */
export function QuietLink({ children, icon, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { icon?: Parameters<typeof Glyph>[0]['name'] }) {
  return (
    <button
      type="button"
      className="amp-press inline-flex items-center"
      style={{
        gap: 'var(--amp-space-1)',
        minHeight: 'var(--amp-target)',
        paddingLeft: 'var(--amp-space-3)',
        paddingRight: 'var(--amp-space-3)',
        fontSize: 'var(--amp-text-meta)',
        color: 'var(--amp-ink-2)',
        borderRadius: 'var(--amp-radius-chip)',
      }}
      {...rest}
    >
      {icon && <Glyph name={icon} size={16} />}
      {children}
    </button>
  )
}
