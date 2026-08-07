'use client'

import { useEffect, useRef, useState } from 'react'
import confetti from 'canvas-confetti'
import gsap from 'gsap'
import { useQuizStore } from '@/lib/store'
import { useLocalCart } from '@/hooks/useLocalCart'
import { isLiveCatalogue } from '@/lib/data-source'
import { levelSubscriptionRate } from '@/lib/stack-blueprint/pricing'
import type { Product } from '@/lib/types'

interface Props {
  reducedMotion: boolean
}

function QtyControl({
  qty, onChange,
}: { qty: number; onChange: (n: number) => void }) {
  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => onChange(Math.max(0, qty - 1))}
        className="w-7 h-7 rounded-full bg-[#0A0A0A]/8 text-[#0A0A0A] text-sm font-bold flex items-center justify-center active:scale-90"
      >
        −
      </button>
      <span className="text-sm font-bold w-4 text-center" style={{ fontFamily: 'var(--font-display)' }}>
        {qty}
      </span>
      <button
        onClick={() => onChange(qty + 1)}
        className="w-7 h-7 rounded-full bg-[#0A0A0A]/8 text-[#0A0A0A] text-sm font-bold flex items-center justify-center active:scale-90"
      >
        +
      </button>
    </div>
  )
}

function ProductBundleCard({
  product, qty, onQtyChange, accentColor,
}: { product: Product; qty: number; onQtyChange: (n: number) => void; accentColor: string }) {
  return (
    <div className={`flex-shrink-0 w-56 bg-white rounded-2xl border border-[#0A0A0A]/6 p-4 flex flex-col gap-3 transition-opacity ${qty === 0 ? 'opacity-40' : ''}`}>
      {/* Colour accent strip */}
      <div className="w-full h-1 rounded-full" style={{ background: accentColor }} />
      <div className="flex-1">
        <p className="text-sm font-bold text-[#0A0A0A] leading-tight" style={{ fontFamily: 'var(--font-display)' }}>
          {product.name}
        </p>
        <p className="text-xs text-[#0A0A0A]/40 mt-0.5">{product.subcategory}</p>
        <p className="text-xs font-bold text-[#0A0A0A] mt-2">£{product.price}/mo</p>
      </div>
      <QtyControl qty={qty} onChange={onQtyChange} />
    </div>
  )
}

