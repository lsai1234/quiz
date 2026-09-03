'use client'

import { useEffect, useState, type ReactNode } from 'react'
import type { ShopCategory } from '@/lib/shop/categories'

const ACCENT = '#00D4FF'

interface Props {
  categories: ShopCategory[]
  /**
   * The search box and the filter row, rendered above the chips inside this same
   * sticky container. They live here rather than in sticky bars of their own
   * because each extra one costs a band of a 360px viewport before any product
   * is visible — and because this is the order the page reads in: what are you
   * looking for, how do you narrow it, where do you jump to.
   */
  controls?: ReactNode
}

/**
 * Sticky category jump-nav. Chips scroll to each section and highlight the one
 * you're in. Plain sticky (the shop page has no transformed/clipped ancestor),
 * so no portal is needed here.
 *
 * Also the shop's one sticky bar: it hosts the search input and the filter row
 * above the chips. With a search running there are no shelves to jump to, so the
 * caller passes no categories and only the controls render.
 */
export function ShopCategoryNav({ categories, controls }: Props) {
  const [activeSlug, setActiveSlug] = useState(categories[0]?.slug ?? '')

  useEffect(() => {
    let frame = 0
    const compute = () => {
      frame = 0
      let current = categories[0]?.slug ?? ''
      for (const c of categories) {
        const el = document.getElementById(`shop-cat-${c.slug}`)
        if (el && el.getBoundingClientRect().top <= 120) current = c.slug
      }
      setActiveSlug(current)
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

  const go = (slug: string) =>
    document.getElementById(`shop-cat-${slug}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })

  // Nothing to render only when there is neither a shelf to jump to nor any
  // controls to host — otherwise the bar stays and carries whichever it has.
  if (categories.length === 0 && !controls) return null

  return (
    <nav
      aria-label="Shop search and categories"
      className="sticky top-0 z-30"
      style={{ background: 'color-mix(in srgb, var(--color-bg) 82%, transparent)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', borderBottom: '1px solid var(--color-border)' }}
    >
      {controls}
      {categories.length > 0 && (
      <div className="flex gap-2 overflow-x-auto px-5 py-3 scrollbar-hide" style={{ scrollbarWidth: 'none' }}>
        {categories.map((c) => {
          const active = activeSlug === c.slug
          return (
            <button
              key={c.slug}
              onClick={() => go(c.slug)}
              className="flex-shrink-0 px-3.5 py-1.5 rounded-full text-xs font-bold tracking-wide transition-all active:scale-95"
              style={{
                fontFamily: 'var(--font-display)',
                color: active ? 'var(--color-bg)' : 'var(--color-text-2)',
                background: active ? ACCENT : 'var(--color-surface)',
                border: active ? '1px solid transparent' : '1px solid var(--color-border-2)',
              }}
            >
              {c.category}
            </button>
          )
        })}
      </div>
      )}
    </nav>
  )
}
