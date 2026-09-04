'use client'

import Link from 'next/link'
import { CHRGDLogo } from '@/components/brand/CHRGDLogo'
import { Button } from '@/components/storefront'

interface Props {
  count: number
  onOpenBasket: () => void
}

/** Shop top bar: the CHRGD wordmark and a live basket button. */
export function ShopHeader({ count, onOpenBasket }: Props) {

  return (
    <header
      className="flex items-center justify-between"
      style={{ padding: 'var(--space-6) var(--space-4) var(--space-2)' }}
    >
      <Link href="/" aria-label="getCHRGD home" data-interactive>
        <CHRGDLogo markSize={22} wordClassName="text-lg" />
      </Link>

      {/*
        The basket count as text, not a floating badge on a circle.

        It was a 40px circle with an absolutely positioned accent counter
        pinned to its top-right corner — one of four floating circular controls
        on the shelf, and the only one that mattered. A labelled control in the
        flow of the header cannot overlap anything.
      */}
      <Button variant="ghost" size="sm" onClick={onOpenBasket} aria-label={`Open basket, ${count} item${count !== 1 ? 's' : ''}`}>
        Basket
        {count > 0 && <span className="sf-num" style={{ color: 'var(--text)' }}>{count}</span>}
      </Button>
    </header>
  )
}
