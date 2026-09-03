'use client'

import { useEffect, useRef } from 'react'

interface Props {
  /** The raw, undebounced input value — the shell owns it. */
  value: string
  onChange: (value: string) => void
  /** Announced result count while a search is running; null while browsing. */
  resultCount: number | null
}

/**
 * The shop's search input.
 *
 * It renders INSIDE the sticky category nav rather than above it. Two stacked
 * sticky bars cost about a third of a 360px viewport before a single product is
 * visible, and the phone is where most of this traffic is — so search and the
 * jump-nav share one bar.
 *
 * Kept as a plain `type="search"` rather than a combobox: there is no popup to
 * own yet, and `role="combobox"` without a listbox promises a keyboard contract
 * to a screen reader that this component cannot honour. SS3 adds the suggestion
 * list, and the combobox semantics go on with it.
 *
 * The result count is announced through a polite live region here rather than at
 * the grid, because this is the control that caused the change.
 */
export function ShopSearchBar({ value, onChange, resultCount }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)

  // Desktop shortcuts: "/" and ⌘K / Ctrl-K. Both are no-ops on a phone, and both
  // have to stand down while someone is typing somewhere else — stealing focus
  // out of the basket's quantity field would be worse than having no shortcut.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      const typing =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target?.isContentEditable === true
      const shortcut = event.key === '/' || ((event.metaKey || event.ctrlKey) && event.key === 'k')
      if (!shortcut || typing) return
      event.preventDefault()
      inputRef.current?.focus()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const clear = () => {
    onChange('')
    inputRef.current?.focus()
  }

  return (
    <div className="px-5 pt-3 pb-1 max-w-lg mx-auto">
      <div
        className="flex items-center gap-2 rounded-xl pl-3 pr-1.5 py-1"
        style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border-2)' }}
      >
        <svg
          width="15" height="15" viewBox="0 0 24 24" fill="none"
          stroke="var(--color-muted)" strokeWidth="2" strokeLinecap="round"
          className="flex-shrink-0" aria-hidden
        >
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>

        <input
          ref={inputRef}
          type="search"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Escape' && value) { e.stopPropagation(); clear() } }}
          placeholder="Search protein, sleep, vegan…"
          aria-label="Search the shop"
          enterKeyHint="search"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          className="flex-1 min-w-0 bg-transparent py-2 text-sm outline-none placeholder:opacity-70 [&::-webkit-search-cancel-button]:appearance-none"
          style={{ color: 'var(--color-text)' }}
        />

        {value !== '' && (
          <button
            type="button"
            onClick={clear}
            aria-label="Clear search"
            className="flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center active:scale-90 transition-transform"
            style={{ color: 'var(--color-muted)' }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden>
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/*
        The count lives here, off-screen, so the change is announced once by the
        control that caused it. The grid renders it visually.
      */}
      <p role="status" aria-live="polite" className="sr-only">
        {resultCount === null ? '' : `${resultCount} ${resultCount === 1 ? 'product' : 'products'} found`}
      </p>
    </div>
  )
}
