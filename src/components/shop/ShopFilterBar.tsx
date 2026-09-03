'use client'

import type { DietaryTag } from '@/lib/catalogue/types'
import { DIETARY_LABEL } from '@/lib/product-facts'
import { GOAL_LABELS } from '@/lib/quiz-goals'
import { formatGBP } from '@/lib/stack-blueprint/pricing'
import {
  EMPTY_QUERY,
  SORT_LABELS,
  activeFilterCount,
  type ShopQuery,
} from '@/lib/shop/shop-query'

interface Props {
  /** Dietary tags actually present in the catalogue, in canonical order. */
  tags: DietaryTag[]
  query: ShopQuery
  onChange: (query: ShopQuery) => void
  onOpenFilters: () => void
  /** Fired for each individual facet change, for analytics. */
  onFacetApplied?: (facet: string, value: string, on: boolean) => void
  /** Intent phrases the search text implied, in the shopper's own words. */
  intentPhrases: string[]
  onDismissIntent: (phrase: string) => void
}

/**
 * The shop's control row: what is narrowing the page, and how to change it.
 *
 * One horizontally scrolling row rather than the two the plan sketched. Order is
 * by how often it is reached for:
 *
 *   Filters (n) · Sort · what your search implied · what you set · dietary
 *
 * The dietary chips stay here as one-tap toggles even though they also live in
 * the sheet. They are far and away the most-used filter, they are the ones the
 * shop already had, and demoting the common case to two taps to make room for
 * the rare ones would be a poor trade.
 */