export function Act5Bundle({ reducedMotion }: Props) {
  const { selectedProducts, answers, identity, stackLevel } = useQuizStore()
  const cart = useLocalCart()
  const isLive = isLiveCatalogue()
  const containerRef = useRef<HTMLDivElement>(null)
  const successRef = useRef<HTMLDivElement>(null)

  // Local qty map: variantId → quantity
  const [quantities, setQuantities] = useState<Record<string, number>>(() => {
    const init: Record<string, number> = {}
    selectedProducts.forEach((p) => { init[p.variantId] = 1 })
    return init
  })

  const [hasInitialisedCart, setHasInitialisedCart] = useState(false)

  // Animate cards in
  useEffect(() => {
    if (!containerRef.current || reducedMotion) return
    gsap.fromTo(
      containerRef.current.querySelectorAll('[data-bundle-card]'),
      { x: 40, opacity: 0 },
      { x: 0, opacity: 1, stagger: 0.1, duration: 0.5, ease: 'power2.out', delay: 0.2 },
    )
  }, [reducedMotion])

  // Initialise cart with recommended products
  useEffect(() => {
    if (hasInitialisedCart || selectedProducts.length === 0) return
    setHasInitialisedCart(true)
    selectedProducts.forEach((p) => {
      cart.addItem(p.variantId, 1, `Selected based on your ${p.goalTags[0] ?? 'goals'} profile`)
    })
  }, [selectedProducts]) // eslint-disable-line react-hooks/exhaustive-deps

  // Confetti burst
  useEffect(() => {
    if (!cart.isCheckoutSuccess) return

    if (!reducedMotion) {
      confetti({ particleCount: 120, spread: 80, origin: { y: 0.6 }, colors: ['#00D4FF', '#ffffff', '#111111'] })
      setTimeout(() => confetti({ particleCount: 60, angle: 60, spread: 55, origin: { x: 0 }, colors: ['#00D4FF'] }), 300)
      setTimeout(() => confetti({ particleCount: 60, angle: 120, spread: 55, origin: { x: 1 }, colors: ['#00D4FF'] }), 300)
    }

    if (successRef.current) {
      gsap.fromTo(successRef.current, { scale: 0.9, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.5, ease: 'back.out(1.4)' })
    }
  }, [cart.isCheckoutSuccess, reducedMotion])

  const total = selectedProducts.reduce((s, p) => s + p.price * (quantities[p.variantId] ?? 1), 0)
  const activeItems = selectedProducts.filter((p) => (quantities[p.variantId] ?? 1) > 0)
  // Subscribe & save rate is fixed per bundle (stack level), the same rate the
  // stack-review flow uses, so the legacy bundle screen advertises it consistently.
  const subRate = levelSubscriptionRate(stackLevel)
  const subPct = Math.round(subRate * 100)
  const discountRate = activeItems.length >= 2 ? subRate : 0
  const discount = total * discountRate
  const discountedTotal = total - discount

  function handleQtyChange(product: Product, newQty: number) {
    setQuantities((q) => ({ ...q, [product.variantId]: newQty }))
    const line = cart.cart?.lines.find((l) => l.variantId === product.variantId)
    if (newQty === 0 && line) cart.removeItem(line.id)
    else if (line) cart.updateQty(line.id, newQty)
  }

  // ─── Success screen ───────────────────────────────────────────────────────

  if (cart.isCheckoutSuccess) {
    return (
      <div className="min-h-screen bg-[#0A0A0A] flex flex-col items-center justify-center px-6 text-center">
        <div ref={successRef} style={{ opacity: 0 }}>
          <div className="text-5xl mb-6">🎉</div>
          <h2 className="text-3xl font-black text-white mb-3" style={{ fontFamily: 'var(--font-display)' }}>
            Your stack is on its way.
          </h2>
          <p className="text-sm text-white/50 max-w-xs mx-auto leading-relaxed">
            {isLive
              ? 'Check your inbox for your order confirmation. Your getCHRGD stack will be with you soon.'
              : 'This is a demo — the real purchase flows are the shop and the quiz stack builder.'}
          </p>
          {identity && (
            <div className="mt-8 inline-flex items-center gap-2 px-4 py-2 rounded-full border border-white/10 text-xs text-white/40">
              <span className="w-2 h-2 rounded-full bg-[#00D4FF]" />
              {identity.name} stack confirmed
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#F5F5F0] pb-32">
      {/* Header */}
      <div className="px-5 pt-12 pb-6 max-w-lg mx-auto">
        <span className="text-[10px] font-bold tracking-[0.25em] uppercase text-[#00D4FF] mb-3 block"
          style={{ fontFamily: 'var(--font-display)' }}>
          {isLive ? 'Your bundle' : 'Your bundle · Mock mode'}
        </span>
        <h2 className="text-3xl font-black text-[#0A0A0A] leading-tight"
          style={{ fontFamily: 'var(--font-display)' }}>
          Build your stack.
        </h2>
        <p className="text-sm text-[#0A0A0A]/45 mt-1.5">
          Adjust quantities, then head to checkout.
          {!isLive && (
            <span className="ml-1 text-[#00D4FF]">
              (Demo — checkout here is a preview)
            </span>
          )}
        </p>
      </div>

      {/* Horizontal card scroll */}
      <div
        ref={containerRef}
        className="flex gap-3 overflow-x-auto pb-4 px-5 scrollbar-hide"
        style={{ scrollSnapType: 'x mandatory' }}
      >
        {selectedProducts.map((product) => (
          <div key={product.id} data-bundle-card style={{ scrollSnapAlign: 'start', opacity: reducedMotion ? 1 : 0 }}>
            <ProductBundleCard
              product={product}
              qty={quantities[product.variantId] ?? 1}
              onQtyChange={(n) => handleQtyChange(product, n)}
              accentColor={product.accentColor}
            />
          </div>
        ))}
      </div>

      {/* Bundle discount banner */}
      {discountRate > 0 && (
        <div className="mx-5 mt-4 px-4 py-2.5 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center gap-2">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="flex-shrink-0">
            <circle cx="7" cy="7" r="7" fill="#16a34a" />
            <path d="M4 7l2 2 4-4" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="text-xs font-semibold text-emerald-700">
            {subPct}% subscribe &amp; save discount applied — you save £{discount.toFixed(2)}/mo
          </span>
        </div>
      )}

      {/* Price breakdown */}
      <div className="px-5 mt-3 max-w-lg mx-auto">
        <div className="bg-white rounded-2xl border border-[#0A0A0A]/6 p-4">
          <p className="text-xs font-bold tracking-widest uppercase text-[#0A0A0A]/30 mb-3"
            style={{ fontFamily: 'var(--font-display)' }}>
            Order summary
          </p>
          {activeItems.map((p) => {
            const qty = quantities[p.variantId] ?? 1
            return (
              <div key={p.id} className="flex items-center justify-between py-1.5 border-b border-[#0A0A0A]/4 last:border-0">
                <span className="text-xs text-[#0A0A0A]/60">{p.name} × {qty}</span>
                <span className="text-xs font-semibold text-[#0A0A0A]">£{(p.price * qty).toFixed(2)}</span>
              </div>
            )
          })}
          {discountRate > 0 && (
            <div className="flex items-center justify-between py-1.5 border-b border-[#0A0A0A]/4">
              <span className="text-xs text-emerald-600 font-medium">Subscribe &amp; save ({subPct}%)</span>
              <span className="text-xs font-semibold text-emerald-600">−£{discount.toFixed(2)}</span>
            </div>
          )}
          <div className="flex items-center justify-between pt-3 mt-1">
            <span className="text-sm font-bold text-[#0A0A0A]">Total / month</span>
            <div className="flex flex-col items-end gap-0.5">
              {discountRate > 0 && (
                <span className="text-xs text-[#0A0A0A]/30 line-through">£{total.toFixed(2)}</span>
              )}
              <span className="text-lg font-black text-[#0A0A0A]" style={{ fontFamily: 'var(--font-display)' }}>
                £{discountedTotal.toFixed(2)}
              </span>
            </div>
          </div>
        </div>

        <p className="mt-3 text-[10px] text-[#0A0A0A]/25 leading-relaxed">
          Products selected based on your stated goals and preferences. Results may vary.
          Not intended as medical advice.
        </p>
      </div>

      {/* Sticky checkout bar */}
      <div className="fixed bottom-0 left-0 right-0 px-5 pt-3 pb-8 bg-gradient-to-t from-[#F5F5F0] to-transparent">
        <div className="max-w-lg mx-auto flex items-center gap-3">
          <div>
            <p className="text-[10px] text-[#0A0A0A]/35">{activeItems.length} product{activeItems.length !== 1 ? 's' : ''}</p>
            {discountRate > 0 && (
              <p className="text-[10px] text-emerald-600 font-semibold">Save £{discount.toFixed(2)}/mo</p>
            )}
            <div className="flex items-baseline gap-1.5">
              {discountRate > 0 && (
                <span className="text-xs text-[#0A0A0A]/25 line-through">£{total.toFixed(2)}</span>
              )}
              <p className="text-lg font-black text-[#0A0A0A]" style={{ fontFamily: 'var(--font-display)' }}>
                £{discountedTotal.toFixed(2)}<span className="text-xs font-normal text-[#0A0A0A]/35">/mo</span>
              </p>
            </div>
          </div>
          <button
            onClick={cart.checkout}
            disabled={cart.isLoading || activeItems.length === 0}
            className={`flex-1 py-4 rounded-2xl text-sm font-bold tracking-wide transition-all active:scale-95 ${
              activeItems.length > 0
                ? 'bg-[#00D4FF] text-[#0A0A0A]'
                : 'bg-[#0A0A0A]/10 text-[#0A0A0A]/25 cursor-not-allowed'
            }`}
            style={{ fontFamily: 'var(--font-display)' }}
          >
            {cart.isLoading ? 'Loading…' : isLive ? 'Checkout →' : 'Demo checkout →'}
          </button>
        </div>
      </div>
    </div>
  )
}
