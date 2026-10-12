'use client'

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { productHref, type ProductSection } from '@/lib/portal/product-links'
import type { CatalogueProduct } from '@/lib/catalogue/types'

/**
 * Every product a founder can open, read once for the whole Fix-ups page.
 *
 * The passes each scan the catalogue their own way (and their routes stay as
 * they are), but three things none of those scans says are needed by several of
 * them: whether a product is on sale or still waiting for review (Fix-ups leaves
 * the waiting ones to Review), what a product the sync only knows by id is
 * called, and a product's current fields for the AI passes to fill blanks in.
 * One request for all of it, shared — not six.
 *
 * A pass used on its own, outside the page, reads it for itself.
 */

export type ProductState = 'live' | 'pending' | 'removed'

export interface IndexedProduct {
  product: CatalogueProduct
  state: ProductState
}

export interface ProductIndex {
  status: 'loading' | 'ready' | 'failed' | 'signed-out'
  byId: Map<string, IndexedProduct>
  /** Whether the shop is selling the real catalogue or the sample one. */
  source: 'real' | 'mock' | null
  message: string | null
  reload: () => void
}

const Ctx = createContext<ProductIndex | null>(null)

function useLoadIndex(enabled: boolean): ProductIndex {
  const [state, setState] = useState<Omit<ProductIndex, 'reload'>>({ status: 'loading', byId: new Map(), source: null, message: null })
  const [nonce, setNonce] = useState(0)
  const reload = useCallback(() => setNonce((n) => n + 1), [])

  useEffect(() => {
    if (!enabled) return
    let live = true
    fetch('/api/portal/products?all=1', { cache: 'no-store' })
      .then(async (res) => {
        if (!live) return
        if (res.status === 401) {
          setState((s) => ({ ...s, status: 'signed-out', message: null }))
          return
        }
        const data = (await res.json().catch(() => null)) as { products?: IndexedProduct[]; source?: string; error?: string } | null
        if (!live) return
        if (!res.ok || !data || !Array.isArray(data.products)) {
          setState((s) => ({ ...s, status: 'failed', message: data?.error ?? `The server answered with an error (HTTP ${res.status}).` }))
          return
        }
        setState({
          status: 'ready',
          byId: new Map(data.products.map((e) => [e.product.id, { product: e.product, state: e.state }])),
          source: data.source === 'real' ? 'real' : 'mock',
          message: null,
        })
      })
      .catch(() => live && setState((s) => ({ ...s, status: 'failed', message: 'Could not reach the server — check the connection.' })))
    return () => {
      live = false
    }
  }, [enabled, nonce])

  return { ...state, reload }
}

export function ProductIndexProvider({ children }: { children: ReactNode }) {
  const index = useLoadIndex(true)
  return <Ctx.Provider value={index}>{children}</Ctx.Provider>
}

/** The shared index on the Fix-ups page, or one of its own anywhere else. */
export function useProductIndex(): ProductIndex {
  const shared = useContext(Ctx)
  const own = useLoadIndex(shared === null)
  return shared ?? own
}

/** The products on sale, in the index's order. */
export function liveProducts(index: ProductIndex): CatalogueProduct[] {
  return [...index.byId.values()].filter((e) => e.state === 'live').map((e) => e.product)
}

/**
 * A product's name as a link to its page. Every product a pass names is one
 * somebody may want to look at — to check what the pass did, or to do by hand
 * what it could not.
 */
export function ProductLink({ id, section, children }: { id: string; section?: ProductSection; children: ReactNode }) {
  return (
    <Link
      href={productHref(id, section)}
      className="system-focus"
      style={{ color: 'var(--ink-1)', fontWeight: 'var(--weight-strong)', textDecoration: 'underline', textUnderlineOffset: '0.2em' }}
    >
      {children}
    </Link>
  )
}
