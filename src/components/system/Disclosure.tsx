'use client'

import { useId, useState, type ReactNode } from 'react'
import { Icon } from '@/components/ui/Icon'

/**
 * A collapsible section.
 *
 * Both hubs wrote this and both got the same half of it wrong. My Hub's settings
 * toggle printed `▲` or `▼` as literal text in a span with nothing wired to
 * assistive tech; the Founders Hub's "Advanced settings" printed `▸` and `▾` the
 * same way. Neither had `aria-expanded`, and neither said which panel the button
 * controlled — so a screen-reader user heard a button, pressed it, and was told
 * nothing about what happened.
 *
 * Here the chevron is a glyph that rotates and the button reports both its state
 * and the panel it owns.
 *
 * ── Rotating rather than swapping ───────────────────────────────────────────
 * One glyph turned 180° beats two characters exchanged: the movement is the
 * affordance, and there is only one thing to keep in step with the state.
 *
 * Uncontrolled by default, controlled if given `open`, because both hubs have a
 * case — a deep link that must open a section — where the parent decides.
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
        className="system-control system-focus w-full flex items-center justify-between text-left"
        style={{
          gap: 'var(--space-3)',
          minHeight: 'var(--control-md)',
          padding: 'var(--space-3) var(--space-1)',
          borderRadius: 'var(--radius-row)',
          fontSize: 'var(--text-body-sm)',
          fontWeight: 'var(--weight-strong)',
          fontFamily: 'var(--font-display)',
          color: 'var(--ink-2)',
          background: 'transparent',
          ['--hover-bg' as string]: 'var(--surface-2)',
        }}
      >
        <span>{summary}</span>
        <Icon
          name="chevron-down"
          size={18}
          className={`shrink-0 ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {/* `hidden` as well as unmounting the children: the attribute is what tells
          assistive tech the panel `aria-controls` points at is not showing. */}
      <div id={panelId} hidden={!open}>
        {open && children}
      </div>
    </div>
  )
}
