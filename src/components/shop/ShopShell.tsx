'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import type { CatalogueProduct, DietaryTag } from '@/lib/catalogue/types'
import { useCatalogueProducts } from '@/hooks/useCatalogueProducts'
import { useShopBundles } from '@/hooks/useShopBundles'
import { useBasket } from '@/lib/basket/store'
import { useShopCheckout } from '@/hooks/useShopCheckout'
import { resolveBasket, basketSubtotal, basketSupplierValue, priceBasket, resolvedItemCount } from '@/lib/basket/helpers'
import type { AppliedCode } from '@/components/checkout/PartnerCodeBox'
import { groupByCategory, type ShopCategory } from '@/lib/shop/categories'
import { buildIndex, queryForAnalytics } from '@/lib/shop/search'
import { EMPTY_QUERY, applyShopQuery, isEmptyQuery, needsResultsView, type ShopQuery } from '@/lib/shop/shop-query'
import { decodeShopQuery, shopQuerySearch } from '@/lib/shop/query-url'
import { stripPhrase } from '@/lib/shop/synonyms'
import { buildSuggestions, jumpPatch, type Suggestion } from '@/lib/shop/suggestions'
import { readRecentSearches, rememberSearch, clearRecentSearches } from '@/lib/shop/recent-searches'
import { dealsProducts, maxDealPct } from '@/lib/shop/merchandising'
import { catalogueRatingSummary } from '@/lib/shop/ratings'
import { track } from '@/lib/analytics/events'
import { DIETARY_LABEL } from '@/lib/product-facts'
import { formatGBP, getPricingConfig } from '@/lib/stack-blueprint/pricing'
import { CHRGDBolt } from '@/components/brand/CHRGDLogo'
import { Icon } from '@/components/ui/Icon'
import { ShopHeader } from './ShopHeader'
import { ShopFilterBar } from './ShopFilterBar'
import { ShopCategoryNav } from './ShopCategoryNav'
import { ShopSection } from './ShopSection'
import { ShopBundlesRow } from './ShopBundlesRow'
import { ShopProductSheet } from './ShopProductSheet'
import { ShopSearchBar } from './ShopSearchBar'
import { ShopFilterSheet } from './ShopFilterSheet'
import { ShopResultsGrid } from './ShopResultsGrid'
import { ShopNoResults } from './ShopNoResults'
import { BasketDrawer } from './BasketDrawer'

// Canonical dietary-chip order (matches the sheet's labels).
const DIETARY_ORDER = Object.keys(DIETARY_LABEL) as DietaryTag[]

/**
 * Placeholder that mirrors the loaded layout — dietary filter bar, category nav,
 * then category decks — at matching heights, so the swap from loading to content
 * lands the shelves in roughly the same place and doesn't shift the page (S3/CLS).
 */
