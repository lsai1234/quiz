'use client'

import { useRouter } from 'next/navigation'

import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import type { CatalogueProduct, DietaryTag } from '@/lib/catalogue/types'
import { useCatalogueProducts, invalidateCatalogue } from '@/hooks/useCatalogueProducts'
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
import { bestNudge } from '@/lib/shop/basket-alchemy'
import { MAX_DUEL_PRODUCTS } from '@/lib/shop/duel'
import { shouldAskModel, isEmptyPatch, type IntentPatch } from '@/lib/shop/intent-ai'
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
import { ShopSearchBar } from './ShopSearchBar'
import { ShopFilterSheet } from './ShopFilterSheet'
import { ShopBasketNudge } from './ShopBasketNudge'
import { ShopDuelSheet } from './ShopDuelSheet'
import { ShopCompareBar } from './ShopCompareBar'
import { ShopRouletteSheet } from './ShopRouletteSheet'
import { ShopResultsGrid } from './ShopResultsGrid'
import { ShopNoResults } from './ShopNoResults'
import { BasketDrawer } from './BasketDrawer'
import { ShopGoalRow } from './ShopGoalRow'
import { ShopHeroProvider, ShopMasthead, ShopTwinTiles, ShopBreak } from './ShopHeroes'
import { BREAK_AFTER_SHELF } from '@/lib/shop/placements'
import { rememberScroll, readScroll, forgetScroll } from '@/lib/shop/scroll-memory'
import { Button } from '@/components/storefront'

// Canonical dietary-chip order (matches the sheet's labels).
const DIETARY_ORDER = Object.keys(DIETARY_LABEL) as DietaryTag[]

/**
 * Placeholder that mirrors the loaded layout — dietary filter bar, category nav,
 * then category decks — at matching heights, so the swap from loading to content
 * lands the shelves in roughly the same place and doesn't shift the page (S3/CLS).
 */
