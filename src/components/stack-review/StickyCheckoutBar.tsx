'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import type { RefObject } from 'react'
import type { StackPricing } from '@/lib/stack-blueprint/pricing'
import { formatGBP } from '@/lib/stack-blueprint/pricing'
import type { PlanType } from '@/lib/store'

interface Props {
  pricing: StackPricing
  planType: PlanType
  productCount: number
  isLoading?: boolean
  onCheckout?: () => void
  /** The stack/bundle section the bar belongs to — only shown while it's on screen. */
  sectionRef: RefObject<HTMLElement | null>
  /** The full price summary — the bar hides while it's visible so the CTA never doubles up. */
  summaryRef: RefObject<HTMLElement | null>
}

/**
 * Always-in-reach checkout: a slim bar fixed to the bottom of the viewport with
 * the running total and the checkout CTA, so a first-time visitor never has to
 * hunt for where to buy. Tapping the price scrolls to the full breakdown.
 *
 * Rendered through a portal to document.body — both pages that use it sit
 * inside animated (transformed) wrappers, which would otherwise make
 * `position: fixed` positioned relative to that wrapper instead of the
 * viewport. z-40 keeps it under the z-50 modals/journeys.
 */
export function StickyCheckoutBar({
  pricing, planType, productCount, isLoading = false, onCheckout, sectionRef, summaryRef,
}: Props) {
  const [mounted, setMounted] = useState(false)
  const [sectionVisible, setSectionVisible] = useState(false)
  const [summaryVisible, setSummaryVisible] = useState(false)

  useEffect(() => { setMounted(true) }, [])

  useEffect(() => {
    const section = sectionRef.current
    const summary = summaryRef.current
    if (!section || !summary) return
    const sectionObs = new IntersectionObserver(([e]) => setSectionVisible(e.isIntersecting))
    const summaryObs = new IntersectionObserver(([e]) => setSummaryVisible(e.isIntersecting))
    sectionObs.observe(section)
    summaryObs.observe(summary)
    return () => { sectionObs.disconnect(); summaryObs.disconnect() }
  }, [sectionRef, summaryRef, mounted])

  const canSubscribe = pricing.subscriptionItemCount > 0 && pricing.subscriptionMinOrderMet
  const isSub = planType === 'subscription' && canSubscribe
  const show = mounted && sectionVisible && !summaryVisible

  if (!mounted) return null

  return createPortal(
    <div
      className="fixed inset-x-0 bottom-0 z-40 transition-transform duration-300"
      style={{
        transform: show ? 'translateY(0)' : 'translateY(110%)',
        background: 'color-mix(in srgb, var(--color-bg) 88%, transparent)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        borderTop: '1px solid var(--color-border)',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      <div className="max-w-lg mx-auto px-5 py-3 flex items-center justify-between gap-3">
        {/* Total — tapping shows the full breakdown */}
        <button
          onClick={() => summaryRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
          className="text-left min-w-0 active:opacity-70 transition-opacity"
        >
          <p className="text-[10px] font-semibold truncate" style={{ color: 'var(--color-muted)' }}>
            {productCount} {productCount === 1 ? 'product' : 'products'} · see breakdown
          </p>
          <p
            className="text-lg font-black leading-tight"
            style={{ fontFamily: 'var(--font-display)', color: 'var(--color-text)' }}
          >
            {isSub ? `${formatGBP(pricing.subscriptionTotal)}/mo` : formatGBP(pricing.oneOffTotal)}
          </p>
        </button>

        <button
          onClick={onCheckout}
          disabled={isLoading}
          className="flex-shrink-0 px-6 py-3.5 rounded-2xl text-sm font-bold tracking-wide bg-[var(--color-accent)] text-[var(--color-bg)] active:scale-95 transition-all disabled:opacity-60 disabled:cursor-wait"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          {isLoading ? 'One moment…' : isSub ? 'Subscribe →' : 'Checkout →'}
        </button>
      </div>
    </div>,
    document.body,
  )
}
