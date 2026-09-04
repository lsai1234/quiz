'use client'

import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import type { CatalogueProduct, DietaryTag } from '@/lib/catalogue/types'
import type { Goal } from '@/lib/types'
import { ALL_GOALS } from '@/lib/types'
import { GOAL_LABELS } from '@/lib/quiz-goals'
import { DIETARY_LABEL } from '@/lib/product-facts'
import { groupByCategory } from '@/lib/shop/categories'
import { formatGBP } from '@/lib/stack-blueprint/pricing'
import {
  EMPTY_QUERY,
  SHOP_SORTS,
  SORT_LABELS,
  activeFilterCount,
  facetCounts,
  type ShopQuery,
  type ShopSort,
} from '@/lib/shop/shop-query'

const DIETARY_ORDER = Object.keys(DIETARY_LABEL) as DietaryTag[]

interface Props {
  products: CatalogueProduct[]
  query: ShopQuery
  /** The number of products the current query leaves — the footer button's label. */
  resultCount: number
  onChange: (query: ShopQuery) => void
  /** Fired for each individual facet change, for analytics. */
  onFacetApplied?: (facet: string, value: string, on: boolean) => void
  onClose: () => void
}

/**
 * The full filter set, as a bottom sheet.
 *
 * Changes apply **live** rather than on a Save. The sheet covers the results, so
 * the count in the footer button is the feedback — "Show 23 results" is the
 * answer to "did that do anything", and it updates as you tap. A draft-then-apply
 * model would leave that button lying until you committed.
 *
 * Every count comes from `facetCounts`, which computes each facet with its own
 * constraint removed. That is what stops the panel becoming a dead end: with the
 * constraint left in, every option you have not picked reads "0" and the only
 * way out is Clear all.
 */
