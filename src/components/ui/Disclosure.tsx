'use client'

import { useId, useState, type ReactNode } from 'react'
import { ACCENT, tint } from '@/lib/ui/tokens'
import { Icon } from './Icon'

/**
 * A collapsible section.
 *
 * Replaces the hub's settings toggle, which printed `▲` or `▼` as literal text
 * in a span and wired nothing to assistive tech — no `aria-expanded`, no
 * relationship between the button and the panel it controls. Here the chevron is
 * a glyph that rotates, and the button says what it does.
 *
 * Uncontrolled by default (`defaultOpen`), controlled if given `open`, because
 * the hub has one case — a deep link that must open a section — where the parent
 * needs to decide.
 */
export function Disclosure({
  summary,
  children,
  defaultOpen = false,
  open: controlled,
  onOpenChange,
  className,
}: {
  summary: ReactNode
  children: ReactNode
  defaultOpen?: boolean
  open?: boolean
  onOpenChange?: (open: boolean) => void
  className?: string
}) {
  const [uncontrolled, setUncontrolled] = useState(defaultOpen)
  const open = controlled ?? uncontrolled
  const panelId = useId()

  function toggle() {
    const next = !open
    if (controlled === undefined) setUncontrolled(next)
    onOpenChange?.(next)
  }

  return (
    <div className={className}>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-controls={panelId}
        className={[
          'w-full flex items-center justify-between gap-3 py-3 min-h-11 text-sm font-bold',
          'transition-colors duration-200 rounded-xl px-1',
          'focus-visible:outline-none focus-visible:ring-2',
        ].join(' ')}
        style={{
          color: 'var(--color-text-2)',
          fontFamily: 'var(--font-display)',
          ['--tw-ring-color' as string]: tint(ACCENT, 45),
        }}
      >
        <span className="text-left">{summary}</span>
        {/* Rotating one glyph beats swapping two characters: the movement is the
            affordance, and there is only one thing to keep in sync. */}
        <Icon
          name="chevron-down"
          size={18}
          className={`shrink-0 text-[var(--color-muted)] transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </button>

      <div id={panelId} hidden={!open}>
        {open && children}
      </div>
    </div>
  )
}
