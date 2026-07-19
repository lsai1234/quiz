'use client'

import { useMemo, useState } from 'react'
import type { CatalogueProduct } from '@/lib/catalogue/types'
import { useCatalogueProducts } from '@/hooks/useCatalogueProducts'
import { useBasket } from '@/lib/basket/store'
import { useShopCheckout } from '@/hooks/useShopCheckout'
import { resolveBasket, basketSubtotal, basketItemCount } from '@/lib/basket/helpers'
import { groupByCategory, type ShopCategory } from '@/lib/shop/categories'
import { dealsProducts, maxDealPct } from '@/lib/shop/merchandising'
import { formatGBP } from '@/lib/stack-blueprint/pricing'
import { ShopCategoryNav } from './ShopCategoryNav'
import { ShopSection } from './ShopSection'
import { ShopProductSheet } from './ShopProductSheet'
import { BasketDrawer } from './BasketDrawer'

/**
 * The shop browse experience: catalogue grouped into category swipe decks with
 * a sticky jump-nav. The detail sheet (card expand) lands in S4 and the real
 * basket drawer in S5 — for now the S1 sticky basket bar stays.
 */
export function ShopShell() {
  const { products, isLoading } = useCatalogueProducts()
  const { lines } = useBasket()
  const { state, checkout, reset } = useShopCheckout()
  const [expanded, setExpanded] = useState<CatalogueProduct | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)

  const sections = useMemo(() => groupByCategory(products), [products])
  // Deals rail — cross-category, biggest saving first — sits above the sections.
  const dealsSection = useMemo<ShopCategory | null>(() => {
    const deals = dealsProducts(products)
    return deals.length > 0 ? { category: 'Deals', slug: 'deals', products: deals } : null
  }, [products])
  const navCategories = useMemo(
    () => (dealsSection ? [dealsSection, ...sections] : sections),
    [dealsSection, sections],
  )
  const resolved = useMemo(() => resolveBasket(lines, products), [lines, products])
  const subtotal = basketSubtotal(resolved)
  const count = basketItemCount(lines)

  const openDrawer = () => { reset(); setDrawerOpen(true) }
  const closeDrawer = () => { setDrawerOpen(false); reset() }

  // Buy now: the sheet already added the item; check out and show it in the drawer.
  const handleBuyNow = () => {
    setExpanded(null)
    setDrawerOpen(true)
    checkout(resolveBasket(useBasket.getState().lines, products))
  }

  return (
    <div className="min-h-[100dvh] bg-[var(--color-bg)] text-[var(--color-text)] pb-40">
      <header className="px-5 pt-10 pb-5 max-w-lg mx-auto">
        <p className="text-[10px] font-bold tracking-[0.25em] uppercase" style={{ color: 'var(--color-accent)', fontFamily: 'var(--font-display)' }}>
          CHRGD Shop
        </p>
        <h1 className="text-4xl font-black tracking-tight mt-1" style={{ fontFamily: 'var(--font-display)' }}>
          Everything, à la carte
        </h1>
        <p className="text-sm mt-2" style={{ color: 'var(--color-text-2)' }}>
          The full range — swipe each shelf, add what you fancy.
        </p>
      </header>

      {isLoading ? (
        <p className="px-5 max-w-lg mx-auto text-sm" style={{ color: 'var(--color-muted)' }}>Loading products…</p>
      ) : (
        <>
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
            {sections.map((section) => (
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