export function ShopFilterSheet({ products, query, resultCount, onChange, onFacetApplied, onClose }: Props) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => { setMounted(true) }, [])
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const counts = useMemo(() => facetCounts(products, query), [products, query])

  // Facet options in the shop's own order: categories as the shelves are laid
  // out, goals as the quiz lists them, formats alphabetically.
  const categories = useMemo(() => groupByCategory(products).map((s) => s.category), [products])
  const goals = useMemo(() => {
    const present = new Set<Goal>()
    for (const p of products) for (const g of p.goals) present.add(g)
    return ALL_GOALS.filter((g) => present.has(g))
  }, [products])
  const formats = useMemo(() => {
    const present = new Set<string>()
    for (const p of products) for (const f of p.formats) if (f) present.add(f.toLowerCase())
    return [...present].sort()
  }, [products])
  const dietary = useMemo(() => {
    const present = new Set<DietaryTag>()
    for (const p of products) for (const t of p.dietaryTags) present.add(t)
    return DIETARY_ORDER.filter((t) => present.has(t))
  }, [products])

  const toggleIn = <T extends string>(list: T[], value: T): T[] =>
    list.includes(value) ? list.filter((v) => v !== value) : [...list, value]

  const apply = (patch: Partial<ShopQuery>, facet: string, value: string, on: boolean) => {
    onChange({ ...query, ...patch })
    onFacetApplied?.(facet, value, on)
  }

  const activeCount = activeFilterCount(query)

  const sheet = (
    /*
      `storefront` on the portal root, not just on the shell.

      The token layer's global transition, its focus ring and its type roles are
      all scoped to `.storefront` so they cannot reach the quiz or the hubs. A
      sheet renders through `createPortal` into `document.body`, which is
      OUTSIDE that scope — so without this class every control in every sheet
      lost its focus ring and its 150ms transition, silently, while looking
      almost right.
    */
    <div className="storefront fixed inset-0 z-50 flex flex-col justify-end" role="dialog" aria-modal="true" aria-label="Filters">
      {/*
        The scrim. A plain div rather than a labelled button: the header button
        and Escape are the real ways out, and a second control with the SAME
        accessible name is an ambiguity for anyone navigating by name — it also
        sits under the panel, so "click the first Close" lands on something that
        cannot receive the click.
      */}
      <div
        aria-hidden
        onClick={onClose}
        className="absolute inset-0 w-full h-full"
        style={{ background: 'color-mix(in srgb, var(--bg) 72%, transparent)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)' }}
      />

      <div
        className="relative w-full max-w-lg mx-auto rounded-t-3xl flex flex-col max-h-[88dvh]"
        style={{ background: 'var(--surface)', borderTop: '1px solid var(--line)' }}
      >
        <header className="flex items-center justify-between gap-3 px-5 pt-4 pb-3 flex-shrink-0" style={{ borderBottom: '1px solid var(--line)' }}>
          <h2 className="text-base font-medium" style={{ color: 'var(--text)' }}>
            Filters{activeCount > 0 ? ` (${activeCount})` : ''}
          </h2>
          <button
            onClick={onClose}
            aria-label="Close filters"
            className="w-8 h-8 rounded-lg flex items-center justify-center active:scale-90 transition-transform"
            style={{ color: 'var(--text-dim)', background: 'var(--surface-hi)' }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden>
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <Group label="Sort by">
            <div className="flex flex-col gap-1">
              {SHOP_SORTS.map((sort) => (
                <SortRow
                  key={sort}
                  sort={sort}
                  active={query.sort === sort}
                  onSelect={() => apply({ sort }, 'sort', sort, true)}
                />
              ))}
            </div>
          </Group>

          <Group label="Show only">
            <div className="flex flex-wrap gap-2">
              <Chip
                label="In stock"
                count={counts.inStockOnly}
                active={query.inStockOnly}
                onToggle={() => apply({ inStockOnly: !query.inStockOnly }, 'inStock', 'inStock', !query.inStockOnly)}
              />
              <Chip
                label="On offer"
                count={counts.onDealOnly}
                active={query.onDealOnly}
                onToggle={() => apply({ onDealOnly: !query.onDealOnly }, 'onDeal', 'onDeal', !query.onDealOnly)}
              />
              <Chip
                label="Caffeine-free"
                count={counts.stimFree}
                active={query.stimFree}
                onToggle={() => apply({ stimFree: !query.stimFree }, 'stimFree', 'stimFree', !query.stimFree)}
              />
              <Chip
                label="Subscribable"
                count={counts.subscribable}
                active={query.subscribable}
                onToggle={() => apply({ subscribable: !query.subscribable }, 'subscribable', 'subscribable', !query.subscribable)}
              />
            </div>
          </Group>

          <Group label="Price">
            <div className="flex items-center gap-2">
              <PriceInput
                label="Min price"
                value={query.priceMin}
                onCommit={(value) => apply({ priceMin: value }, 'priceMin', String(value ?? ''), value !== null)}
              />
              <span className="text-xs" style={{ color: 'var(--text-dim)' }}>to</span>
              <PriceInput
                label="Max price"
                value={query.priceMax}
                onCommit={(value) => apply({ priceMax: value }, 'priceMax', String(value ?? ''), value !== null)}
              />
            </div>
          </Group>

          <Group label="Rating">
            <div className="flex flex-wrap gap-2">
              {[4, 4.5].map((min) => (
                <Chip
                  key={min}
                  label={`${min}+ stars`}
                  active={query.minRating === min}
                  onToggle={() => {
                    const next = query.minRating === min ? null : min
                    apply({ minRating: next }, 'minRating', String(min), next !== null)
                  }}
                />
              ))}
            </div>
          </Group>

          {categories.length > 0 && (
            <Group label="Category">
              <div className="flex flex-wrap gap-2">
                {categories.map((category) => (
                  <Chip
                    key={category}
                    label={category}
                    count={counts.categories[category] ?? 0}
                    active={query.categories.includes(category)}
                    onToggle={() =>
                      apply(
                        { categories: toggleIn(query.categories, category) },
                        'category', category, !query.categories.includes(category),
                      )
                    }
                  />
                ))}
              </div>
            </Group>
          )}

          {goals.length > 0 && (
            <Group label="Goal">
              <div className="flex flex-wrap gap-2">
                {goals.map((goal) => (
                  <Chip
                    key={goal}
                    label={GOAL_LABELS[goal] ?? goal}
                    count={counts.goals[goal] ?? 0}
                    active={query.goals.includes(goal)}
                    onToggle={() =>
                      apply({ goals: toggleIn(query.goals, goal) }, 'goal', goal, !query.goals.includes(goal))
                    }
                  />
                ))}
              </div>
            </Group>
          )}

          {formats.length > 0 && (
            <Group label="Format">
              <div className="flex flex-wrap gap-2">
                {formats.map((format) => (
                  <Chip
                    key={format}
                    label={format[0].toUpperCase() + format.slice(1)}
                    count={counts.formats[format] ?? 0}
                    active={query.formats.includes(format)}
                    onToggle={() =>
                      apply({ formats: toggleIn(query.formats, format) }, 'format', format, !query.formats.includes(format))
                    }
                  />
                ))}
              </div>
            </Group>
          )}

          {dietary.length > 0 && (
            <Group label="Dietary" hint="Every tag you pick must be present">
              <div className="flex flex-wrap gap-2">
                {dietary.map((tag) => (
                  <Chip
                    key={tag}
                    label={DIETARY_LABEL[tag]}
                    count={counts.dietary[tag] ?? 0}
                    active={query.dietary.includes(tag)}
                    onToggle={() =>
                      apply({ dietary: toggleIn(query.dietary, tag) }, 'dietary', tag, !query.dietary.includes(tag))
                    }
                  />
                ))}
              </div>
            </Group>
          )}
        </div>

        <footer
          className="flex items-center gap-3 px-5 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] flex-shrink-0"
          style={{ borderTop: '1px solid var(--line)', background: 'var(--surface)' }}
        >
          <button
            onClick={() => onChange({ ...EMPTY_QUERY, q: query.q })}
            disabled={activeCount === 0 && query.sort === EMPTY_QUERY.sort}
            className="px-4 py-3 rounded-xl text-xs font-medium active:scale-95 transition-transform disabled:opacity-40"
            style={{ color: 'var(--text-dim)' }}
          >
            Clear all
          </button>
          <button
            onClick={onClose}
            className="flex-1 py-3 rounded-xl text-sm font-medium active:scale-[0.98] transition-transform"
            style={{ background: 'var(--accent)', color: 'var(--bg)' }}
          >
            {resultCount === 0
              ? 'No results'
              : `Show ${resultCount} ${resultCount === 1 ? 'result' : 'results'}`}
          </button>
        </footer>
      </div>
    </div>
  )

  return mounted ? createPortal(sheet, document.body) : null
}

