'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Icon } from '@/components/ui/Icon'

/**
 * "Done, or not yet."
 *
 * A thing to do, as a row you tap to tick. The whole row is the control: a
 * thumb lands anywhere on it, not on a 36px square at the far edge. The mark
 * on the left is empty until it's done, then fills with the accent and pops,
 * and a ring of light leaves it once (`.system-tick` in `system.css`). The
 * words stay readable when done: quieter and struck through, never hidden.
 *
 * It is a toggle button (`aria-pressed`), named by `name` when the visible
 * words alone would not say what pressing does: "Whey Protein" on screen,
 * "Mark Whey Protein as taken" to a screen reader.
 *
 * Not `Checkbox` (a form field, with a label beside a small box) and not
 * `OptionRow` (one answer out of several). This is one thing, done or not.
 */
export interface TickRowProps {
  label: ReactNode
  /** A second line under the label. */
  sub?: ReactNode
  done: boolean
  /** The accessible name, when the label alone doesn't say what pressing does. */
  name?: string
  disabled?: boolean
  onClick: () => void
  className?: string
}

export function TickRow({ label, sub, done, name, disabled, onClick, className }: TickRowProps) {
  // The pop and the ring of light are for a tick just made, not for one that
  // was already there when the page loaded.
  const first = useRef(true)
  const [fresh, setFresh] = useState(false)
  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    setFresh(done)
  }, [done])
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={done}
      aria-label={name}
      data-done={done}
      className={`system-control system-focus system-tick-row w-full flex items-center text-left ${className ?? ''}`}
      style={{
        gap: 'var(--space-3)',
        minHeight: 'var(--control-lg)',
        padding: 'var(--space-3) var(--space-4)',
        borderRadius: 'var(--radius-row)',
        border: `1px solid ${done ? 'transparent' : 'var(--edge)'}`,
        background: done ? 'transparent' : 'var(--surface-1)',
        ['--hover-bg' as string]: done ? 'var(--surface-1)' : 'var(--surface-hover)',
        ['--hover-edge' as string]: done ? 'var(--edge)' : 'var(--edge-strong)',
      }}
    >
      <span aria-hidden className="system-tick shrink-0 inline-flex items-center justify-center" data-done={done} data-fresh={fresh}>
        {/* Drawn only once done: an unticked mark is an empty ring, not a hidden glyph. */}
        {done && <Icon name="check" size={14} />}
      </span>
      <span className="min-w-0 flex-1">
        <span
          className="system-tick-label block"
          style={{
            fontSize: 'var(--text-body)',
            fontWeight: 'var(--weight-strong)',
            lineHeight: 'var(--leading-snug)',
            color: done ? 'var(--ink-3)' : 'var(--ink-1)',
            textDecoration: done ? 'line-through' : 'none',
          }}
        >
          {label}
        </span>
        {sub && (
          <span className="block" style={{ fontSize: 'var(--text-meta)', lineHeight: 'var(--leading-snug)', color: 'var(--ink-3)' }}>
            {sub}
          </span>
        )}
      </span>
    </button>
  )
}
