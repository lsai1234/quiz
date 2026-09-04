'use client'

import type { DietaryTag } from '@/lib/catalogue/types'
import { SLOT_LABELS } from '@/lib/catalogue/types'
import { DIETARY_LABEL } from '@/lib/product-facts'
import { GOAL_LABELS } from '@/lib/quiz-goals'
import { formatGBP } from '@/lib/stack-blueprint/pricing'
import {
  EMPTY_QUERY,
  SORT_LABELS,
  activeFilterCount,
  type ShopQuery,
} from '@/lib/shop/shop-query'
import { Button, Chip } from '@/components/storefront'

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
  // Slots are set by the Stack Radar rather than the sheet, so this chip is the
  // only place one can be switched off short of Clear all.
  for (const slot of query.slots) {
    applied.push({
      key: `s:${slot}`,
      label: SLOT_LABELS[slot],
      clear: () => { onChange({ ...query, slots: query.slots.filter((v) => v !== slot) }); onFacetApplied?.('slot', slot, false) },
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
    /*
      A control row, not a pill row.

      "Filters" is a BUTTON — rounded rectangle, so it is visibly a different
      kind of thing from the category pills below it. Everything after it is a
      chip, because everything after it narrows the catalogue: the dietary
      toggles, the facets already applied, and the phrases the search text
      implied. That is the distinction the two stacked rows never made.
    */
    <div className="sf-scroll-row flex items-center" style={{ gap: 'var(--space-2)', paddingTop: 'var(--space-3)' }}>
      <Button
        variant={count > 0 ? 'secondary' : 'ghost'}
        size="sm"
        onClick={onOpenFilters}
        className="flex-shrink-0"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
          <path d="M3 6h18M7 12h10M11 18h2" />
        </svg>
        {count > 0 ? `Filters (${count})` : 'Filters'}
      </Button>

      {sorted && (
        <Chip selected onClick={onOpenFilters}>
          {SORT_LABELS[query.sort]}
        </Chip>
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
          title={`From your search — remove \u201C${phrase}\u201D`}
          inferred
          onRemove={() => onDismissIntent(phrase)}
        />
      ))}

      {applied.map((chip) => (
        <RemovableChip key={chip.key} label={chip.label} onRemove={chip.clear} />
      ))}

      {tags.map((tag) => (
        <Chip key={tag} selected={query.dietary.includes(tag)} onClick={() => toggleDietary(tag)}>
          {DIETARY_LABEL[tag]}
        </Chip>
      ))}
    </div>
  )
}

/**
 * An active filter, with the way to switch it off attached.
 *
 * `inferred` marks the ones we worked out from the search text rather than ones
 * the shopper set — a dashed edge, so a guess never looks like an instruction.
 */
/**
 * A filter that is on, and can be taken off.
 *
 * It is a `Chip` in its selected state with a cross after the label, so an
 * applied filter and a selected dietary toggle look identical — which they
 * should, because they are the same thing arrived at two ways.
 *
 * `inferred` marks one the search TEXT implied rather than one the shopper
 * tapped. It reads at 70% opacity rather than in a different colour: the
 * storefront has one accent and spending it on "we guessed this" would put a
 * guess at the same volume as a decision.
 */
function RemovableChip({
  label, onRemove, inferred = false, title,
}: { label: string; onRemove: () => void; inferred?: boolean; title?: string }) {
  return (
    <Chip
      selected
      onClick={onRemove}
      title={title}
      aria-label={`Remove filter: ${label}`}
      className={inferred ? 'opacity-70' : ''}
    >
      {label}
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden>
        <path d="M18 6 6 18M6 6l12 12" />
      </svg>
    </Chip>
  )
}
