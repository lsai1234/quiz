'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import type { StackSlotEntry } from '@/lib/stack-blueprint'
import type { CatalogueProduct } from '@/lib/catalogue/types'
import type { PlanType } from '@/lib/store'
import type { StatAxis } from '@/lib/stack-stats'
import { getSubscriptionProduct } from '@/lib/stack-blueprint/pricing'
import { StatCard } from './StatCard'

gsap.registerPlugin(ScrollTrigger)

const ACCENT = '#00D4FF'

interface Props {
  slots: StackSlotEntry[]
  products: CatalogueProduct[]
  planType: PlanType
  axes: StatAxis[]
  onChangeProduct?: (slotId: string) => void
  onChangeVariant?: (slotId: string, variantId: string) => void
  onRemove?: (slotId: string) => void
  /** Optional trailing card (the upgrades card) shown after the product cards. */
  trailing?: ReactNode
}

/**
 * A horizontal, snap-scrolling deck of top-trumps stat cards — one card per
 * product, with an optional trailing card for upgrades. This is what keeps the
 * stack section short: N products cost one viewport of height, not N.
 */
export function StackDeck({ slots, products, planType, axes, onChangeProduct, onChangeVariant, onRemove, trailing }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [active, setActive] = useState(0)
  const [reduced, setReduced] = useState(false)

  useEffect(() => {
    setReduced(window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  }, [])

  const total = slots.length + (trailing ? 1 : 0)

  // Deal-in: the cards stagger up into place as the deck scrolls into view,
  // like a hand being dealt. Runs once; cards added later (a booster) just
  // appear. Reduced-motion leaves them in place.
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const root = scrollRef.current
    if (!root) return
    const cards = root.querySelectorAll('[data-card]')
    if (cards.length === 0) return
    // Scale-up only (no translate): scaling down stays inside the box, so it
    // can't trip the horizontal scroller's vertical overflow.
    const anim = gsap.fromTo(
      cards,
      { opacity: 0, scale: 0.9 },
      {
        opacity: 1, scale: 1,
        duration: 0.5, ease: 'power3.out', stagger: 0.07,
        scrollTrigger: { trigger: root, start: 'top 85%', once: true },
      },
    )
    return () => { anim.scrollTrigger?.kill(); anim.kill() }
    // Intentionally mount-only — re-running would re-hide already-dealt cards.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Track the centred card for the position dots.
  useEffect(() => {
    const root = scrollRef.current
    if (!root) return
    let frame = 0
    const compute = () => {
      frame = 0
      const center = root.scrollLeft + root.clientWidth / 2
      let best = 0
      let bestDist = Infinity
      root.querySelectorAll<HTMLElement>('[data-card]').forEach((el, i) => {
        const c = el.offsetLeft + el.offsetWidth / 2
        const d = Math.abs(c - center)
        if (d < bestDist) { bestDist = d; best = i }
      })
      setActive(best)
    }
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(compute) }
    compute()
    root.addEventListener('scroll', onScroll, { passive: true })
    return () => { if (frame) cancelAnimationFrame(frame); root.removeEventListener('scroll', onScroll) }
  }, [total])

  return (
    <div>
      <div
        ref={scrollRef}
        className="flex gap-3 overflow-x-auto px-5 pb-2 max-w-lg mx-auto snap-x snap-mandatory"
        style={{ scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' }}
      >
        {slots.map((slot) => {
          const product = products.find((p) => p.id === slot.selectedProductId)
          const subscriptionProduct = product ? getSubscriptionProduct(product, products) : undefined
          return (
            <div key={slot.slotId} data-card className="snap-center flex-shrink-0 w-[80vw] max-w-[300px]">
              <StatCard
                slot={slot}
                product={product}
                planType={planType}
                subscriptionProduct={subscriptionProduct}
                axes={axes}
                animate={!reduced}
                onChangeProduct={onChangeProduct}
                onChangeVariant={onChangeVariant}
                onRemove={onRemove}
              />
            </div>
          )
        })}
        {trailing && (
          <div data-card className="snap-center flex-shrink-0 w-[80vw] max-w-[300px]">
            {trailing}
          </div>
        )}
      </div>

      {/* Position dots */}
      {total > 1 && (
        <div className="flex justify-center items-center gap-1.5 mt-2.5">
          {Array.from({ length: total }).map((_, i) => (
            <span
              key={i}
              className="rounded-full transition-all"
              style={{
                width: i === active ? 18 : 6,
                height: 6,
                background: i === active ? ACCENT : 'var(--color-border-2)',
              }}
            />
          ))}
        </div>
      )}
    </div>
  )
}