function LoadingSkeleton() {
  /*
    The same shape as the thing it stands in for: a goal row, a control row, a
    sticky category row and a two-column grid of cards at the card's real
    proportions. The old one laid out horizontal decks at a different height, so
    the page jumped when the catalogue landed — which is the one job a skeleton
    has.
  */
  const box = { background: 'var(--surface)' } as const
  return (
    <div aria-hidden>
      <div className="flex" style={{ gap: 'var(--space-3)', padding: 'var(--space-2) var(--space-4)' }}>
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="flex flex-col items-center flex-shrink-0" style={{ width: 68, gap: 'var(--space-2)' }}>
            <div style={{ ...box, width: 56, height: 56, borderRadius: 'var(--r-pill)' }} />
            <div style={{ ...box, width: 44, height: 10, borderRadius: 4 }} />
          </div>
        ))}
      </div>

      <div className="flex" style={{ gap: 'var(--space-2)', padding: 'var(--space-4) var(--space-4) 0' }}>
        {[72, 96, 104, 88].map((w, i) => (
          <div key={i} style={{ ...box, width: w, height: 36, borderRadius: 'var(--r-pill)' }} />
        ))}
      </div>

      <div style={{ borderBottom: '1px solid var(--line)', marginTop: 'var(--space-3)' }} />

      <div style={{ padding: 'var(--space-8) var(--space-4) 0' }}>
        <div style={{ ...box, width: 120, height: 22, borderRadius: 6, marginBottom: 'var(--space-4)' }} />
        <div className="grid" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 'var(--space-3)' }}>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} style={{ ...box, borderRadius: 'var(--r-card)' }}>
              <div className="w-full aspect-square" />
              <div style={{ padding: 'var(--space-3)' }}>
                <div style={{ background: 'var(--surface-hi)', width: '52%', height: 10, borderRadius: 4 }} />
                <div style={{ background: 'var(--surface-hi)', width: '40%', height: 15, borderRadius: 4, marginTop: 'var(--space-2)' }} />
                <div style={{ background: 'var(--surface-hi)', width: '80%', height: 12, borderRadius: 4, marginTop: 'var(--space-2)' }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function TrustChip({ children }: { children: React.ReactNode }) {
  return (
    <span className="flex items-center gap-1.5 text-[11px] font-medium whitespace-nowrap" style={{ color: 'var(--text-dim)' }}>
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

  /*
    Three facts, each with its glyph. It was a run-on sentence of grey text
    joined by middots, which is the shape of a footer rather than of
    reassurance — and it was one more block of prose on a screen made entirely
    of prose.
  */
  const facts: Array<{ icon: string; text: string }> = [
    ...(summary ? [{ icon: 'star', text: `${summary.average.toFixed(1)} from ${summary.count.toLocaleString()} reviews` }] : []),
    ...(threshold > 0 ? [{ icon: 'truck', text: `Free delivery over ${formatGBP(threshold)}` }] : []),
    { icon: 'lock', text: 'Secure checkout' },
  ]

  /* Wrapped, not scrolled: three short facts do not fit one 390px line, and a
     reassurance the shopper has to swipe to reach is not reassuring. */
  return (
    <ul
      className="flex flex-wrap"
      style={{ gap: 'var(--space-2) var(--space-4)', padding: 'var(--space-4) var(--space-4) 0' }}
    >
      {facts.map((f) => (
        <li key={f.text} className="sf-meta flex items-center flex-shrink-0" style={{ gap: 'var(--space-2)' }}>
          <Icon name={f.icon as never} size={14} className="shrink-0" />
          {f.text}
        </li>
      ))}
    </ul>
  )
}

/**
 * What the shop says when it has no catalogue.
 *
 * Not a spinner and not a blank grid: it names what failed, and offers the one
 * action that ever helps — try again. The reason comes from `loadCatalogue`,
 * which distinguishes "took too long" from whatever the server actually said,
 * because those need different things from whoever is reading.
 */
function CatalogueUnavailable({ message }: { message: string }) {
  return (
    <section style={{ padding: 'var(--space-12) var(--space-4)' }} className="max-w-lg mx-auto text-center">
      <svg
        width="72" height="72" viewBox="0 0 72 72" fill="none" aria-hidden className="mx-auto"
        style={{ color: 'var(--text-dim)', opacity: 0.5, marginBottom: 'var(--space-4)' }}
      >
        <rect x="10" y="20" width="52" height="6" rx="3" fill="currentColor" opacity="0.55" />
        <rect x="10" y="44" width="52" height="6" rx="3" fill="currentColor" opacity="0.55" />
        <path d="M16 26v18M56 26v18" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" opacity="0.35" />
        <path d="M28 35h16" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      </svg>

      <p className="sf-title" style={{ color: 'var(--text)' }}>The shelves are empty</p>
      <p className="sf-meta" style={{ marginTop: 'var(--space-2)' }}>{message}</p>

      <div style={{ marginTop: 'var(--space-5)' }}>
        <Button variant="secondary" size="md" onClick={() => { invalidateCatalogue(); window.location.reload() }}>
          Try again
        </Button>
      </div>
    </section>
  )
}

/**
 * The shop browse experience: a header + basket, dietary filters, a sticky
 * category jump-nav, and category swipe decks led by a Deals rail. Product
 * detail and the basket are bottom/side sheets.
 */
export function ShopShell() {
  const router = useRouter()

  /** Two view modes the shelf offers: prices per serving, and duel selection. */
  const [perServing, setPerServing] = useState(false)
  const [compareMode, setCompareMode] = useState(false)
  const { products, isLoading: productsLoading, error: catalogueError } = useCatalogueProducts()
  const { bundles, isLoading: bundlesLoading } = useShopBundles()
  // Hold the skeleton until BOTH the catalogue and the bundles rail are ready, so
  // everything swaps in together — the bundles rail can't pop in late and shove the
  // shelves down (the main source of shop CLS). See LoadingSkeleton.
  const isLoading = productsLoading || bundlesLoading
  const { lines } = useBasket()
  const { state, checkout, reset } = useShopCheckout()
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
   * Nudges waved away this session. Not persisted: the basket changes, and a
   * suggestion about a basket someone no longer has is not one worth suppressing
   * next week.
   */
  const [dismissedNudges, setDismissedNudges] = useState<ReadonlySet<string>>(new Set())
  /**
   * Products picked for a duel, in the order they were picked. Two at most —
   * see `MAX_DUEL_PRODUCTS`; a third replaces the oldest rather than being
   * refused, because a silent no-op reads as a broken button.
   */
  const [compareIds, setCompareIds] = useState<string[]>([])
  const [duelOpen, setDuelOpen] = useState(false)
  const [rouletteOpen, setRouletteOpen] = useState(false)
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

  /**
   * What this basket is close to being — a bundle it nearly completes, or the
   * free-delivery line. One suggestion at a time; see `basket-alchemy`.
   *
   * The shelf bar carries the delivery ladder too, because that is the half of
   * this the drawer already had and it lived behind a tap — after the decision
   * had been made rather than while there was still something to add.
   */
  const shelfNudge = useMemo(
    () => bestNudge({ resolved, subtotal, bundles, products, dismissed: dismissedNudges }),
    [resolved, subtotal, bundles, products, dismissedNudges],
  )
  /** The drawer draws its own free-delivery ladder, so it only takes bundles. */
  const drawerNudge = useMemo(
    () => bestNudge({ resolved, subtotal, bundles, products, dismissed: dismissedNudges, skipDelivery: true }),
    [resolved, subtotal, bundles, products, dismissedNudges],
  )

  const compareSet = useMemo(() => new Set(compareIds), [compareIds])
  const comparing = useMemo(
    () => compareIds.map((id) => productsById.get(id)).filter((p): p is CatalogueProduct => !!p),
    [compareIds, productsById],
  )

  const toggleCompare = (product: CatalogueProduct) => {
    setCompareIds((ids) => {
      if (ids.includes(product.id)) return ids.filter((id) => id !== product.id)
      // Picking a third drops the first, so the button always does something.
      const next = [...ids, product.id]
      return next.slice(-MAX_DUEL_PRODUCTS)
    })
  }

  const openDuel = () => {
    if (comparing.length < MAX_DUEL_PRODUCTS) return
    track('shop_duel_open', { a: comparing[0].id, b: comparing[1].id })
    setDuelOpen(true)
  }

  /**
   * ── The fallback parse ──────────────────────────────────────────────────────
   *
   * Only for a sentence the local pass could make NOTHING of: no results, no
   * intent read from the table, at least three words. A query that already works
   * is never sent away to be answered again, and nothing on screen waits for
   * this — local results render first and this folds in if it arrives with
   * something. With no OPENAI_API_KEY the route returns an empty patch and the
   * shop behaves exactly as it did before it existed.
   */
  const askedModel = useRef<string | null>(null)
  useEffect(() => {
    if (isLoading || !results) return
    const text = query.q.trim()
    if (!shouldAskModel(text, results.products.length, results.matchedPhrases.length)) return
    if (askedModel.current === text) return
    askedModel.current = text

    let live = true
    void fetch('/api/shop-intent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: text }),
    })
      .then((r) => r.json())
      .then(({ patch }: { patch?: IntentPatch }) => {
        // Only if they are still looking at the search this was asked about —
        // rewriting a query someone has since changed is worse than not helping.
        if (!live || !patch || isEmptyPatch(patch) || useLatestQuery.current !== text) return
        track('shop_intent_ai', { applied: true })
        setQuery((q) => ({
          ...q,
          q: patch.text || '',
          dietary: [...new Set([...q.dietary, ...patch.dietary])],
          goals: [...new Set([...q.goals, ...patch.goals])],
          slots: [...new Set([...q.slots, ...patch.slots])],
          categories: [...new Set([...q.categories, ...patch.categories])],
          priceMax: q.priceMax ?? patch.priceMax,
          priceMin: q.priceMin ?? patch.priceMin,
          stimFree: q.stimFree || patch.stimFree,
        }))
        setSearchInput(patch.text || '')
      })
      .catch(() => { /* a search that works without this must not break because of it */ })
    return () => { live = false }
  }, [isLoading, results, query.q])

  /** What the box holds right now, for the async parse to check against. */
  const useLatestQuery = useRef('')
  useEffect(() => { useLatestQuery.current = query.q.trim() }, [query.q])

  const dismissNudge = (key: string) => {
    track('shop_nudge_dismiss', { key })
    setDismissedNudges((keys) => new Set([...keys, key]))
  }

  // One view event per nudge, per basket state — a suggestion that survives a
  // re-render is still the same suggestion, and counting it twice would make the
  // click-through rate meaningless.
  const viewedNudges = useRef(new Set<string>())
  useEffect(() => {
    const key = shelfNudge?.key
    if (!key || viewedNudges.current.has(key)) return
    viewedNudges.current.add(key)
    track('shop_nudge_view', { key, kind: shelfNudge.kind })
  }, [shelfNudge])

  // Funnel: one shop_view per mount (a ref keeps dev StrictMode from double-firing).
  /**
   * Put them back where they were, once there is a page tall enough to do it.
   *
   * Restoring on mount is too early: the catalogue arrives from a client fetch,
   * so the document is a skeleton a fraction of its final height and the scroll
   * clamps. Waiting for `isLoading` to clear and then for one frame is the
   * point at which the shelves have actually laid out.
   */
  useEffect(() => {
    if (isLoading) return
    const y = readScroll()
    if (y === null) return
    forgetScroll()
    const frame = requestAnimationFrame(() => window.scrollTo({ top: y, behavior: 'auto' }))
    return () => cancelAnimationFrame(frame)
  }, [isLoading])

  const viewed = useRef(false)
  useEffect(() => {
    if (viewed.current) return
    viewed.current = true
    track('shop_view')
  }, [])

  const openDrawer = () => { reset(); track('basket_open', { items: count }); setDrawerOpen(true) }

  /*
   * `/shop#basket` opens the drawer.
   *
   * The basket lives in this shell, so a product page — which has no shell —
   * cannot open it directly. Rather than give that page a second, thinner
   * basket, its header links here and the hash says what to do on arrival. The
   * hash is then cleared so a refresh or a back-navigation does not re-open a
   * drawer the shopper already closed.
   */
  useEffect(() => {
    if (window.location.hash !== '#basket') return
    window.history.replaceState(null, '', window.location.pathname + window.location.search)
    setDrawerOpen(true)
  }, [])
  const closeDrawer = () => { setDrawerOpen(false); reset() }
  /*
   * Tracking only. The card is a link to `/product/[handle]` and the browser
   * does the navigating — the bottom sheet this used to open is gone. A sheet
   * cannot be linked to, shared, bookmarked, opened in a tab or indexed, and
   * the back button does not mean what a shopper expects inside one.
   */
  const openProduct = (p: CatalogueProduct) => {
    track('product_open', { id: p.id, category: p.category })
    /* Where they were, so coming back lands on the same shelf rather than at
       the top — see `scroll-memory` for why the browser cannot do this here. */
    rememberScroll(window.scrollY)
  }

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
    // A recent search and an example both just fill the box — the difference is
    // where the words came from, and that matters to analytics, not behaviour.
    if (suggestion.kind === 'recent' || suggestion.kind === 'example') {
      if (suggestion.kind === 'example') track('shop_search_example', { q: suggestion.query })
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
    /* A suggestion used to open the sheet. With the sheet gone it has to take
       the shopper somewhere, and the somewhere is the product's own URL. */
    router.push(`/product/${suggestion.product.handle}`)
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

  // Second "start here" path: jump to the Deals rail (or the first shelf if there
  // are no deals). Kept content-agnostic so the hero never depends on load timing.
  const dealsPct = dealsSection ? maxDealPct(dealsSection.products) : 0
  const goToDeals = () => {
    const el = document.getElementById('shop-cat-deals') ?? document.querySelector('section[id^="shop-cat-"]')
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    /*
      `.storefront` is the scope for the whole token set: the global transition,
      the focus ring and the type roles are all defined under it, so nothing
      here can reach the quiz or the hubs, which still run the glass system.

      The lit ground came off. It is a good effect and the hubs keep it, but it
      is a gradient and a glow, and the storefront now has neither.
    */
    <ShopHeroProvider>
    <div className="storefront min-h-[100dvh]" style={{ background: 'var(--bg)', color: 'var(--text)', paddingBottom: 'var(--space-12)' }}>
      <ShopHeader count={count} onOpenBasket={openDrawer} />

      <main>
      <div style={{ padding: 'var(--space-2) var(--space-4) var(--space-4)' }}>
        <p className="sf-label">The Shop</p>
        <h1 className="sf-display" style={{ color: 'var(--text)', marginTop: 'var(--space-2)' }}>
          Everything, à la carte
        </h1>
        <p className="sf-meta" style={{ marginTop: 'var(--space-2)' }}>
          Protein, performance, hydration and everyday health — the full CHRGD range, priced à la carte.
        </p>

        {/*
          The masthead. Uploaded artwork when a founder has added any, and a
          built one made of the shop's own product photography when not — see
          `ShopHeroes`. The shop never opens on a blank rectangle waiting for
          somebody.
        */}
        {!searching && (
          <div style={{ marginTop: 'var(--space-5)' }}>
            <ShopMasthead products={products} />
          </div>
        )}
      </div>

      {!searching && (
        <ShopGoalRow
          products={products}
          selected={query.goals}
          onSelect={(goal) => applyQueryChange({ ...query, goals: goal ? [goal] : [] })}
          onSurprise={() => { track('shop_roulette_open'); setRouletteOpen(true) }}
        />
      )}

      {/* The twin tiles, under the goals. Absent until a founder fills them. */}
      {!searching && <ShopTwinTiles />}

      {!searching && <TrustStrip products={products} />}

      {/*
        Three states, not two.

        The shop used to have "loading" and "loaded", and discarded the
        catalogue's error entirely — so a failed or slow fetch showed a skeleton
        for a moment and then an empty page with a search box and no
        explanation. A shop with nothing in it and nothing to say about why is
        indistinguishable from a broken one, which is exactly what it is.
      */}
      {!isLoading && catalogueError && products.length === 0 ? (
        <CatalogueUnavailable message={catalogueError} />
      ) : isLoading ? (
        <LoadingSkeleton />
      ) : (
        <>
          {/*
            Search and filters live in the page, not in the sticky bar.

            They used to be passed into `ShopCategoryNav` as `controls`, which
            stacked them directly above the category pills — two rows of chips,
            same shape, same size, one narrowing the catalogue and one jumping
            within it. Separating them by placement is what makes them legible
            as different things: this scrolls away, the category row stays.
          */}
          <div style={{ padding: '0 var(--space-4) var(--space-4)' }}>
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
              perServing={perServing}
              onPerServingChange={setPerServing}
              compareMode={compareMode}
              onCompareModeChange={(on) => { setCompareMode(on); if (!on) setCompareIds([]) }}
              tags={availableDietary}
              query={query}
              onChange={applyQueryChange}
              onOpenFilters={() => setFiltersOpen(true)}
              onFacetApplied={handleFacetApplied}
              intentPhrases={results?.matchedPhrases ?? []}
              onDismissIntent={dismissIntent}
            />
          </div>

          <ShopCategoryNav categories={searching ? [] : navCategories} />

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
                onOpen={openFromResults}
              />
            ) : (
              <ShopNoResults
                products={products}
                index={index}
                query={query}
                onQueryChange={handleQueryChange}
                onOpen={openProduct}
              />
            )
          ) : noResults ? (
            <ShopNoResults
              products={products}
              index={index}
              query={query}
              onQueryChange={handleQueryChange}
              onOpen={openProduct}
            />
          ) : (
            <div className="pb-4">
              {filteredBundles.length > 0 && (
                <ShopBundlesRow bundles={filteredBundles} products={products} />
              )}
              {dealsSection && (
                /* The Deals shelf is an ordinary shelf. It used to take an
                   accent heading and a "Save up to N%" subtitle; the heading
                   already says Deals, and accent is now spent only on the one
                   primary action per screen. */
                <ShopSection
                  section={dealsSection}
                  onOpen={openProduct}
                  perServing={perServing}
                  selectable={compareMode}
                  selectedIds={compareSet}
                  onToggleSelect={toggleCompare}
                />
              )}
              {/*
                Shelves, with the breaks cut into them.

                The position of each break is counted in SHELVES rather than
                hardcoded against a category, because the category list is
                founder-editable: pinning "after Hydration" would silently move
                the picture to the bottom of the page the day somebody renamed
                or removed that shelf. Counting shelves keeps it a third of the
                way down whatever the catalogue is doing. `BREAK_AFTER_SHELF`
                is shared with the Hub so the "where it appears" text and the
                real position cannot disagree.
              */}
              {filteredSections.map((section, i) => {
                const shelfNumber = i + 1
                const breakSlot = Object.keys(BREAK_AFTER_SHELF)
                  .find((slot) => BREAK_AFTER_SHELF[slot] === shelfNumber)
                return (
                  <Fragment key={section.slug}>
                    <ShopSection
                      section={section}
                      onOpen={openProduct}
                      perServing={perServing}
                      selectable={compareMode}
                      selectedIds={compareSet}
                      onToggleSelect={toggleCompare}
                    />
                    {breakSlot && <ShopBreak slot={breakSlot} />}
                  </Fragment>
                )
              })}
            </div>
          )}
        </>
      )}
      </main>

      {rouletteOpen && (
        <ShopRouletteSheet products={products} query={query} onClose={() => setRouletteOpen(false)} />
      )}

      {duelOpen && comparing.length === MAX_DUEL_PRODUCTS && (
        <ShopDuelSheet
          products={[comparing[0], comparing[1]]}
          onClose={() => setDuelOpen(false)}
        />
      )}

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

      {/* The bottom region: a duel being assembled, a suggestion, a basket — or
          any combination. It appears for a compare selection even with an empty
          basket, because picking two products is a task of its own. */}
      {!drawerOpen && (count > 0 || comparing.length > 0) && (
        /* No gradient scrim: an opaque bar is what divides two sections, and the
           storefront has no gradients. */
        <div
          className="fixed inset-x-0 bottom-0 z-40 pointer-events-none"
          style={{ padding: 'var(--space-3) var(--space-4) max(var(--space-3), env(safe-area-inset-bottom))' }}
        >
          {/*
            While a duel is being assembled the compare bar takes the nudge's
            place. Compare is an active task and the nudge is a passive
            suggestion; stacking both above the basket bar is three things
            competing for the bottom of a phone.
          */}
          {/* One bar. A duel being assembled REPLACES the basket bar rather than
              sitting on top of it — see ShopCompareBar. */}
          {comparing.length > 0 ? (
            <div className="pointer-events-auto">
              <ShopCompareBar
                products={comparing}
                onOpen={openDuel}
                onClear={() => setCompareIds([])}
              />
            </div>
          ) : count > 0 && shelfNudge ? (
            <div className="pointer-events-auto" style={{ marginBottom: 'var(--space-2)' }}>
              <ShopBasketNudge
                nudge={shelfNudge}
                onAct={() => track('shop_nudge_click', { key: shelfNudge.key, kind: shelfNudge.kind })}
                onDismiss={() => dismissNudge(shelfNudge.key)}
              />
            </div>
          ) : null}
          {comparing.length === 0 && count > 0 && (
            /* The shelf's one primary action. */
            <div className="pointer-events-auto" style={{ background: 'var(--bg)', borderRadius: 'var(--r-control)' }}>
              <Button variant="primary" size="lg" fullWidth onClick={openDrawer} aria-label={`View basket, ${count} item${count !== 1 ? 's' : ''}, ${formatGBP(subtotal)}`}>
                <span className="flex-1 text-left">View basket</span>
                <span className="sf-num">{formatGBP(subtotal)}</span>
              </Button>
            </div>
          )}
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
          products={products}
          onBrowseSlot={(slot) => {
            closeDrawer()
            handleQueryChange({ ...EMPTY_QUERY, slots: [slot] })
            track('shop_filter_apply', { facet: 'slot', value: slot, on: true, results: 0 })
          }}
          nudge={drawerNudge}
          onNudgeAct={() => drawerNudge && track('shop_nudge_click', { key: drawerNudge.key, kind: drawerNudge.kind })}
          onNudgeDismiss={() => drawerNudge && dismissNudge(drawerNudge.key)}
          checkoutState={state}
          onCheckout={() => checkout(resolved, 'basket', appliedCode?.code ?? null)}
          onClose={closeDrawer}
        />
      )}
    </div>
    </ShopHeroProvider>
  )
}
