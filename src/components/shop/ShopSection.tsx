'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import type { CatalogueProduct } from '@/lib/catalogue/types'
import type { ShopCategory } from '@/lib/shop/categories'
import { selectShopAxes } from '@/lib/stack-stats'
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
}

/**
 * One shop category as a horizontal swipe deck of product cards. The cards
 * share a set of stat axes (derived from the section's own products) so
 * swiping compares them like top-trumps within the category. Cards deal in as
 * the shelf scrolls into view; desktop gets scroll arrows.
 */
export function ShopSection({ section, onExpand, tone = 'default', subtitle }: Props) {
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
            className="text-2xl font-black tracking-tight flex items-center gap-1.5"
            style={{ fontFamily: 'var(--font-display)', color: tone === 'deal' ? 'var(--color-accent)' : 'var(--color-text)' }}
          >
            {tone === 'deal' && <span aria-hidden>⚡</span>}
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

      <div className="relative group">
        <div
          ref={deckRef}
          className="flex gap-3 overflow-x-auto px-5 pb-1 snap-x snap-mandatory scrollbar-hide"
          style={{ WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none' }}
        >
          {section.products.map((product) => (
            <div key={product.id} data-card className="snap-center flex-shrink-0 w-[80vw] max-w-[300px]">
              <ShopProductCard product={product} axes={axes} animate={!reduced} onExpand={onExpand} />
            </div>
          ))}
        </div>

        {/* Desktop scroll arrows — only where there's more than one card */}
        {section.products.length > 1 && (
          <>
            <button
              onClick={() => scrollBy(-1)}
              aria-label={`Scroll ${section.category} left`}
              className="hidden md:flex absolute left-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity active:scale-90"
              style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border-2)', boxShadow: '0 6px 18px -8px rgba(0,0,0,0.6)' }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--color-text)' }}><path d="M15 18l-6-6 6-6" /></svg>
            </button>
            <button
              onClick={() => scrollBy(1)}
              aria-label={`Scroll ${section.category} right`}
              className="hidden md:flex absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity active:scale-90"
              style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border-2)', boxShadow: '0 6px 18px -8px rgba(0,0,0,0.6)' }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--color-text)' }}><path d="M9 18l6-6-6-6" /></svg>
            </button>
          </>
        )}
      </div>
    </section>
  )
}
