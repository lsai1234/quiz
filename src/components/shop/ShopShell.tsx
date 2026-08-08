'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import type { CatalogueProduct, DietaryTag } from '@/lib/catalogue/types'
import { useCatalogueProducts } from '@/hooks/useCatalogueProducts'
import { useShopBundles } from '@/hooks/useShopBundles'
import { useBasket } from '@/lib/basket/store'
import { useShopCheckout } from '@/hooks/useShopCheckout'
import type { AppliedCode } from '@/components/checkout/PartnerCodeBox'
import { resolveBasket, basketSubtotal, basketItemCount, priceBasket } from '@/lib/basket/helpers'
import { groupByCategory, type ShopCategory } from '@/lib/shop/categories'
import { dealsProducts, maxDealPct } from '@/lib/shop/merchandising'
import { catalogueRatingSummary } from '@/lib/shop/ratings'
import { track } from '@/lib/analytics/events'
import { DIETARY_LABEL } from '@/lib/product-facts'
import { formatGBP, getPricingConfig } from '@/lib/stack-blueprint/pricing'
import { CHRGDBolt } from '@/components/brand/CHRGDLogo'
import { ShopHeader } from './ShopHeader'
import { ShopFilterBar } from './ShopFilterBar'
import { ShopCategoryNav } from './ShopCategoryNav'
import { ShopSection } from './ShopSection'
import { ShopBundlesRow } from './ShopBundlesRow'
import { ShopProductSheet } from './ShopProductSheet'
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
            <span style={{ color: accent }} aria-hidden>★</span>
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
  const [filters, setFilters] = useState<DietaryTag[]>([])

  // Dietary tags actually present in the catalogue, in canonical order.
  const availableDietary = useMemo(() => {
    const present = new Set<DietaryTag>()
    for (const p of products) for (const t of p.dietaryTags) present.add(t)
    return DIETARY_ORDER.filter((t) => present.has(t))
  }, [products])

  const matchesFilters = (p: CatalogueProduct) =>
    filters.length === 0 || filters.every((f) => p.dietaryTags.includes(f))

  const sections = useMemo(() => groupByCategory(products), [products])
  const dealsAll = useMemo(() => dealsProducts(products), [products])

  // Apply dietary filters, dropping any section (or the Deals rail) left empty.
  const filteredSections = useMemo(
    () =>
      sections
        .map((s) => ({ ...s, products: s.products.filter(matchesFilters) }))
        .filter((s) => s.products.length > 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sections, filters],
  )
  const dealsSection = useMemo<ShopCategory | null>(() => {
    const deals = dealsAll.filter(matchesFilters)
    return deals.length > 0 ? { category: 'Deals', slug: 'deals', products: deals } : null
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dealsAll, filters])

  // Bundles are visible when their whole curated stack passes the active dietary
  // filters — buying a bundle means buying every core product, so one excluded
  // product hides the bundle (a vegan filter hides a whey-led bundle).
  const productsById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products])
  const filteredBundles = useMemo(
    () =>
      bundles.filter((v) =>
        v.bundle.blueprint.slots.every((slot) => {
          const p = productsById.get(slot.selectedProductId)
          return p ? filters.every((f) => p.dietaryTags.includes(f)) : filters.length === 0
        }),
      ),
    [bundles, productsById, filters],
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
  const subtotal = basketSubtotal(resolved)
  // A partner's code, once validated. Held here rather than in the drawer so it
  // survives the drawer closing and reopening mid-shop.
  const [partnerCode, setPartnerCode] = useState<AppliedCode | null>(null)
  // What they'll actually be charged — the same computation /api/cart bills from,
  // including the code, so the total on screen is the total on the card.
  const pricedBasket = priceBasket(resolved, undefined, partnerCode?.discountPct ?? 0)
  const count = basketItemCount(lines)

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
  const toggleFilter = (tag: DietaryTag) => {
    const on = !filters.includes(tag)
    const next = on ? [...filters, tag] : filters.filter((t) => t !== tag)
    track('shop_filter_toggle', { tag, on, active: next.length })
    setFilters(next)
  }

  const handleBuyNow = () => {
    setExpanded(null)
    setDrawerOpen(true)
    checkout(resolveBasket(useBasket.getState().lines, products), 'buy_now', partnerCode?.code ?? null)
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

        {/* Two clear "start here" paths: the personalised quiz and the deals rail. */}
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
      </div>

      <TrustStrip products={products} />

      {isLoading ? (
        <LoadingSkeleton />
      ) : noResults ? (
        <div className="px-5 max-w-lg mx-auto text-center py-16">
          <p className="text-sm font-bold" style={{ color: 'var(--color-text)', fontFamily: 'var(--font-display)' }}>Nothing matches those filters</p>
          <p className="text-xs mt-1.5" style={{ color: 'var(--color-muted)' }}>Try removing a dietary filter.</p>
          <button onClick={() => setFilters([])} className="mt-5 px-5 py-2.5 rounded-xl text-xs font-bold active:scale-95 transition-transform" style={{ background: 'var(--color-accent)', color: 'var(--color-bg)', fontFamily: 'var(--font-display)' }}>
            Clear filters
          </button>
        </div>
      ) : (
        <>
          {availableDietary.length > 0 && (
            <div className="pb-1">
              <ShopFilterBar tags={availableDietary} active={filters} onToggle={toggleFilter} onClear={() => setFilters([])} />
            </div>
          )}
          <ShopCategoryNav categories={navCategories} />
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
        </>
      )}
      </main>

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
          checkoutState={state}
          partnerCode={partnerCode}
          onPartnerCode={setPartnerCode}
          onCheckout={() => checkout(resolved, 'basket', partnerCode?.code ?? null)}
          onClose={closeDrawer}
        />
      )}
    </div>
  )
}
