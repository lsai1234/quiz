'use client'

import type { Suggestion } from '@/lib/shop/suggestions'
import { dealInfo } from '@/lib/shop/merchandising'
import { formatGBP } from '@/lib/stack-blueprint/pricing'
import { ProductTile } from '@/components/stack-review/ProductTile'

/**
 * What a row is called when it is read out.
 *
 * Explicit, rather than left to the browser to assemble from the spans. The
 * accessible name is built by concatenating text nodes, and the gaps in these
 * rows are flex `gap` — so the default name for a product row comes out as
 * "CHRGD Whey ProteinProtein£30.00". The same trap cost the filter chips their
 * names in SS2; here the row has three separate facts in it, so a label reads
 * better than sprinkling spaces.
 */
function labelFor(suggestion: Suggestion): string {
  if (suggestion.kind === 'product') {
    const { product } = suggestion
    return `${product.title}, ${product.category}, ${formatGBP(dealInfo(product).price)}`
  }
  if (suggestion.kind === 'jump') {
    return `${suggestion.label}, ${suggestion.count} ${suggestion.count === 1 ? 'product' : 'products'}`
  }
  if (suggestion.kind === 'example') return `Try searching: ${suggestion.query}`
  return `Recent search: ${suggestion.query}`
}

interface Props {
  /** The listbox's id — the input points `aria-controls` at it. */
  id: string
  suggestions: Suggestion[]
  /** The id of the row the keyboard is on, or null. */
  activeId: string | null
  onSelect: (suggestion: Suggestion) => void
  /** Keeps the pointer and the keyboard agreeing about which row is active. */
  onHover: (id: string) => void
  onClearRecent: () => void
}

/**
 * The suggestion dropdown: a listbox owned by the search input.
 *
 * Presentational on purpose. It renders rows and reports taps; the input owns
 * the open/closed state, the active row and every key — because a combobox's
 * keyboard contract belongs to the thing that has focus, and splitting it across
 * two components is how `aria-activedescendant` ends up pointing at a row that
 * no longer exists.
 *
 * `onMouseDown` is prevented on the whole panel so that clicking a row does not
 * blur the input first — which would close the panel out from under the click.
 */
export function ShopSearchSuggestions({ id, suggestions, activeId, onSelect, onHover, onClearRecent }: Props) {
  if (suggestions.length === 0) return null

  const showingRecent = suggestions.some((s) => s.kind === 'recent')
  const showingExamples = suggestions.some((s) => s.kind === 'example')

  return (
    <div
      className="absolute left-5 right-5 top-full mt-1 z-40 rounded-xl overflow-hidden max-w-lg"
      style={{
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border-2)',
        boxShadow: '0 18px 40px -12px rgba(0,0,0,0.65)',
      }}
      onMouseDown={(e) => e.preventDefault()}
    >
      {(showingRecent || showingExamples) && (
        <p
          className="px-3.5 pt-2.5 pb-1 label"
          style={{ color: 'var(--color-muted)' }}
        >
          {showingRecent ? 'Recent' : 'Try a sentence'}
        </p>
      )}

      <ul id={id} role="listbox" aria-label="Search suggestions" className="max-h-[52dvh] overflow-y-auto">
        {suggestions.map((suggestion) => (
          <li
            key={suggestion.id}
            id={suggestion.id}
            role="option"
            aria-label={labelFor(suggestion)}
            aria-selected={activeId === suggestion.id}
            onClick={() => onSelect(suggestion)}
            onMouseEnter={() => onHover(suggestion.id)}
            className="flex items-center gap-3 px-3.5 py-2.5 cursor-pointer"
            style={{ background: activeId === suggestion.id ? 'var(--color-surface-2)' : 'transparent' }}
          >
            <Row suggestion={suggestion} />
          </li>
        ))}
      </ul>

      {/*
        Outside the listbox: a button among the options would be a role="listbox"
        containing something that is not an option, and the keyboard would have to
        decide whether Down-arrow lands on it.
      */}
      {showingRecent && (
        <div className="px-3.5 py-2" style={{ borderTop: '1px solid var(--color-border)' }}>
          <button
            onClick={onClearRecent}
            className="text-[11px] font-semibold active:opacity-70"
            style={{ color: 'var(--color-muted)' }}
          >
            Clear recent searches
          </button>
        </div>
      )}
    </div>
  )
}

function Row({ suggestion }: { suggestion: Suggestion }) {
  if (suggestion.kind === 'product') {
    const { product } = suggestion
    const { price, onDeal } = dealInfo(product)
    return (
      <>
        <ProductTile imageUrl={product.imageUrl} slot={product.stackSlots[0]} title={product.title} size={32} />
        <span className="flex-1 min-w-0">
          <span className="block text-xs font-bold leading-snug truncate" style={{ color: 'var(--color-text)', fontFamily: 'var(--font-display)' }}>
            {product.title}
          </span>
          <span className="block text-[10px] truncate" style={{ color: 'var(--color-muted)' }}>
            {product.category}
          </span>
        </span>
        <span
          className="text-xs font-black flex-shrink-0 tabular-nums"
          style={{ color: onDeal ? 'var(--color-accent)' : 'var(--color-text-2)', fontFamily: 'var(--font-display)' }}
        >
          {formatGBP(price)}
        </span>
      </>
    )
  }

  if (suggestion.kind === 'jump') {
    return (
      <>
        <span
          className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ background: 'color-mix(in srgb, var(--color-accent) 12%, transparent)', color: 'var(--color-accent)' }}
          aria-hidden
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 6h18M7 12h10M11 18h2" />
          </svg>
        </span>
        <span className="flex-1 min-w-0 text-xs font-bold truncate" style={{ color: 'var(--color-text)', fontFamily: 'var(--font-display)' }}>
          {suggestion.label}
        </span>
        <span className="text-[10px] flex-shrink-0" style={{ color: 'var(--color-muted)' }}>
          {suggestion.count} {suggestion.count === 1 ? 'product' : 'products'}
        </span>
      </>
    )
  }

  const isExample = suggestion.kind === 'example'
  return (
    <>
      <span
        className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
        style={{
          background: isExample ? 'color-mix(in srgb, var(--color-accent) 12%, transparent)' : 'var(--color-surface-2)',
          color: isExample ? 'var(--color-accent)' : 'var(--color-muted)',
        }}
        aria-hidden
      >
        {isExample ? (
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" />
          </svg>
        ) : (
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 8v4l3 2" />
            <circle cx="12" cy="12" r="9" />
          </svg>
        )}
      </span>
      <span className="flex-1 min-w-0 text-xs font-semibold truncate" style={{ color: 'var(--color-text-2)' }}>
        {suggestion.query}
      </span>
    </>
  )
}
