'use client'

import { useEffect, useState, type ReactNode } from 'react'
import type { ShopCategory } from '@/lib/shop/categories'
import { Chip } from '@/components/storefront'


interface Props {
  categories: ShopCategory[]
  /**
   * The search box and the filter row, rendered above the chips inside this same
   * sticky container. They live here rather than in sticky bars of their own
   * because each extra one costs a band of a 360px viewport before any product
   * is visible — and because this is the order the page reads in: what are you
   * looking for, how do you narrow it, where do you jump to.
   */
}

/**
 * Sticky category jump-nav. Chips scroll to each section and highlight the one
 * you're in. Plain sticky (the shop page has no transformed/clipped ancestor),
 * so no portal is needed here.
 *
 * Also the shop's one sticky bar: it hosts the search input and the filter row
 * above the chips. With a search running there are no shelves to jump to, so the
 */
export function ShopCategoryNav({ categories }: Props) {
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

  // No shelves to jump to, no bar.
  if (categories.length === 0) return null

  return (
    /*
      Only the category row is sticky now, and it is the ONLY pill row on the
      screen.

      Search and filters used to ride inside this bar, which put two visually
      identical rows of pills directly on top of each other — one narrowing the
      catalogue, one jumping within it — with nothing but their contents to say
      which was which. They are now separated by placement: search and filters
      sit in the page above, scroll away with it, and are a field and a button;
      this is a pill row and it is the thing that stays.

      No blur, no translucency: the storefront has no ground behind this to
      refract, so `backdrop-filter` here was grey haze over a flat colour. An
      opaque bar and one hairline is what actually divides two sections.
    */
    <nav
      aria-label="Shop categories"
      className="sticky top-0 z-30"
      style={{ background: 'var(--bg)', borderBottom: '1px solid var(--line)' }}
    >
      {categories.length > 0 && (
        <div
          className="sf-scroll-row flex"
          style={{ gap: 'var(--space-2)', padding: 'var(--space-3) var(--space-4)' }}
        >
          {categories.map((c) => (
            <Chip key={c.slug} selected={activeSlug === c.slug} onClick={() => go(c.slug)}>
              {c.category}
            </Chip>
          ))}
        </div>
      )}
    </nav>
  )
}
