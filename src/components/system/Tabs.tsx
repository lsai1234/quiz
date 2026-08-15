'use client'

import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'

/**
 * A tab strip.
 *
 * The Founders Hub sub-navigations are the thing this replaces, and they are
 * currently rows of `<Link>`s and `<button>`s with a coloured bottom border —
 * which looks like tabs and behaves like nothing. A screen reader is told there
 * is a list of links; the arrow keys do nothing; there is no way to know which
 * one is current beyond seeing it.
 *
 * This implements the tabs pattern properly:
 * - `role="tablist"` / `tab` / `tabpanel`, wired with `aria-controls` and
 *   `aria-selected`
 * - roving tabindex, so Tab moves past the whole strip rather than through every
 *   tab in it, and the arrow keys move between them
 * - Home and End, which is the difference between eight tabs being navigable and
 *   being a chore
 * - horizontal wrap-around, because a strip that dead-ends at either edge makes
 *   people reach for the mouse
 *
 * Uncontrolled by default; pass `value` and `onChange` to drive it from a router
 * or a parent's state.
 */

export interface Tab {
  /** Stable identity. Used in the generated element ids, so keep it URL-safe. */
  id: string
  label: ReactNode
  /** The panel body. Omit for a strip that only reports its selection. */
  content?: ReactNode
  disabled?: boolean
}

export interface TabsProps {
  tabs: Tab[]
  /** Controlled selection. Omit for uncontrolled. */
  value?: string
  onChange?: (id: string) => void
  /** Initial selection when uncontrolled. Defaults to the first enabled tab. */
  defaultValue?: string
  /** Accessible name for the strip — "Sections", "Views", "Commerce". */
  label: string
  className?: string
}

export function Tabs({ tabs, value, onChange, defaultValue, label, className }: TabsProps) {
  const base = useId()
  const enabled = tabs.filter((t) => !t.disabled)
  const [internal, setInternal] = useState(() => defaultValue ?? enabled[0]?.id ?? tabs[0]?.id)
  const active = value ?? internal
  const refs = useRef(new Map<string, HTMLButtonElement>())

  function select(id: string) {
    if (value === undefined) setInternal(id)
    onChange?.(id)
  }

  /**
   * Arrow keys move the selection and the focus together, which is the
   * "automatic activation" half of the pattern — right for tabs whose panels are
   * already rendered, and wrong only when switching costs a network round trip.
   */
  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const keys = ['ArrowRight', 'ArrowLeft', 'Home', 'End']
    if (!keys.includes(e.key)) return

    const index = enabled.findIndex((t) => t.id === active)
    if (index === -1) return

    const next =
      e.key === 'ArrowRight'
        ? enabled[(index + 1) % enabled.length]
        : e.key === 'ArrowLeft'
          ? enabled[(index - 1 + enabled.length) % enabled.length]
          : e.key === 'Home'
            ? enabled[0]
            : enabled[enabled.length - 1]

    if (!next) return
    e.preventDefault()
    select(next.id)
    refs.current.get(next.id)?.focus()
  }

  return (
    <div className={className}>
      <div
        role="tablist"
        aria-label={label}
        onKeyDown={onKeyDown}
        className="flex overflow-x-auto scrollbar-hide"
        style={{
          gap: 'var(--space-1)',
          borderBottom: '1px solid var(--edge)',
        }}
      >
        {tabs.map((tab) => {
          const selected = tab.id === active
          return (
            <button
              key={tab.id}
              ref={(el) => {
                if (el) refs.current.set(tab.id, el)
                else refs.current.delete(tab.id)
              }}
              type="button"
              role="tab"
              id={`${base}-tab-${tab.id}`}
              aria-selected={selected}
              aria-controls={tab.content ? `${base}-panel-${tab.id}` : undefined}
              // Roving: only the selected tab is in the tab order.
              tabIndex={selected ? 0 : -1}
              disabled={tab.disabled}
              onClick={() => select(tab.id)}
              className="system-control shrink-0 whitespace-nowrap focus-visible:outline-none focus-visible:ring-2"
              style={{
                padding: 'var(--space-2) var(--space-3)',
                fontSize: 'var(--text-body-sm)',
                fontWeight: 'var(--weight-strong)',
                fontFamily: 'var(--font-display)',
                color: selected ? 'var(--ink-1)' : 'var(--ink-3)',
                background: 'transparent',
                // The indicator is a bottom border on the tab itself, sitting on
                // the strip's own border. Drawn as a transparent border rather
                // than added on selection, so the label never shifts by 2px when
                // you pick it.
                borderBottom: `2px solid ${selected ? 'var(--accent)' : 'transparent'}`,
                borderRadius: 'var(--radius-chip) var(--radius-chip) 0 0',
                ['--hover-bg' as string]: 'var(--surface-hover)',
                ['--hover-edge' as string]: selected ? 'var(--accent)' : 'transparent',
                ['--tw-ring-color' as string]: 'var(--focus-ring)',
              }}
            >
              {tab.label}
            </button>
          )
        })}
      </div>

      {tabs.map(
        (tab) =>
          tab.content && (
            <div
              key={tab.id}
              role="tabpanel"
              id={`${base}-panel-${tab.id}`}
              aria-labelledby={`${base}-tab-${tab.id}`}
              hidden={tab.id !== active}
              // Focusable, so a keyboard user who tabs off the strip lands in the
              // panel it controls rather than in whatever follows the component.
              tabIndex={0}
              style={{ paddingTop: 'var(--space-4)' }}
            >
              {tab.content}
            </div>
          ),
      )}
    </div>
  )
}
