'use client'

import Link from 'next/link'
import { CHRGDLogo } from '@/components/brand/CHRGDLogo'
import { useBasket } from '@/lib/basket/store'

/**
 * The shop's top bar, for the pages that are not the shop.
 *
 * `/product/[handle]` and `/guide/[slug]` are storefront pages without the
 * shell, so they have no basket drawer to open. Rather than give each of them a
 * second, thinner basket, the button is a LINK to `/shop#basket` — the shell
 * reads that hash on arrival, opens the real drawer, and clears the hash so a
 * refresh does not re-open it.
 *
 * Extracted because the product page and this one had the same twenty lines of
 * inline style, and a third copy is where that stops being a coincidence.
 *
 * `count` is passed in where the page can work out the real one. The product
 * page can: it has the catalogue, so it counts the lines the basket will
 * actually CHARGE for, excluding free and founder-priced ones. The guide page
 * cannot, and falls back to raw quantity rather than fetching the whole
 * catalogue to render a number in a corner. The drawer always shows the real
 * figure either way.
 */
export function ShopPageHeader({ count: charged }: { count?: number }) {
  const lines = useBasket((s) => s.lines)
  const count = charged ?? lines.reduce((n, l) => n + l.quantity, 0)

  return (
    <header
      className="flex items-center justify-between"
      style={{ padding: 'var(--space-6) var(--space-4) var(--space-2)' }}
    >
      <Link href="/" aria-label="getCHRGD home" data-interactive>
        <CHRGDLogo markSize={22} wordClassName="text-lg" />
      </Link>

      <Link
        href="/shop#basket"
        data-interactive
        className="sf-button inline-flex items-center justify-center"
        style={{
          minHeight: 36, padding: '0 var(--space-3)', gap: 'var(--space-2)',
          borderRadius: 'var(--r-control)', background: 'transparent', color: 'var(--text-dim)',
          fontSize: 'var(--meta-size)', fontWeight: 'var(--weight-medium)',
          ['--sf-hover' as string]: 'var(--surface-hi)',
          ['--sf-active' as string]: 'var(--surface-hi)',
        }}
        aria-label={`Open basket, ${count} item${count !== 1 ? 's' : ''}`}
      >
        Basket
        {count > 0 && <span className="sf-tnum" style={{ color: 'var(--text)' }}>{count}</span>}
      </Link>
    </header>
  )
}
