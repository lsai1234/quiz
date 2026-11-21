'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { CHRGDLogo } from '@/components/brand/CHRGDLogo'
import { Icon } from '@/components/ui/Icon'

interface Props {
  /** Items in the basket that will be charged for. */
  count: number
  /**
   * The shop opens its own drawer. Every other storefront page has no drawer,
   * so without this the basket is a link to `/shop#basket`, which opens the
   * real one (see `ShopPageHeader`).
   */
  onOpenBasket?: () => void
  /** On the shop: takes you to its search box. Absent elsewhere. */
  onSearch?: () => void
}

/**
 * The storefront's top bar: brand, the two places (the shop and the quiz), and
 * search and basket as icons.
 *
 * Sticky glass — the one blurred surface on the shop, and it has content
 * scrolling under it to blur. Below 960px the places drop out: the shop is
 * where you are and the quiz has its own strip at the top of it.
 *
 * The basket is an icon with its count on the corner rather than the word
 * "Basket" and a number; the count pops when it goes up, so an add anywhere on
 * the page is acknowledged where people look for it.
 */
export function ShopTopBar({ count, onOpenBasket, onSearch }: Props) {
  const path = usePathname()
  const onShop = path === '/' || path === '/shop'

  const before = useRef(count)
  const [bump, setBump] = useState(false)
  useEffect(() => {
    const rose = count > before.current
    before.current = count
    if (!rose) return
    setBump(true)
    const t = setTimeout(() => setBump(false), 520)
    return () => clearTimeout(t)
  }, [count])

  const label = `Open basket, ${count} item${count !== 1 ? 's' : ''}`
  const bag = (
    <>
      <Icon name="bag" size={20} />
      {count > 0 && (
        <span className="sf-bag-count" data-bump={bump} aria-hidden>
          {count > 99 ? '99+' : count}
        </span>
      )}
    </>
  )

  return (
    <header className="sf-hdr">
      <div className="sf-wrap sf-hdr-in">
        <Link href="/" className="sf-hdr-brand" aria-label="getCHRGD home" data-interactive>
          <CHRGDLogo markSize={22} wordClassName="text-[19px]" />
        </Link>

        <nav className="sf-hdr-nav" aria-label="Main">
          <Link href="/" aria-current={onShop ? 'page' : undefined}>Shop</Link>
          <Link href="/quiz">The quiz</Link>
        </nav>

        {onSearch && (
          <button type="button" className="sf-icon-button" aria-label="Search the shop" onClick={onSearch}>
            <Icon name="search" size={20} />
          </button>
        )}

        {onOpenBasket ? (
          <button type="button" className="sf-icon-button" aria-label={label} onClick={onOpenBasket} data-interactive>
            {bag}
          </button>
        ) : (
          <Link href="/shop#basket" className="sf-icon-button" aria-label={label} data-interactive>
            {bag}
          </Link>
        )}
      </div>
    </header>
  )
}
