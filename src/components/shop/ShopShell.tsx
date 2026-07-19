'use client'

import { useMemo } from 'react'
import { useCatalogueProducts } from '@/hooks/useCatalogueProducts'
import { useBasket } from '@/lib/basket/store'
import { useShopCheckout } from '@/hooks/useShopCheckout'
import { resolveBasket, basketSubtotal, basketItemCount } from '@/lib/basket/helpers'
import { groupByCategory } from '@/lib/shop/categories'
import { formatGBP } from '@/lib/stack-blueprint/pricing'
import { ShopCategoryNav } from './ShopCategoryNav'
import { ShopSection } from './ShopSection'

/**
 * The shop browse experience: catalogue grouped into category swipe decks with
 * a sticky jump-nav. The detail sheet (card expand) lands in S4 and the real
 * basket drawer in S5 — for now the S1 sticky basket bar stays.
 */
export function ShopShell() {
  const { products, isLoading } = useCatalogueProducts()
  const { lines, setQty, remove, clear } = useBasket()
  const { state, checkout } = useShopCheckout()

  const sections = useMemo(() => groupByCategory(products), [products])
  const resolved = useMemo(() => resolveBasket(lines, products), [lines, products])
  const subtotal = basketSubtotal(resolved)
  const count = basketItemCount(lines)

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
          <ShopCategoryNav categories={sections} />
          <div className="pb-4">
            {sections.map((section) => (
              <ShopSection key={section.slug} section={section} />
            ))}
          </div>
        </>
      )}

      {/* S1 sticky basket bar — S5 replaces with the real drawer */}
      {count > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-40 px-4 pb-[max(0.9rem,env(safe-area-inset-bottom))] pt-6" style={{ background: 'linear-gradient(to top, var(--color-bg) 55%, transparent)' }}>
          <div className="max-w-lg mx-auto rounded-2xl p-3" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border-2)', boxShadow: '0 10px 34px -10px rgba(0,0,0,0.7)' }}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold" style={{ fontFamily: 'var(--font-display)' }}>{count} item{count !== 1 ? 's' : ''} · {formatGBP(subtotal)}</span>
              <button onClick={clear} className="text-[11px] underline" style={{ color: 'var(--color-muted)' }}>Clear</button>
            </div>
            <div className="space-y-1.5 mb-2 max-h-40 overflow-y-auto">
              {resolved.map((l) => (
                <div key={`${l.product.id}:${l.variant.id}`} className="flex items-center gap-2 text-xs">
                  <span className="flex-1 min-w-0 truncate" style={{ color: 'var(--color-text-2)' }}>{l.product.title}</span>
                  <button onClick={() => setQty(l.product.id, l.variant.id, l.quantity - 1)} className="w-6 h-6 rounded-md" style={{ border: '1px solid var(--color-border-2)' }}>–</button>
                  <span className="w-5 text-center">{l.quantity}</span>
                  <button onClick={() => setQty(l.product.id, l.variant.id, l.quantity + 1)} className="w-6 h-6 rounded-md" style={{ border: '1px solid var(--color-border-2)' }}>+</button>
                  <button onClick={() => remove(l.product.id, l.variant.id)} className="text-[11px]" style={{ color: 'var(--color-muted)' }}>✕</button>
                </div>
              ))}
            </div>
            <button
              onClick={() => checkout(resolved)}
              disabled={state.status === 'loading'}
              className="w-full py-3.5 rounded-xl text-sm font-bold active:scale-95 transition-transform disabled:opacity-60"
              style={{ background: 'var(--color-accent)', color: 'var(--color-bg)', fontFamily: 'var(--font-display)' }}
            >
              {state.status === 'loading' ? 'Building cart…' : state.status === 'success' && state.mock ? 'Mock checkout ✓' : 'Checkout →'}
            </button>
            {state.status === 'error' && <p className="text-[11px] mt-2 text-center" style={{ color: 'var(--color-red)' }}>{state.message}</p>}
          </div>
        </div>
      )}
    </div>
  )
}