function LoadingSkeleton() {
  const box = { background: 'var(--color-surface)' } as const
  return (
    <div aria-hidden>
      {/* Dietary filter bar */}
      <div className="flex gap-2 px-5 py-1 max-w-lg mx-auto overflow-hidden">
        {[64, 82, 72, 90].map((w, i) => (
          <div key={i} className="h-7 rounded-full flex-shrink-0" style={{ width: w, ...box }} />
        ))}
      </div>
      {/* Category jump-nav */}
      <div className="px-5 py-3 mt-1" style={{ borderBottom: '1px solid var(--color-border)' }}>
        <div className="flex gap-2 overflow-hidden">
          {[74, 62, 84, 68, 78].map((w, i) => (
            <div key={i} className="h-7 rounded-full flex-shrink-0" style={{ width: w, ...box }} />
          ))}
        </div>
      </div>
      {/* Category decks */}
      {[0, 1].map((i) => (
        <div key={i} className="pt-8">
          <div className="px-5 max-w-lg mx-auto mb-3">
            <div className="h-7 w-40 rounded-lg" style={box} />
          </div>
          <div className="flex gap-3 px-5 overflow-hidden">
            {[0, 1].map((j) => (
              <div key={j} className="w-[80vw] max-w-[300px] h-[21rem] rounded-2xl flex-shrink-0" style={{ ...box, border: '1px solid var(--color-border)' }} />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function TrustChip({ children }: { children: React.ReactNode }) {
  return (
    <span className="flex items-center gap-1.5 text-[11px] font-semibold whitespace-nowrap" style={{ color: 'var(--color-text-2)' }}>
      {children}
    </span>
  )
}

/**
 * A short, honest trust strip: only facts we can stand behind — the real free
 * delivery threshold, secure Stripe checkout, and (when the catalogue carries
 * real ratings) the aggregate customer rating. No invented numbers.
 */
function TrustStrip({ products }: { products: CatalogueProduct[] }) {
  const threshold = getPricingConfig().freeDeliveryThreshold
  const summary = catalogueRatingSummary(products)
  const accent = 'var(--color-accent)'
  return (
    <div className="px-5 pb-1 max-w-lg mx-auto">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 py-2.5 px-3.5 rounded-xl" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
        {summary && (
          <TrustChip>
            <Icon name="star" size={12} className="shrink-0" />
            <span><span style={{ color: 'var(--color-text)', fontFamily: 'var(--font-display)' }}>{summary.average.toFixed(1)}</span> from {summary.count.toLocaleString()} reviews</span>
          </TrustChip>
        )}
        {threshold > 0 && (
          <TrustChip>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={accent} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M1 3h15v13H1zM16 8h4l3 3v5h-7z" /><circle cx="5.5" cy="18.5" r="2" /><circle cx="18.5" cy="18.5" r="2" /></svg>
            <span>Free delivery over {formatGBP(threshold)}</span>
          </TrustChip>
        )}
        <TrustChip>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={accent} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
          <span>Secure checkout</span>
        </TrustChip>
      </div>
    </div>
  )
}

/**
 * The shop browse experience: a header + basket, dietary filters, a sticky
 * category jump-nav, and category swipe decks led by a Deals rail. Product
 * detail and the basket are bottom/side sheets.
 */
export function ShopShell() {
  const { products, isLoading: productsLoading } = useCatalogueProducts()
  const { bundles, isLoading: bundlesLoading } = useShopBundles()
  // Hold the skeleton until BOTH the catalogue and the bundles rail are ready, so
  // everything swaps in together — the bundles rail can't pop in late and shove the
  // shelves down (the main source of shop CLS). See LoadingSkeleton.
  const isLoading = productsLoading || bundlesLoading
  const { lines } = useBasket()
  const { state, checkout, reset } = useShopCheckout()
  const [expanded, setExpanded] = useState<CatalogueProduct | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  /**
   * Everything narrowing the shop, in one object. Replaces the old
   * `filters: DietaryTag[]`, which could only ever express dietary tags and died
   * on navigation. SS2 puts this in the URL.
   */
  const [query, setQuery] = useState<ShopQuery>(EMPTY_QUERY)
  /**
   * The search box's own value, updated on every keystroke and committed to
   * `query.q` on a 250ms debounce. Two values rather than one because the input
   * has to stay responsive while the result set — and the analytics event behind
   * it — should not be recomputed per character.
   */
  const [searchInput, setSearchInput] = useState('')
  const [filtersOpen, setFiltersOpen] = useState(false)
  /**
   * Recent searches, from this browser only. Read once on mount rather than on
   * every render: `localStorage` is synchronous and reading it during render
   * would also differ between the server pass and the client one.
   */
  const [recent, setRecent] = useState<string[]>([])
  useEffect(() => { setRecent(readRecentSearches()) }, [])
  /**
   * A code applied in the basket. Held here rather than in the drawer so it
   * survives the drawer being closed and re-opened mid-shop — and so the prices
   * on this page are computed from it.
   */
  const [appliedCode, setAppliedCode] = useState<AppliedCode | null>(null)

  // Dietary tags actually present in the catalogue, in canonical order.
  const availableDietary = useMemo(() => {
    const present = new Set<DietaryTag>()
    for (const p of products) for (const t of p.dietaryTags) present.add(t)
    return DIETARY_ORDER.filter((t) => present.has(t))
  }, [products])

  const matchesFilters = (p: CatalogueProduct) =>
    query.dietary.length === 0 || query.dietary.every((f) => p.dietaryTags.includes(f))

  const sections = useMemo(() => groupByCategory(products), [products])
  const dealsAll = useMemo(() => dealsProducts(products), [products])

  // One index per catalogue. Rebuilding it is tens of products' worth of string
  // work, so it is keyed on the catalogue itself rather than invalidated by hand.
  const index = useMemo(() => buildIndex(products), [products])

  /**
   * Commit the typed value to the query on a debounce. `searchInput` drives the
   * input; this drives the results — so the box never lags a keystroke behind
   * while the result set is not recomputed per character.
   */
  useEffect(() => {
    if (searchInput === query.q) return
    const timer = setTimeout(() => setQuery((q) => ({ ...q, q: searchInput })), 250)
    return () => clearTimeout(timer)
  }, [searchInput, query.q])

  /*
   * ── The query lives in the URL ──────────────────────────────────────────────
   *
   * Read once on mount, written on every change. Done against `window.history`
   * rather than `useSearchParams` + `router.replace` for two reasons: /shop is a
   * statically rendered route, and `useSearchParams` inside it would force the
   * whole shell behind a Suspense boundary; and `router.replace` asks the server
   * for an RSC payload on every call, which for a query that changes as you type
   * is a request per settled keystroke to learn nothing.
   *
   * `replaceState`, not `pushState`: typing "magnesium" should not leave nine
   * history entries between the shopper and the page they arrived from.
   */
  const hydratedFromUrl = useRef(false)
  useEffect(() => {
    if (hydratedFromUrl.current) return
    hydratedFromUrl.current = true
    const initial = decodeShopQuery(window.location.search)
    if (isEmptyQuery(initial) && initial.sort === EMPTY_QUERY.sort) return
    setQuery(initial)
    setSearchInput(initial.q)
  }, [])

  useEffect(() => {
    // Never before the URL has been read, or the first render would wipe the
    // deep link it is about to load.
    if (!hydratedFromUrl.current) return
    const next = `${window.location.pathname}${shopQuerySearch(query)}`
    if (next === `${window.location.pathname}${window.location.search}`) return
    window.history.replaceState(window.history.state, '', next)
  }, [query])

  /**
   * Suggestions track the BOX, not the results — they are undebounced on
   * purpose. A dropdown that lags a keystroke behind the text above it reads as
   * broken, and the work is a few hundred string comparisons.
   */
  const suggestions = useMemo(
    () => buildSuggestions({ index, products, query: searchInput, recent }),
    [index, products, searchInput, recent],
  )

  const searching = needsResultsView(query)
  const results = useMemo(
    () => (searching ? applyShopQuery(products, query, index) : null),
    [searching, products, query, index],
  )

  /**
   * One `shop_search` per settled query, not per keystroke — it fires off the
   * debounced value, so it records what someone actually searched for rather
   * than every prefix on the way there. A zero-result search is recorded
   * separately because it is the most commercially useful thing search knows:
   * what people ask us for that we do not stock.
   */
  const lastTracked = useRef<string | null>(null)
  useEffect(() => {
    if (isLoading || !results) return
    const text = query.q.trim()
    if (!text || text === lastTracked.current) return
    lastTracked.current = text
    const safe = queryForAnalytics(text)
    const props = { results: results.products.length, filters: query.dietary.length, ...(safe ? { q: safe } : {}) }
    track('shop_search', props)
    if (results.products.length === 0) track('shop_search_zero', safe ? { q: safe } : {})
  }, [isLoading, results, query.q, query.dietary.length])

  // Apply dietary filters, dropping any section (or the Deals rail) left empty.
  const filteredSections = useMemo(
    () =>
      sections
        .map((s) => ({ ...s, products: s.products.filter(matchesFilters) }))
        .filter((s) => s.products.length > 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sections, query.dietary],
  )
  const dealsSection = useMemo<ShopCategory | null>(() => {
    const deals = dealsAll.filter(matchesFilters)
    return deals.length > 0 ? { category: 'Deals', slug: 'deals', products: deals } : null
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dealsAll, query.dietary])

  // Bundles are visible when their whole curated stack passes the active dietary
  // filters — buying a bundle means buying every core product, so one excluded
  // product hides the bundle (a vegan filter hides a whey-led bundle).
  const productsById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products])
  const filteredBundles = useMemo(
    () =>
      bundles.filter((v) =>
        v.bundle.blueprint.slots.every((slot) => {
          const p = productsById.get(slot.selectedProductId)
          return p ? query.dietary.every((f) => p.dietaryTags.includes(f)) : query.dietary.length === 0
        }),
      ),
    [bundles, productsById, query.dietary],
  )

  const bundlesNav: ShopCategory | null =
    filteredBundles.length > 0 ? { category: 'Bundles', slug: 'bundles', products: [] } : null

  const navCategories = [
    ...(bundlesNav ? [bundlesNav] : []),
    ...(dealsSection ? [dealsSection] : []),
    ...filteredSections,
  ]
  const noResults = !isLoading && navCategories.length === 0

  const resolved = useMemo(() => resolveBasket(lines, products), [lines, products])

  /*
   * Heal the STORE, not just the render.
   *
   * `resolveBasket` hides a dead line on every read, so the page looks right
   * while the basket quietly keeps carrying it — forever, and back into view if
   * the catalogue ever changes underneath it again. Gated on the catalogue
   * actually having arrived: an empty `products` means "still loading", and
   * pruning against that would empty a perfectly good basket.
   */
  const prune = useBasket((s) => s.prune)
  useEffect(() => {
    if (isLoading || products.length === 0) return
    prune(products)
  }, [isLoading, products, prune])
  const subtotal = basketSubtotal(resolved)
  /**
   * What they'll actually be charged — the same computation /api/cart bills
   * from, so the total on screen is the total on the card.
   *
   * A PARTNER code still cannot apply here. A partner code is an acquisition
   * cost priced against what a stack is worth over its life; a single tub off
   * the shelf has neither a renewal behind it nor the basket size to carry 25%
   * and a commission on top, and `/api/cart` refuses one on this channel
   * whatever the browser sends.
   *
   * A FOUNDER code can, and that is why the box exists here at all — it is the
   * only journey where you can buy one thing off the shelf, which is exactly
   * what those codes are for. It repriced the basket rather than discounting
   * it, so it has to be in this call: a drawer showing £0.00 against a checkout
   * billing £48 is the failure `priceBasket` exists to prevent.
   */
  const config = getPricingConfig()
  const pricedBasket = priceBasket(resolved, config, appliedCode?.founderKind ?? null)
  const supplierValue = basketSupplierValue(resolved, config)
  // Counted from the RESOLVED lines, like every price on this page. Counting
  // raw persisted lines showed "2 · £0.00" for a basket of products that had
  // left the catalogue. See `resolvedItemCount`.
  const count = resolvedItemCount(resolved)

  // Funnel: one shop_view per mount (a ref keeps dev StrictMode from double-firing).
  const viewed = useRef(false)
  useEffect(() => {
    if (viewed.current) return
    viewed.current = true
    track('shop_view')
  }, [])

  const openDrawer = () => { reset(); track('basket_open', { items: count }); setDrawerOpen(true) }
  const closeDrawer = () => { setDrawerOpen(false); reset() }
  const openProduct = (p: CatalogueProduct) => { track('product_open', { id: p.id, category: p.category }); setExpanded(p) }

  /**
   * A product opened from the result grid. The rank is the whole point: it is
   * the only signal that says whether the ranking is any good — a search whose
   * answer is always at position nine is a search nobody trusts.
   */
  const openFromResults = (p: CatalogueProduct, rank: number) => {
    const safe = queryForAnalytics(query.q)
    track('shop_search_select', { id: p.id, rank, source: 'grid', ...(safe ? { q: safe } : {}) })
    rememberCurrentSearch()
    openProduct(p)
  }

  /**
   * Set the whole query at once — the empty state's recoveries, the control row
   * and the filter sheet all do this. The input is pushed in step so the box
   * never shows a search that is no longer running (and the debounce sees them
   * equal and stands down).
   */
  const handleQueryChange = (next: ShopQuery) => {
    setQuery(next)
    setSearchInput(next.q)
  }

  /**
   * Every change from the control row and the filter sheet. Named for what it
   * does rather than for the sort, which is only the part that needs its own
   * event on the way through.
   */
  const applyQueryChange = (next: ShopQuery) => {
    if (next.sort !== query.sort) track('shop_sort_change', { sort: next.sort })
    handleQueryChange(next)
  }

  const handleFacetApplied = (facet: string, value: string, on: boolean) => {
    track('shop_filter_apply', { facet, value, on, results: results?.products.length ?? products.length })
    // `shop_filter_toggle` predates the filter sheet and only ever meant a
    // dietary chip. Kept firing for exactly that, so the existing series stays
    // continuous rather than stopping dead the day filters got a panel.
    if (facet === 'dietary') {
      const active = on ? query.dietary.length + 1 : query.dietary.length - 1
      track('shop_filter_toggle', { tag: value, on, active })
    }
  }

  /**
   * Dismiss a filter we INFERRED from the search text, by deleting the words
   * that produced it. The box changes in front of them, so the text and the
   * filters can never disagree — see `stripPhrase`.
   */
  /**
   * A suggestion chosen from the dropdown.
   *
   * A product goes straight to its sheet — most searches here are for a thing,
   * and routing them through a one-row results grid adds a step to the common
   * case. A shelf jump becomes the filter it names and clears the text, so what
   * ends up on screen is a state the shopper can see and undo.
   */
  const handleSuggestion = (suggestion: Suggestion) => {
    if (suggestion.kind === 'recent') {
      handleQueryChange({ ...query, q: suggestion.query })
      return
    }

    if (suggestion.kind === 'jump') {
      setRecent(rememberSearch(searchInput))
      handleQueryChange({ ...query, ...jumpPatch(suggestion), q: '' })
      track('shop_filter_apply', { facet: suggestion.facet, value: suggestion.value, on: true, results: suggestion.count })
      return
    }

    const rank = suggestions.findIndex((s) => s.id === suggestion.id)
    const safe = queryForAnalytics(searchInput)
    track('shop_search_select', { id: suggestion.product.id, rank, source: 'suggestion', ...(safe ? { q: safe } : {}) })
    setRecent(rememberSearch(searchInput))
    openProduct(suggestion.product)
  }

  /**
   * A search is only worth remembering once it has been ACTED on — a product
   * opened, a shelf jumped to, or Enter pressed. Recording every settled
   * keystroke instead would fill the list with the prefixes someone typed on the
   * way to the thing they wanted.
   */
  const rememberCurrentSearch = () => {
    if (searchInput.trim()) setRecent(rememberSearch(searchInput))
  }

  const dismissIntent = (phrase: string) => {
    const q = stripPhrase(query.q, phrase)
    track('shop_filter_apply', { facet: 'intent', value: phrase, on: false, results: results?.products.length ?? 0 })
    handleQueryChange({ ...query, q })
  }

  const handleBuyNow = () => {
    setExpanded(null)
    setDrawerOpen(true)
    checkout(resolveBasket(useBasket.getState().lines, products), 'buy_now', appliedCode?.code ?? null)
  }

  // Second "start here" path: jump to the Deals rail (or the first shelf if there
  // are no deals). Kept content-agnostic so the hero never depends on load timing.
  const dealsPct = dealsSection ? maxDealPct(dealsSection.products) : 0
  const goToDeals = () => {
    const el = document.getElementById('shop-cat-deals') ?? document.querySelector('section[id^="shop-cat-"]')
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div className="min-h-[100dvh] bg-[var(--color-bg)] text-[var(--color-text)] pb-40">
      <ShopHeader count={count} onOpenBasket={openDrawer} />

      <main>
      <div className="px-5 pt-2 pb-4 max-w-lg mx-auto">
        <p className="text-[10px] font-bold tracking-[0.25em] uppercase" style={{ color: 'var(--color-accent)', fontFamily: 'var(--font-display)' }}>
          The Shop
        </p>
        <h1 className="font-black tracking-tight leading-[1.03] mt-1" style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-fluid-h1)' }}>
          Everything, à la carte
        </h1>
        <p className="text-sm mt-2" style={{ color: 'var(--color-text-2)' }}>
          Protein, performance, hydration and everyday health — the full CHRGD range, priced à la carte.
        </p>

        {/*
          Two clear "start here" paths: the personalised quiz and the deals rail.
          Both are answers to "what should I look at" — so they stand down once
          someone has said what they are looking for, along with the trust strip
          below, and the results start higher up the page.
        */}
        {!searching && (
        <div className="grid grid-cols-2 gap-2.5 mt-4">
          <Link
            href="/"
            className="flex flex-col justify-between rounded-2xl px-4 py-3.5 min-h-[92px] active:scale-[0.99] transition-transform"
            style={{ background: 'color-mix(in srgb, var(--color-accent) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--color-accent) 26%, transparent)' }}
          >
            <span className="w-7 h-7 rounded-full flex items-center justify-center" style={{ background: 'color-mix(in srgb, var(--color-accent) 16%, transparent)' }} aria-hidden>
              <CHRGDBolt size={15} />
            </span>
            <span>
              <span className="block text-sm font-black leading-tight" style={{ color: 'var(--color-text)', fontFamily: 'var(--font-display)' }}>Take the 2-min quiz</span>
              <span className="block text-[11px] mt-0.5" style={{ color: 'var(--color-text-2)' }}>A stack built around your goals</span>
            </span>
          </Link>

          <button
            onClick={goToDeals}
            className="flex flex-col justify-between text-left rounded-2xl px-4 py-3.5 min-h-[92px] active:scale-[0.99] transition-transform"
            style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border-2)' }}
          >
            <span className="w-7 h-7 rounded-full flex items-center justify-center" style={{ background: 'color-mix(in srgb, var(--color-accent) 12%, transparent)' }} aria-hidden>
              <CHRGDBolt size={15} color="var(--color-accent)" />
            </span>
            <span>
              <span className="block text-sm font-black leading-tight" style={{ color: 'var(--color-text)', fontFamily: 'var(--font-display)' }}>
                {dealsSection ? "Today’s deals" : 'Browse the range'}
              </span>
              <span className="block text-[11px] mt-0.5" style={{ color: dealsSection ? 'var(--color-accent)' : 'var(--color-text-2)' }}>
                {dealsSection ? `Save up to ${dealsPct}%` : 'Jump to the shelves'}
              </span>
            </span>
          </button>
        </div>
        )}
      </div>

      {!searching && <TrustStrip products={products} />}

      {isLoading ? (
        <LoadingSkeleton />
      ) : (
        <>
          <ShopCategoryNav
            categories={searching ? [] : navCategories}
            controls={
              <>
                <ShopSearchBar
                  value={searchInput}
                  onChange={setSearchInput}
                  resultCount={results ? results.products.length : null}
                  suggestions={suggestions}
                  onSelect={handleSuggestion}
                  onSubmit={rememberCurrentSearch}
                  onClearRecent={() => setRecent(clearRecentSearches())}
                />
                <ShopFilterBar
                  tags={availableDietary}
                  query={query}
                  onChange={applyQueryChange}
                  onOpenFilters={() => setFiltersOpen(true)}
                  onFacetApplied={handleFacetApplied}
                  intentPhrases={results?.matchedPhrases ?? []}
                  onDismissIntent={dismissIntent}
                />
              </>
            }
          />

          {/*
            Two modes. Browsing is the page exactly as it has always been —
            shelves, bundles, deals — because the dietary chips already narrow
            them in place and that works. A search replaces the shelves with a
            grid: a horizontal deck cannot answer "how many, and is it in there".
          */}
          {searching && results ? (
            results.products.length > 0 ? (
              <ShopResultsGrid
                products={results.products}
                query={query.q.trim()}
                fuzzy={results.fuzzy}
                onExpand={openFromResults}
              />
            ) : (
              <ShopNoResults
                products={products}
                index={index}
                query={query}
                onQueryChange={handleQueryChange}
                onExpand={openProduct}
              />
            )
          ) : noResults ? (
            <ShopNoResults
              products={products}
              index={index}
              query={query}
              onQueryChange={handleQueryChange}
              onExpand={openProduct}
            />
          ) : (
            <div className="pb-4">
              {filteredBundles.length > 0 && (
                <ShopBundlesRow bundles={filteredBundles} products={products} />
              )}
              {dealsSection && (
                <ShopSection
                  section={dealsSection}
                  tone="deal"
                  subtitle={`Save up to ${maxDealPct(dealsSection.products)}%`}
                  onExpand={openProduct}
                />
              )}
              {filteredSections.map((section) => (
                <ShopSection key={section.slug} section={section} onExpand={openProduct} />
              ))}
            </div>
          )}
        </>
      )}
      </main>

      {filtersOpen && (
        <ShopFilterSheet
          products={products}
          query={query}
          resultCount={results ? results.products.length : products.length}
          onChange={applyQueryChange}
          onFacetApplied={handleFacetApplied}
          onClose={() => setFiltersOpen(false)}
        />
      )}

      {expanded && (
        <ShopProductSheet product={expanded} onBuyNow={handleBuyNow} onClose={() => setExpanded(null)} />
      )}

      {/* Slim basket opener — the full drawer opens on tap */}
      {count > 0 && !drawerOpen && (
        <div className="fixed inset-x-0 bottom-0 z-40 px-4 pb-[max(0.9rem,env(safe-area-inset-bottom))] pt-6 pointer-events-none" style={{ background: 'linear-gradient(to top, var(--color-bg) 55%, transparent)' }}>
          <button
            onClick={openDrawer}
            className="max-w-lg mx-auto w-full flex items-center gap-3 rounded-2xl pl-4 pr-3 py-3 pointer-events-auto active:scale-[0.99] transition-transform"
            style={{ background: 'var(--color-accent)', color: 'var(--color-bg)', boxShadow: '0 10px 34px -10px rgba(0,0,0,0.7)' }}
          >
            <span className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-black flex-shrink-0" style={{ background: 'var(--color-bg)', color: 'var(--color-accent)', fontFamily: 'var(--font-display)' }}>{count}</span>
            <span className="flex-1 text-left text-sm font-bold" style={{ fontFamily: 'var(--font-display)' }}>View basket</span>
            <span className="text-sm font-black" style={{ fontFamily: 'var(--font-display)' }}>{formatGBP(subtotal)} →</span>
          </button>
        </div>
      )}

      {drawerOpen && (
        <BasketDrawer
          resolved={resolved}
          subtotal={subtotal}
          priced={pricedBasket}
          supplierValue={supplierValue}
          appliedCode={appliedCode}
          onCodeChange={setAppliedCode}
          checkoutState={state}
          onCheckout={() => checkout(resolved, 'basket', appliedCode?.code ?? null)}
          onClose={closeDrawer}
        />
      )}
    </div>
  )
}
