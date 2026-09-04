'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import type { CatalogueProduct } from '@/lib/catalogue/types'
import type { ShopCategory } from '@/lib/shop/categories'
import { selectShopAxes } from '@/lib/stack-stats'
import { CHRGDBolt } from '@/components/brand/CHRGDLogo'
import { ShopProductCard } from './ShopProductCard'

gsap.registerPlugin(ScrollTrigger)

/** Roughly one card + gap — how far a desktop arrow scrolls the shelf. */
const CARD_STEP = 316

interface Props {
  section: ShopCategory
  onExpand?: (product: CatalogueProduct) => void
  /** 'deal' gives the header the accent treatment (the top Deals rail). */
  tone?: 'default' | 'deal'
  /** Optional line under the section title (e.g. "Save up to 25%"). */
  subtitle?: string
  /** Products currently picked for a duel. Absent = no compare affordance. */
  compareIds?: ReadonlySet<string>
  onToggleCompare?: (product: CatalogueProduct) => void
}

/**
 * One shop category as a horizontal swipe deck of product cards. The cards
 * share a set of stat axes (derived from the section's own products) so
 * swiping compares them like top-trumps within the category. Cards deal in as
 * the shelf scrolls into view; desktop gets scroll arrows.
 */
export function ShopSection({ section, onExpand, tone = 'default', subtitle, compareIds, onToggleCompare }: Props) {
  const [reduced, setReduced] = useState(false)
  const deckRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setReduced(window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  }, [])

  // Deal-in: cards fade + scale up as the shelf scrolls into view. Mount-only;
  // reduced-motion (checked synchronously) leaves them in place.
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const el = deckRef.current
    if (!el) return
    const cards = el.querySelectorAll('[data-card]')
    if (cards.length === 0) return
    const anim = gsap.fromTo(
      cards,
      { opacity: 0, scale: 0.92 },
      {
        opacity: 1, scale: 1, duration: 0.45, ease: 'power3.out', stagger: 0.06,
        scrollTrigger: { trigger: el, start: 'top 88%', once: true },
      },
    )
    return () => { anim.scrollTrigger?.kill(); anim.kill() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const axes = useMemo(() => selectShopAxes(section.products), [section.products])
  const scrollBy = (dir: 1 | -1) =>
    deckRef.current?.scrollBy({ left: dir * CARD_STEP, behavior: reduced ? 'auto' : 'smooth' })

  return (
    <section id={`shop-cat-${section.slug}`} className="scroll-mt-24 pt-8">
      <div className="px-5 max-w-lg mx-auto mb-3 flex items-baseline justify-between gap-3">
        <div className="min-w-0">
          <h2
            className="font-black tracking-tight leading-[1.05] flex items-center gap-1.5"
            style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-fluid-h2)', color: tone === 'deal' ? 'var(--color-accent)' : 'var(--color-text)' }}
          >
            {tone === 'deal' && <CHRGDBolt size={22} color="currentColor" className="shrink-0" />}
            {section.category}
          </h2>
          {subtitle && (
            <p className="text-[11px] font-semibold mt-0.5" style={{ color: 'var(--color-accent)' }}>{subtitle}</p>
          )}
        </div>
        <span className="text-[11px] font-semibold flex-shrink-0" style={{ color: 'var(--color-muted)' }}>
          {section.products.length} product{section.products.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/*
        A grid, not a deck.

        These were horizontally scrolling carousels: one card and a sliver
        visible at a time, the rest of the category behind a gesture nobody
        makes, and the products past position three effectively unmerchandised.
        Two columns show six products in the same vertical space and make the
        section scannable, which is what a category page is for. The cards got
        short enough to make this work when they stopped carrying five claims
        each — see `ShopProductCard`.
      */}
      <div className="px-5 max-w-lg mx-auto grid grid-cols-2 gap-3">
        {section.products.map((product) => (
          <div key={product.id} data-card>
            <ShopProductCard
              product={product}
              onExpand={onExpand}
              compareSelected={compareIds?.has(product.id)}
              onToggleCompare={onToggleCompare}
            />
          </div>
        ))}
      </div>
    </section>
  )
}
