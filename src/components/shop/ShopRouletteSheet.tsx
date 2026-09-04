'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import confetti from 'canvas-confetti'
import type { CatalogueProduct } from '@/lib/catalogue/types'
import type { ShopQuery } from '@/lib/shop/shop-query'
import { spin, entryLabel, entryDeal, type RouletteEntry } from '@/lib/shop/roulette'
import { formatGBP } from '@/lib/stack-blueprint/pricing'
import { useBasket } from '@/lib/basket/store'
import { track } from '@/lib/analytics/events'
import { ProductTile } from '@/components/stack-review/ProductTile'

interface Props {
  products: CatalogueProduct[]
  /** The shopper's active filters — the wheel stays inside them. */
  query: ShopQuery
  onClose: () => void
}

/** How long the wheel pretends to think. Long enough to feel like a pull. */
const SPIN_MS = 900

/** How fast the names flick past while it spins. */
const TICK_MS = 70

export function ShopRouletteSheet({ products, query, onClose }: Props) {
  const [mounted, setMounted] = useState(false)
  const [reduced, setReduced] = useState(false)
  const [spinning, setSpinning] = useState(false)
  const [entry, setEntry] = useState<RouletteEntry | null>(null)
  const [teaser, setTeaser] = useState<RouletteEntry | null>(null)
  const [added, setAdded] = useState(false)
  const add = useBasket((s) => s.add)

  const timers = useRef<Array<ReturnType<typeof setTimeout>>>([])
  const clearTimers = () => { timers.current.forEach(clearTimeout); timers.current = [] }

  const pull = useCallback(() => {
    const landed = spin(products, query, entry?.variant.id ?? null)
    if (!landed) { setEntry(null); return }
    setAdded(false)

    // Read synchronously rather than from state: this runs from a mount effect,
    // before the effect that fills `reduced` in has had a turn.
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setEntry(landed)
      track('shop_roulette_spin', { id: landed.product.id, variant: landed.variant.id })
      return
    }

    setSpinning(true)
    setEntry(null)
    const started = Date.now()
    const tick = () => {
      if (Date.now() - started >= SPIN_MS) {
        setSpinning(false)
        setTeaser(null)
        setEntry(landed)
        track('shop_roulette_spin', { id: landed.product.id, variant: landed.variant.id })
        void confetti({ particleCount: 60, spread: 65, origin: { y: 0.7 }, disableForReducedMotion: true })
        return
      }
      // Names flicking past are decoration only — the outcome was decided before
      // the first frame, so the wheel cannot land somewhere the guardrails have
      // not already cleared.
      setTeaser(spin(products, query, null))
      timers.current.push(setTimeout(tick, TICK_MS))
    }
    tick()
  }, [products, query, entry])

  useEffect(() => { setMounted(true) }, [])
  useEffect(() => {
    setReduced(window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  }, [])
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  /*
   * One pull on open — nobody opens this to look at an empty wheel.
   *
   * The spin and its timers live in ONE effect so they are torn down together.
   * An earlier version guarded the pull with a ref and cleared the timers from a
   * different effect: React's development remount then cleared the timers while
   * the ref survived, and the wheel span forever without ever landing.
   */
  useEffect(() => {
    pull()
    return clearTimers
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const addEntry = () => {
    if (!entry || !entry.variant.available) return
    add(entry.product.id, entry.variant.id, 1)
    track('add_to_basket', { id: entry.product.id, source: 'roulette', price: entry.variant.price })
    setAdded(true)
  }

  const shown = entry ?? teaser
  const deal = entry ? entryDeal(entry) : { onDeal: false, pct: 0 }

  const sheet = (
    <div className="fixed inset-0 z-50 flex flex-col justify-end" role="dialog" aria-modal="true" aria-label="Flavour roulette">
      <div
        aria-hidden
        onClick={onClose}
        className="absolute inset-0 w-full h-full"
        style={{ background: 'color-mix(in srgb, var(--color-bg) 72%, transparent)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)' }}
      />

      <div
        className="relative w-full max-w-lg mx-auto rounded-t-3xl flex flex-col"
        style={{ background: 'var(--color-surface)', borderTop: '1px solid var(--color-border-2)' }}
      >
        <header className="flex items-center justify-between gap-3 px-5 pt-4 pb-3" style={{ borderBottom: '1px solid var(--color-border)' }}>
          <h2 className="text-base font-black" style={{ fontFamily: 'var(--font-display)', color: 'var(--color-text)' }}>
            Flavour roulette
          </h2>
          <button
            onClick={onClose}
            aria-label="Close roulette"
            className="w-8 h-8 rounded-lg flex items-center justify-center active:scale-90 transition-transform"
            style={{ color: 'var(--color-text-2)', background: 'var(--color-surface-2)' }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden>
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </header>

        <div className="px-5 py-6 min-h-[13rem] flex flex-col items-center justify-center text-center">
          {shown ? (
            <>
              <div style={{ opacity: spinning ? 0.45 : 1, transition: reduced ? 'none' : 'opacity 0.2s' }}>
                <ProductTile
                  imageUrl={shown.product.imageUrl}
                  slot={shown.product.stackSlots[0]}
                  title={shown.product.title}
                  size={64}
                />
              </div>
              <p className="text-sm font-black mt-3" style={{ color: 'var(--color-text)', fontFamily: 'var(--font-display)' }}>
                {shown.product.title}
              </p>
              <p className="text-lg font-black mt-0.5" style={{ color: 'var(--color-accent)', fontFamily: 'var(--font-display)' }}>
                {entryLabel(shown)}
              </p>

              {/* Only ever the real price of the variant it landed on. */}
              {entry && (
                <p className="text-sm font-bold mt-2 tabular-nums" style={{ color: 'var(--color-text-2)', fontFamily: 'var(--font-display)' }}>
                  {formatGBP(entry.variant.price)}
                  {deal.onDeal && (
                    <span className="ml-2" style={{ color: 'var(--color-accent)' }}>−{deal.pct}%</span>
                  )}
                </p>
              )}
            </>
          ) : (
            <p className="text-sm" style={{ color: 'var(--color-muted)' }}>
              Nothing to spin for inside your filters. Try clearing one.
            </p>
          )}

          <p role="status" aria-live="polite" className="sr-only">
            {entry ? `Landed on ${entry.product.title}, ${entryLabel(entry)}, ${formatGBP(entry.variant.price)}` : ''}
          </p>
        </div>

        <footer className="flex gap-2 px-5 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]" style={{ borderTop: '1px solid var(--color-border)' }}>
          <button
            onClick={pull}
            disabled={spinning}
            className="px-4 py-3 rounded-xl text-xs font-bold active:scale-95 transition-transform disabled:opacity-40"
            style={{ color: 'var(--color-text-2)', background: 'var(--color-surface-2)', fontFamily: 'var(--font-display)' }}
          >
            {spinning ? 'Spinning…' : 'Spin again'}
          </button>
          <button
            onClick={addEntry}
            disabled={!entry || spinning}
            className="flex-1 py-3 rounded-xl text-sm font-bold active:scale-[0.98] transition-transform disabled:opacity-40"
            style={{
              background: added ? 'color-mix(in srgb, var(--color-accent) 14%, transparent)' : 'var(--color-accent)',
              color: added ? 'var(--color-accent)' : 'var(--color-bg)',
              fontFamily: 'var(--font-display)',
            }}
          >
            {added ? 'Added' : entry ? `Add for ${formatGBP(entry.variant.price)}` : 'Add'}
          </button>
        </footer>
      </div>
    </div>
  )

  return mounted ? createPortal(sheet, document.body) : null
}
