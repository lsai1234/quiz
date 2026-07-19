'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import type { CatalogueProduct, DietaryTag } from '@/lib/catalogue/types'
import { useCatalogueProducts } from '@/hooks/useCatalogueProducts'
import { useBasket } from '@/lib/basket/store'
import { useShopCheckout } from '@/hooks/useShopCheckout'
import { resolveBasket, basketSubtotal, basketItemCount } from '@/lib/basket/helpers'
import { groupByCategory, type ShopCategory } from '@/lib/shop/categories'
import { dealsProducts, maxDealPct } from '@/lib/shop/merchandising'
import { DIETARY_LABEL } from '@/lib/product-facts'
import { formatGBP } from '@/lib/stack-blueprint/pricing'
import { CHRGDBolt } from '@/components/brand/CHRGDLogo'
import { ShopHeader } from './ShopHeader'
import { ShopFilterBar } from './ShopFilterBar'
import { ShopCategoryNav } from './ShopCategoryNav'
import { ShopSection } from './ShopSection'
import { ShopProductSheet } from './ShopProductSheet'
import { BasketDrawer } from './BasketDrawer'

// Canonical dietary-chip order (matches the sheet's labels).
const DIETARY_ORDER = Object.keys(DIETARY_LABEL) as DietaryTag[]

function LoadingSkeleton() {
  return (
    <div className="px-5 max-w-lg mx-auto space-y-8 pt-6" aria-hidden>
      {[0, 1].map((i) => (
        <div key={i}>
          <div className="h-6 w-40 rounded-lg mb-4" style={{ background: 'var(--color-surface)' }} />
          <div className="flex gap-3">
            {[0, 1].map((j) => (
              <div key={j} className="w-[80vw] max-w-[300px] h-64 rounded-2xl flex-shrink-0" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }} />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

/**
 * The shop browse experience: a header + basket, dietary filters, a sticky
 * category jump-nav, and category swipe decks led by a Deals rail. Product
 * detail and the basket are bottom/side sheets.
 */
export function ShopShell() {
  const { products, isLoading } = useCatalogueProducts()
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

  const navCategories = dealsSection ? [dealsSection, ...filteredSections] : filteredSections
  const noResults = !isLoading && navCategories.length === 0

  const resolved = useMemo(() => resolveBasket(lines, products), [lines, products])
  const subtotal = basketSubtotal(resolved)
  const count = basketItemCount(lines)

  const openDrawer = () => { reset(); setDrawerOpen(true) }
  const closeDrawer = () => { setDrawerOpen(false); reset() }
  const toggleFilter = (tag: DietaryTag) =>
    setFilters((f) => (f.includes(tag) ? f.filter((t) => t !== tag) : [...f, tag]))

  const handleBuyNow = () => {
    setExpanded(null)
    setDrawerOpen(true)
    checkout(resolveBasket(useBasket.getState().lines, products))
  }

  return (
    <div className="min-h-[100dvh] bg-[var(--color-bg)] text-[var(--color-text)] pb-40">
      <ShopHeader count={count} onOpenBasket={openDrawer} />

      <div className="px-5 pt-2 pb-4 max-w-lg mx-auto">
        <p className="text-[10px] font-bold tracking-[0.25em] uppercase" style={{ color: 'var(--color-accent)', fontFamily: 'var(--font-display)' }}>
          The Shop
        </p>
        <h1 className="text-4xl font-black tracking-tight mt-1" style={{ fontFamily: 'var(--font-display)' }}>
          Everything, à la carte
        </h1>
        <p className="text-sm mt-2" style={{ color: 'var(--color-text-2)' }}>
          The full range — swipe each shelf, add what you fancy.
        </p>

        {/* Quiz cross-sell */}
        <Link
          href="/"
          className="mt-4 flex items-center gap-3 rounded-2xl px-4 py-3 active:scale-[0.99] transition-transform"
          style={{ background: 'color-mix(in srgb, var(--color-accent) 8%, transparent)', border: '1px solid color-mix(in srgb, var(--color-accent) 22%, transparent)' }}
        >
          <span
            className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center"
            style={{ background: 'color-mix(in srgb, var(--color-accent) 14%, transparent)' }}
            aria-hidden
          >
            <CHRGDBolt size={16} />
          </span>
          <span className="flex-1 text-xs font-semibold leading-snug" style={{ color: 'var(--color-text-2)' }}>
            Not sure where to start? <span style={{ color: 'var(--color-accent)' }}>Take the 2-minute quiz</span> for a stack built around your goals.
          </span>
          <span style={{ color: 'var(--color-accent)' }} aria-hidden>→</span>
        </Link>
      </div>

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
            {dealsSection && (
              <ShopSection
                section={dealsSection}
                tone="deal"
                subtitle={`Save up to ${maxDealPct(dealsSection.products)}%`}
                onExpand={setExpanded}
              />
            )}
            {filteredSections.map((section) => (
              <ShopSection key={section.slug} section={section} onExpand={setExpanded} />
            ))}
          </div>
        </>
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
          checkoutState={state}
          onCheckout={() => checkout(resolved)}
          onClose={closeDrawer}
        />
      )}
    </div>
  )
}
