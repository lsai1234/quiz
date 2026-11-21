'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ShopCategory } from '@/lib/shop/categories'
import { Icon } from '@/components/ui/Icon'

interface Props {
  categories: ShopCategory[]
  /** Opens the filter sheet. With it, the bar carries a Filters button once
   *  the page's own filter row has scrolled away. */
  onOpenFilters?: () => void
  /** Filters on, for the button's count. */
  filterCount?: number
}

/**
 * The shop's sticky bar: one tab per shelf, a cyan underline that slides to
 * the shelf you are on, and — once the filter row above has scrolled out of
 * sight — a Filters button at the end, so narrowing the shop is never more
 * than one tap away however far down you are.
 *
 * Tabs, not pills. The pills above it narrow what is on the page; these jump
 * within it. Different jobs, different shapes: a row of text with an underline
 * reads as navigation, a row of pills reads as choices.
 *
 * It is glass, the second blurred surface on the shop after the header: it
 * sits over shelves that scroll under it, so the blur has something to blur.
 */
export function ShopCategoryNav({ categories, onOpenFilters, filterCount = 0 }: Props) {
  const [activeSlug, setActiveSlug] = useState(categories[0]?.slug ?? '')
  const [filtersAway, setFiltersAway] = useState(false)
  const tabsRef = useRef<HTMLDivElement>(null)
  const indRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    let frame = 0
    const compute = () => {
      frame = 0
      let current = categories[0]?.slug ?? ''
      // Just under the sticky header and this bar, wherever they are tall.
      const line = (document.querySelector('.sf-hdr')?.getBoundingClientRect().bottom ?? 0) + 72
      for (const c of categories) {
        const el = document.getElementById(`shop-cat-${c.slug}`)
        if (el && el.getBoundingClientRect().top <= line) current = c.slug
      }
      setActiveSlug(current)
      const row = document.getElementById('shop-filters')
      const header = document.querySelector('.sf-hdr')?.getBoundingClientRect().bottom ?? 0
      setFiltersAway(row ? row.getBoundingClientRect().bottom < header : false)
    }
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(compute) }
    compute()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      if (frame) cancelAnimationFrame(frame)
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
  }, [categories])

  // The underline follows the active tab, and the active tab is kept in view.
  useLayoutEffect(() => {
    const tabs = tabsRef.current
    const ind = indRef.current
    const tab = tabs?.querySelector<HTMLButtonElement>('[aria-current="true"]')
    if (!tabs || !ind || !tab) return
    ind.style.width = `${Math.max(0, tab.offsetWidth - 24)}px`
    ind.style.transform = `translateX(${tab.offsetLeft + 12}px)`
    const left = tab.offsetLeft - tabs.clientWidth / 2 + tab.offsetWidth / 2
    tabs.scrollTo({ left, behavior: 'smooth' })
  }, [activeSlug, categories])

  const go = (slug: string) =>
    document.getElementById(`shop-cat-${slug}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })

  if (categories.length === 0) return null

  return (
    <nav aria-label="Shop categories" className="sf-tabbar">
      <div className="sf-tabbar-in">
        <div className="sf-tabs" ref={tabsRef}>
          {categories.map((c) => (
            <button
              key={c.slug}
              type="button"
              className="sf-tab"
              aria-current={activeSlug === c.slug ? 'true' : undefined}
              onClick={() => go(c.slug)}
            >
              {c.category}
            </button>
          ))}
          <span className="sf-tab-ind" ref={indRef} aria-hidden />
        </div>
        {onOpenFilters && filtersAway && (
          <button type="button" className="sf-button sf-button--secondary sf-button--sm sf-tabbar-filters" onClick={onOpenFilters} aria-label={filterCount > 0 ? `Open filters, ${filterCount} on` : 'Open filters'}>
            <Icon name="sliders" size={15} />
            <span className="sf-tabbar-filters-word">Filters</span>
            {filterCount > 0 && <span className="sf-count" aria-hidden>{filterCount}</span>}
          </button>
        )}
      </div>
    </nav>
  )
}
