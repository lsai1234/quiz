'use client'

import { useRef } from 'react'
import type { ShareFormat } from '@/lib/share-card/format'

/**
 * Which card, as a segmented control.
 *
 * ── Why this is not three buttons in a row ──────────────────────────────────
 * It was, and it announced itself as a tablist while behaving like a toolbar:
 * every tab took a tab stop, arrow keys did nothing, and a keyboard user pressed
 * Tab three times to cross a control that should cost one. The ARIA tabs pattern
 * is a roving tabindex — one stop for the whole group, arrows to move within it —
 * and that is what this implements.
 *
 * Selection follows focus, which is correct here and would not be everywhere:
 * moving between tabs swaps a picture, so there is nothing to confirm and
 * nothing lost by arriving. A tab that loaded a form would need Enter.
 *
 * The moving pill is a single element behind the labels rather than a background
 * on the selected one, so the selection slides between segments instead of
 * blinking. It is a transform, so `prefers-reduced-motion` users get the same
 * control without the travel — handled in CSS, not here.
 */
export function FormatTabs({ offered, format, onPick, label, className }: {
  offered: ShareFormat[]
  format: ShareFormat
  onPick: (next: ShareFormat) => void
  label: Record<ShareFormat, string>
  className?: string
}) {
  const refs = useRef<Array<HTMLButtonElement | null>>([])
  const index = Math.max(0, offered.indexOf(format))

  function onKeyDown(e: React.KeyboardEvent) {
    const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
    if (step === 0) {
      if (e.key !== 'Home' && e.key !== 'End') return
      e.preventDefault()
      const target = e.key === 'Home' ? 0 : offered.length - 1
      onPick(offered[target])
      refs.current[target]?.focus()
      return
    }
    e.preventDefault()
    // Wraps: at the last segment, right goes back to the first. A control this
    // short has no "end" worth stopping at.
    const next = (index + step + offered.length) % offered.length
    onPick(offered[next])
    refs.current[next]?.focus()
  }

  return (
    <div
      role="tablist"
      aria-label="Which card"
      onKeyDown={onKeyDown}
      className={`relative flex w-full max-w-xs p-1 rounded-2xl ${className ?? ''}`}
      style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)' }}
    >
      {/* The pill, positioned rather than re-parented so it travels. */}
      <div
        aria-hidden
        className="segmented-pill absolute rounded-xl"
        style={{
          top: 4,
          bottom: 4,
          left: `calc(${(index * 100) / offered.length}% + 4px)`,
          width: `calc(${100 / offered.length}% - 8px)`,
          background: 'rgba(0,212,255,0.14)',
          border: '1px solid rgba(0,212,255,0.38)',
        }}
      />

      {offered.map((f, i) => {
        const active = f === format
        return (
          <button
            key={f}
            ref={(el) => { refs.current[i] = el }}
            type="button"
            role="tab"
            aria-selected={active}
            // The roving stop: only the selected tab is reachable by Tab, and
            // arrows move within the group once you are in it.
            tabIndex={active ? 0 : -1}
            onClick={() => onPick(f)}
            className="relative flex-1 py-2 rounded-xl text-xs font-bold z-10 transition-colors"
            style={{ color: active ? '#00D4FF' : 'var(--color-text-2)' }}
          >
            {label[f]}
          </button>
        )
      })}
    </div>
  )
}
