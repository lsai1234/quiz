'use client'

import { useEffect, useRef, useState } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import type { CatalogueProduct } from '@/lib/catalogue/types'
import type { ShopBundleView } from '@/hooks/useShopBundles'
import { ShopBundleCard } from './ShopBundleCard'

gsap.registerPlugin(ScrollTrigger)

/** Roughly one card + gap — how far a desktop arrow scrolls the shelf. */
const CARD_STEP = 316

interface Props {
  bundles: ShopBundleView[]
  products: CatalogueProduct[]
}

/**
 * The prebuilt-bundles rail — the top shelf of the shop, above Deals. Same
 * swipe-deck + desktop-arrows language as a product section, but with bundle
 * cards that link out to each bundle's landing page.
 */
export function ShopBundlesRow({ bundles, products }: Props) {
  const [reduced, setReduced] = useState(false)
  const deckRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setReduced(window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  }, [])

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

  const scrollBy = (dir: 1 | -1) =>
    deckRef.current?.scrollBy({ left: dir * CARD_STEP, behavior: reduced ? 'auto' : 'smooth' })

  if (bundles.length === 0) return null

  return (
    <section id="shop-cat-bundles" className="scroll-mt-24 pt-8">
      <div className="px-5 max-w-lg mx-auto mb-3 flex items-baseline justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-black tracking-tight leading-[1.05]" style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-fluid-h2)', color: 'var(--color-accent)' }}>
            Bundles
          </h2>
          <p className="text-[11px] font-semibold mt-0.5" style={{ color: 'var(--color-accent)' }}>
            Prebuilt stacks — each with a matching workout
          </p>
        </div>
        <span className="text-[11px] font-semibold flex-shrink-0" style={{ color: 'var(--color-muted)' }}>
          {bundles.length} bundle{bundles.length !== 1 ? 's' : ''}
        </span>
      </div>

      <div className="relative group">
        <div
          ref={deckRef}
          className="flex gap-3 overflow-x-auto px-5 pb-1 snap-x snap-mandatory scrollbar-hide"
          style={{ WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none' }}
        >
          {bundles.map((view) => (
            <div key={view.bundle.slug} data-card className="snap-center flex-shrink-0 w-[80vw] max-w-[300px]">
              <ShopBundleCard view={view} products={products} />
            </div>
          ))}
        </div>

        {bundles.length > 1 && (
          <>
            <button
              onClick={() => scrollBy(-1)}
              aria-label="Scroll bundles left"
              className="hidden md:flex absolute left-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity active:scale-90"
              style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border-2)', boxShadow: '0 6px 18px -8px rgba(0,0,0,0.6)' }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--color-text)' }}><path d="M15 18l-6-6 6-6" /></svg>
            </button>
            <button
              onClick={() => scrollBy(1)}
              aria-label="Scroll bundles right"
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
