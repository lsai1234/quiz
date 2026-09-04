'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import confetti from 'canvas-confetti'
import type { CatalogueProduct } from '@/lib/catalogue/types'
import type { ShopQuery } from '@/lib/shop/shop-query'
import { spin, rouletteEntries, entryLabel, entryDeal, type RouletteEntry } from '@/lib/shop/roulette'
import { formatGBP } from '@/lib/stack-blueprint/pricing'
import { useBasket } from '@/lib/basket/store'
import { track } from '@/lib/analytics/events'
import { RouletteReel } from './RouletteReel'

interface Props {
  products: CatalogueProduct[]
  /** The shopper's active filters — the wheel stays inside them. */
  query: ShopQuery
  onClose: () => void
}

/** How many rows fly past on the way to the landed one. */
const STRIP_ROWS = 20

export function ShopRouletteSheet({ products, query, onClose }: Props) {
  const [mounted, setMounted] = useState(false)
  const [reduced, setReduced] = useState(false)
  const [spinning, setSpinning] = useState(false)
  const [entry, setEntry] = useState<RouletteEntry | null>(null)
  const [strip, setStrip] = useState<RouletteEntry[]>([])
  const [spinKey, setSpinKey] = useState(0)
  const [added, setAdded] = useState(false)
  const add = useBasket((s) => s.add)

  /**
   * Build the rows the reel flies past, ending on the one it lands on.
   *
   * The decoys are drawn from the SAME eligible pool as the outcome, so
   * everything that streaks past is a thing the shopper could actually have
   * been given. A reel padded with products that are out of stock or outside
   * their filters would be showing them a shelf we will not sell them.
   */
  const buildStrip = useCallback((landed: RouletteEntry): RouletteEntry[] => {
    const pool = rouletteEntries(products, query)
    if (pool.length === 0) return [landed]
    const decoy = () => pool[Math.floor(Math.random() * pool.length)]
    const rows: RouletteEntry[] = []
    for (let i = 0; i < STRIP_ROWS; i++) rows.push(decoy())
    rows.push(landed)
    // Two rows past the landing, so the window's bottom slot is never empty.
    rows.push(decoy(), decoy())
    return rows
  }, [products, query])

  const pull = useCallback(() => {
    const landed = spin(products, query, entry?.variant.id ?? null)
    if (!landed) { setEntry(null); setStrip([]); return }
    setAdded(false)
    setEntry(landed)
    setStrip(buildStrip(landed))
    setSpinning(true)
    setSpinKey((k) => k + 1)
  }, [products, query, entry, buildStrip])

  /**
   * The reel has arrived. Everything that is a REWARD rather than a mechanism
   * happens here — the announcement, the confetti, the analytics — so none of
   * it fires while the thing is still moving.
   */
  const handleSettled = useCallback(() => {
    setSpinning(false)
    setEntry((landed) => {
      if (landed) {
        track('shop_roulette_spin', { id: landed.product.id, variant: landed.variant.id })
        void confetti({ particleCount: 70, spread: 72, startVelocity: 34, origin: { y: 0.62 }, disableForReducedMotion: true })
      }
      return landed
    })
  }, [])

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
   * One pull on open — nobody opens this to look at a still reel.
   *
   * The reel owns its own animation frame and cancels it on unmount, so unlike
   * the timer-based version this replaced there is nothing here to tear down
   * and nothing a development remount can leave running. That bug — a ref that
   * survived the remount while the timers were cleared, so the wheel span
   * forever — is not reachable from this shape.
   */
  useEffect(() => {
    pull()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const addEntry = () => {
    if (!entry || !entry.variant.available) return
    add(entry.product.id, entry.variant.id, 1)
    track('add_to_basket', { id: entry.product.id, source: 'roulette', price: entry.variant.price })
    setAdded(true)
  }

  const deal = entry && !spinning ? entryDeal(entry) : { onDeal: false, pct: 0 }

  const sheet = (
    /*
      `storefront` on the portal root, not just on the shell.

      The token layer's global transition, its focus ring and its type roles are
      all scoped to `.storefront` so they cannot reach the quiz or the hubs. A
      sheet renders through `createPortal` into `document.body`, which is
      OUTSIDE that scope — so without this class every control in every sheet
      lost its focus ring and its 150ms transition, silently, while looking
      almost right.
    */
    <div className="storefront fixed inset-0 z-50 flex flex-col justify-end" role="dialog" aria-modal="true" aria-label="Flavour roulette">
      <div
        aria-hidden
        onClick={onClose}
        className="absolute inset-0 w-full h-full"
        style={{ background: 'color-mix(in srgb, var(--bg) 72%, transparent)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)' }}
      />

      <div
        className="relative w-full max-w-lg mx-auto rounded-t-3xl flex flex-col"
        style={{ background: 'var(--surface)', borderTop: '1px solid var(--line)' }}
      >
        <header className="flex items-center justify-between gap-3 px-5 pt-4 pb-3" style={{ borderBottom: '1px solid var(--line)' }}>
          <h2 className="text-base font-medium" style={{ color: 'var(--text)' }}>
            Flavour roulette
          </h2>
          <button
            onClick={onClose}
            aria-label="Close roulette"
            className="w-8 h-8 rounded-lg flex items-center justify-center active:scale-90 transition-transform"
            style={{ color: 'var(--text-dim)', background: 'var(--surface-hi)' }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden>
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </header>

        <div className="px-1 pt-5 pb-4 min-h-[15rem] flex flex-col justify-center">
          {strip.length > 0 ? (
            <>
              <RouletteReel
                strip={strip}
                landedIndex={Math.max(0, strip.length - 3)}
                spinKey={spinKey}
                reduced={reduced}
                onSettled={handleSettled}
              />

              {/*
                The price sits under the reel rather than in it, and only once
                the reel has stopped. A price attached to a row that is still
                moving is a number nobody can read and half of them are not the
                one being offered.
              */}
              <div className="h-7 mt-3 text-center">
                {entry && !spinning && (
                  <p className="text-sm font-medium tabular-nums" style={{ color: 'var(--text-dim)' }}>
                    {formatGBP(entry.variant.price)}
                    {deal.onDeal && (
                      <span className="ml-2" style={{ color: 'var(--accent)' }}>−{deal.pct}%</span>
                    )}
                  </p>
                )}
              </div>
            </>
          ) : (
            <p className="text-sm text-center px-4" style={{ color: 'var(--text-dim)' }}>
              Nothing to spin for inside your filters. Try clearing one.
            </p>
          )}

          <p role="status" aria-live="polite" className="sr-only">
            {entry && !spinning ? `Landed on ${entry.product.title}, ${entryLabel(entry)}, ${formatGBP(entry.variant.price)}` : ''}
          </p>
        </div>

        <footer className="flex gap-2 px-5 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]" style={{ borderTop: '1px solid var(--line)' }}>
          <button
            onClick={pull}
            disabled={spinning}
            className="px-4 py-3 rounded-xl text-xs font-medium active:scale-95 transition-transform disabled:opacity-40"
            style={{ color: 'var(--text-dim)', background: 'var(--surface-hi)' }}
          >
            {spinning ? 'Spinning…' : 'Spin again'}
          </button>
          <button
            onClick={addEntry}
            disabled={!entry || spinning}
            className="flex-1 py-3 rounded-xl text-sm font-medium active:scale-[0.98] transition-transform disabled:opacity-40"
            style={{
              background: added ? 'color-mix(in srgb, var(--accent) 14%, transparent)' : 'var(--accent)',
              color: added ? 'var(--accent)' : 'var(--bg)' }}
          >
            {/*
              Never the landed price while the reel is still moving. `entry` is
              set the moment the pull is decided — that is what the reel is
              animating towards — so a label read straight off it announced the
              result in the footer several seconds before the reveal, which is
              the one thing a reveal cannot survive.
            */}
            {added ? 'Added' : spinning ? 'Spinning…' : entry ? `Add for ${formatGBP(entry.variant.price)}` : 'Add'}
          </button>
        </footer>
      </div>
    </div>
  )

  return mounted ? createPortal(sheet, document.body) : null
}