// ─── Pieces ────────────────────────────────────────────────────────────────────

function Group({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="mb-6 last:mb-1">
      <h3 className="label mb-2.5" style={{ color: 'var(--text-dim)' }}>
        {label}
      </h3>
      {hint && <p className="text-[11px] -mt-1.5 mb-2.5" style={{ color: 'var(--text-dim)' }}>{hint}</p>}
      {children}
    </section>
  )
}

/**
 * A facet option. A count of zero disables it rather than hiding it — knowing
 * that "Halal" exists and currently has nothing behind it is more useful than
 * wondering whether the shop has the concept at all. An option already selected
 * is never disabled, or you could not switch it off.
 */
function Chip({
  label, count, active, onToggle,
}: { label: string; count?: number; active: boolean; onToggle: () => void }) {
  const empty = count === 0 && !active
  return (
    <button
      onClick={onToggle}
      aria-pressed={active}
      disabled={empty}
      className="px-3.5 py-2 rounded-full text-xs font-medium tracking-wide transition-all active:scale-95 disabled:opacity-35 disabled:cursor-not-allowed"
      style={{ color: active ? 'var(--bg)' : 'var(--text-dim)',
        background: active ? 'var(--accent)' : 'var(--surface-hi)',
        border: active ? '1px solid transparent' : '1px solid var(--line)' }}
    >
      {label}
      {/*
        A real space, not just the margin. Chromium builds the accessible name by
        concatenating the text nodes, so a margin-only gap reads out as
        "On offer24" — the count has to be separated in the TEXT, not the CSS.
      */}
      {count !== undefined && (
        <span className="ml-1 tabular-nums" style={{ opacity: 0.65 }}>{` ${count}`}</span>
      )}
    </button>
  )
}

function SortRow({ sort, active, onSelect }: { sort: ShopSort; active: boolean; onSelect: () => void }) {
  return (
    <button
      onClick={onSelect}
      aria-pressed={active}
      className="flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-xl text-left text-xs font-medium active:scale-[0.99] transition-transform"
      style={{
        color: active ? 'var(--accent)' : 'var(--text-dim)',
        background: active ? 'color-mix(in srgb, var(--accent) 10%, transparent)' : 'transparent',
        border: active ? '1px solid color-mix(in srgb, var(--accent) 30%, transparent)' : '1px solid transparent' }}
    >
      {SORT_LABELS[sort]}
      {active && (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M20 6 9 17l-5-5" />
        </svg>
      )}
    </button>
  )
}

/**
 * A price bound. Held as text while being typed — a controlled number input that
 * reformats mid-entry fights the person using it — and committed on blur or
 * Enter. An empty box means no bound, not zero.
 */
function PriceInput({
  label, value, onCommit,
}: { label: string; value: number | null; onCommit: (value: number | null) => void }) {
  const [draft, setDraft] = useState(value === null ? '' : String(value))

  // Follow the query when it changes from outside (Clear all, a chip removal).
  useEffect(() => { setDraft(value === null ? '' : String(value)) }, [value])

  const commit = () => {
    const trimmed = draft.trim()
    if (trimmed === '') return onCommit(null)
    const parsed = Number(trimmed)
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setDraft(value === null ? '' : String(value))
      return
    }
    onCommit(Math.round(parsed * 100) / 100)
  }

  return (
    <div
      className="flex-1 flex items-center gap-1 rounded-xl px-3 py-2"
      style={{ background: 'var(--surface-hi)', border: '1px solid var(--line)' }}
    >
      <span className="text-xs" style={{ color: 'var(--text-dim)' }}>{formatGBP(0).charAt(0)}</span>
      <input
        type="text"
        inputMode="decimal"
        aria-label={label}
        placeholder="Any"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commit() } }}
        className="w-full min-w-0 bg-transparent text-xs font-medium outline-none"
        style={{ color: 'var(--text)' }}
      />
    </div>
  )
}