export function ShopFilterBar({ tags, query, onChange, onOpenFilters, onFacetApplied, intentPhrases, onDismissIntent }: Props) {
  const count = activeFilterCount(query)
  const sorted = query.sort !== EMPTY_QUERY.sort

  const toggleDietary = (tag: DietaryTag) => {
    const on = !query.dietary.includes(tag)
    onChange({
      ...query,
      dietary: on ? [...query.dietary, tag] : query.dietary.filter((t) => t !== tag),
    })
    onFacetApplied?.('dietary', tag, on)
  }

  // Everything narrowing the page that is NOT a dietary tag — those already show
  // their own state on the toggle chips below, so repeating them would be noise.
  const applied: Array<{ key: string; label: string; clear: () => void }> = []
  for (const category of query.categories) {
    applied.push({
      key: `c:${category}`,
      label: category,
      clear: () => { onChange({ ...query, categories: query.categories.filter((c) => c !== category) }); onFacetApplied?.('category', category, false) },
    })
  }
  for (const goal of query.goals) {
    applied.push({
      key: `g:${goal}`,
      label: GOAL_LABELS[goal] ?? goal,
      clear: () => { onChange({ ...query, goals: query.goals.filter((g) => g !== goal) }); onFacetApplied?.('goal', goal, false) },
    })
  }
  for (const format of query.formats) {
    applied.push({
      key: `f:${format}`,
      label: format[0].toUpperCase() + format.slice(1),
      clear: () => { onChange({ ...query, formats: query.formats.filter((f) => f !== format) }); onFacetApplied?.('format', format, false) },
    })
  }
  if (query.priceMin !== null || query.priceMax !== null) {
    const label =
      query.priceMin !== null && query.priceMax !== null
        ? `${formatGBP(query.priceMin)}–${formatGBP(query.priceMax)}`
        : query.priceMax !== null
          ? `Under ${formatGBP(query.priceMax)}`
          : `Over ${formatGBP(query.priceMin!)}`
    applied.push({ key: 'price', label, clear: () => onChange({ ...query, priceMin: null, priceMax: null }) })
  }
  if (query.stimFree) applied.push({ key: 'stim', label: 'Caffeine-free', clear: () => onChange({ ...query, stimFree: false }) })
  if (query.inStockOnly) applied.push({ key: 'stock', label: 'In stock', clear: () => onChange({ ...query, inStockOnly: false }) })
  if (query.onDealOnly) applied.push({ key: 'deal', label: 'On offer', clear: () => onChange({ ...query, onDealOnly: false }) })
  if (query.subscribable) applied.push({ key: 'sub', label: 'Subscribable', clear: () => onChange({ ...query, subscribable: false }) })
  if (query.minRating !== null) {
    applied.push({ key: 'rating', label: `${query.minRating}+ stars`, clear: () => onChange({ ...query, minRating: null }) })
  }

  return (
    <div className="flex gap-2 overflow-x-auto px-5 py-1.5 max-w-lg mx-auto scrollbar-hide" style={{ scrollbarWidth: 'none' }}>
      <button
        onClick={onOpenFilters}
        className="flex-shrink-0 flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold tracking-wide active:scale-95 transition-all"
        style={{
          fontFamily: 'var(--font-display)',
          color: count > 0 ? 'var(--color-accent)' : 'var(--color-text-2)',
          background: 'var(--color-surface)',
          border: `1px solid ${count > 0 ? 'color-mix(in srgb, var(--color-accent) 40%, transparent)' : 'var(--color-border-2)'}`,
        }}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
          <path d="M3 6h18M7 12h10M11 18h2" />
        </svg>
        {count > 0 ? `Filters (${count})` : 'Filters'}
      </button>

      {sorted && (
        <button
          onClick={onOpenFilters}
          className="flex-shrink-0 px-3.5 py-1.5 rounded-full text-xs font-bold tracking-wide active:scale-95 transition-all"
          style={{
            fontFamily: 'var(--font-display)',
            color: 'var(--color-accent)',
            background: 'var(--color-surface)',
            border: '1px solid color-mix(in srgb, var(--color-accent) 40%, transparent)',
          }}
        >
          {SORT_LABELS[query.sort]}
        </button>
      )}

      {/*
        What the SEARCH TEXT implied, shown back in the shopper's own words.
        Dismissing one deletes those words from the search box — see `stripPhrase`
        — so the box and the filters can never disagree about what is on.
      */}
      {intentPhrases.map((phrase) => (
        <RemovableChip
          key={`i:${phrase}`}
          label={phrase.charAt(0).toUpperCase() + phrase.slice(1)}
          title={`From your search — remove “${phrase}”`}
          inferred
          onRemove={() => onDismissIntent(phrase)}
        />
      ))}

      {applied.map((chip) => (
        <RemovableChip key={chip.key} label={chip.label} onRemove={chip.clear} />
      ))}

      {tags.map((tag) => {
        const on = query.dietary.includes(tag)
        return (
          <button
            key={tag}
            onClick={() => toggleDietary(tag)}
            aria-pressed={on}
            className="flex-shrink-0 px-3.5 py-1.5 rounded-full text-xs font-bold tracking-wide transition-all active:scale-95"
            style={{
              fontFamily: 'var(--font-display)',
              color: on ? 'var(--color-bg)' : 'var(--color-text-2)',
              background: on ? 'var(--color-accent)' : 'var(--color-surface)',
              border: on ? '1px solid transparent' : '1px solid var(--color-border-2)',
            }}
          >
            {DIETARY_LABEL[tag]}
          </button>
        )
      })}
    </div>
  )
}

/**
 * An active filter, with the way to switch it off attached.
 *
 * `inferred` marks the ones we worked out from the search text rather than ones
 * the shopper set — a dashed edge, so a guess never looks like an instruction.
 */
function RemovableChip({
  label, onRemove, inferred = false, title,
}: { label: string; onRemove: () => void; inferred?: boolean; title?: string }) {
  return (
    <button
      onClick={onRemove}
      title={title}
      aria-label={`Remove filter: ${label}`}
      className="flex-shrink-0 flex items-center gap-1.5 pl-3.5 pr-2.5 py-1.5 rounded-full text-xs font-bold tracking-wide active:scale-95 transition-all"
      style={{
        fontFamily: 'var(--font-display)',
        color: 'var(--color-accent)',
        background: 'color-mix(in srgb, var(--color-accent) 10%, transparent)',
        border: `1px ${inferred ? 'dashed' : 'solid'} color-mix(in srgb, var(--color-accent) 40%, transparent)`,
      }}
    >
      {label}
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" aria-hidden>
        <path d="M18 6 6 18M6 6l12 12" />
      </svg>
    </button>
  )
}
