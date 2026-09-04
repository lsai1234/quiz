'use client'

import { useEffect, useId, useRef, useState } from 'react'
import type { Suggestion } from '@/lib/shop/suggestions'
import { ShopSearchSuggestions } from './ShopSearchSuggestions'

interface Props {
  /** The raw, undebounced input value — the shell owns it. */
  value: string
  onChange: (value: string) => void
  /** Announced result count while a search is running; null while browsing. */
  resultCount: number | null
  suggestions: Suggestion[]
  onSelect: (suggestion: Suggestion) => void
  /** Enter with no row highlighted — commit the text as it stands. */
  onSubmit: (value: string) => void
  onClearRecent: () => void
}

/**
 * The shop's search input: an ARIA combobox with a listbox of suggestions.
 *
 * It renders INSIDE the sticky bar rather than above it. Each extra sticky row
 * costs a band of a 360px viewport before a single product is visible, and the
 * phone is where most of this traffic is.
 *
 * ── Why the combobox role only arrives now ───────────────────────────────────
 * Through SS1 and SS2 this was a plain `type="search"`. `role="combobox"`
 * promises a screen reader a specific keyboard contract — a popup it can open,
 * arrow keys that move a highlight, `aria-activedescendant` naming the current
 * row — and claiming it without a listbox to honour it is worse than not
 * claiming it at all. The role and the popup land together, here.
 *
 * The input owns the keyboard and the open state; `ShopSearchSuggestions` only
 * renders rows. Splitting that is how `aria-activedescendant` ends up pointing
 * at a row that no longer exists.
 */
export function ShopSearchBar({
  value, onChange, resultCount, suggestions, onSelect, onSubmit, onClearRecent,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const listboxId = `${useId()}-shop-suggestions`
  const [focused, setFocused] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)

  const open = focused && suggestions.length > 0
  const activeId = open && activeIndex >= 0 ? (suggestions[activeIndex]?.id ?? null) : null

  // A changed list invalidates the highlight — index 2 of the old suggestions is
  // not index 2 of the new ones, and keeping it would move the highlight onto an
  // unrelated row as the shopper types.
  useEffect(() => { setActiveIndex(-1) }, [suggestions])

  // Desktop shortcuts: "/" and ⌘K / Ctrl-K. Both are no-ops on a phone, and both
  // stand down while someone is typing somewhere else — stealing focus out of
  // the basket's quantity field would be worse than having no shortcut.
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

  const choose = (suggestion: Suggestion) => {
    setActiveIndex(-1)
    setFocused(false)
    inputRef.current?.blur()
    onSelect(suggestion)
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (suggestions.length === 0) return
      event.preventDefault()
      const step = event.key === 'ArrowDown' ? 1 : -1
      // Wraps, and treats "nothing highlighted" as the position before the
      // first row, so one Down lands on row one and one Up lands on the last.
      const next = (activeIndex + step + suggestions.length + 1) % (suggestions.length + 1)
      setActiveIndex(next === suggestions.length ? -1 : next)
      return
    }

    if (event.key === 'Enter') {
      if (open && activeIndex >= 0) {
        event.preventDefault()
        choose(suggestions[activeIndex])
        return
      }
      setFocused(false)
      inputRef.current?.blur()
      onSubmit(value)
      return
    }

    if (event.key === 'Escape') {
      // Escape closes the popup first and clears the box second: someone who
      // opened the list by accident should not lose what they typed to get there.
      event.stopPropagation()
      if (open) {
        setFocused(false)
        setActiveIndex(-1)
      } else if (value) {
        clear()
      }
      return
    }

    if (event.key === 'Tab') setFocused(false)
  }

  return (
    <div className="relative px-5 pt-3 pb-1 max-w-lg mx-auto">
      <div
        className="flex items-center gap-2 rounded-[var(--r-control)] pl-3 pr-1.5 py-1"
        style={{ background: 'var(--surface)', border: 'none' }}
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
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={activeId ?? undefined}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onKeyDown={handleKeyDown}
          placeholder="Search protein, sleep, vegan…"
          aria-label="Search the shop"
          enterKeyHint="search"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          className="flex-1 min-w-0 bg-transparent py-2 text-sm outline-none placeholder:opacity-70"
          style={{ color: 'var(--text)' }}
        />

        {value !== '' && (
          <button
            type="button"
            onClick={clear}
            aria-label="Clear search"
            className="flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center active:scale-90 transition-transform"
            style={{ color: 'var(--text-dim)' }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden>
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {open && (
        <ShopSearchSuggestions
          id={listboxId}
          suggestions={suggestions}
          activeId={activeId}
          onSelect={choose}
          onHover={(id) => setActiveIndex(suggestions.findIndex((s) => s.id === id))}
          onClearRecent={onClearRecent}
        />
      )}

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
