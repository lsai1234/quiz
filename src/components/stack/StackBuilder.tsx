'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useQuizStore } from '@/lib/store'
import { buildRecommendedStack, stackTotalPrice } from '@/lib/recommendation'
import { useProducts } from '@/hooks/useProducts'
import type { StackLevel } from '@/lib/types'
import { LevelSelector } from './LevelSelector'
import { ProductCard } from './ProductCard'

export function StackBuilder() {
  const router = useRouter()
  const {
    identity,
    answers,
    stackLevel,
    selectedProducts,
    setStackLevel,
    setSelectedProducts,
    toggleProduct,
  } = useQuizStore()

  const [animKey, setAnimKey] = useState(0)
  const { products, isLive } = useProducts()

  useEffect(() => {
    if (!identity) {
      router.replace('/')
    }
  }, [identity, router])

  // Rebuild recommended stack whenever level or catalogue changes
  const recommended = useMemo(() => buildRecommendedStack(answers, products), [answers, products])

  function handleLevelChange(level: StackLevel) {
    setStackLevel(level)
    setAnimKey((k) => k + 1)

    // Reselect core products for this level from the recommended stack
    const core = recommended.core.filter((p) => p.stackLevels.includes(level))
    setSelectedProducts(core)
  }

  const totalPrice = stackTotalPrice(selectedProducts)

  // Upgrades = recommended upgrades not currently selected
  const availableUpgrades = recommended.upgrades.filter(
    (u) => !selectedProducts.some((s) => s.id === u.id),
  )

  if (!identity) return null

  return (
    <main className="flex flex-col min-h-screen bg-[var(--color-bg)] text-[var(--color-text)]">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-[var(--color-bg)]/95 backdrop-blur-sm px-5 pt-5 pb-4 border-b border-[var(--color-border)]">
        <div className="max-w-md mx-auto">
          <div className="flex items-center justify-between">
            <div>
              <button
                onClick={() => router.back()}
                className="text-[var(--color-muted)] text-sm flex items-center gap-1 mb-1"
              >
                <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
                  <path d="M12 4L6 10L12 16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Back
              </button>
              <h1
                className="text-lg font-black"
                style={{ fontFamily: 'var(--font-display)' }}
              >
                {identity.name}
              </h1>
            </div>
            <div className="text-right">
              <p
                className="text-xl font-black text-[var(--color-accent)]"
                style={{ fontFamily: 'var(--font-display)' }}
              >
                £{totalPrice}/mo
              </p>
              <p className="text-xs text-[var(--color-muted)]">
                {selectedProducts.length} products
                {isLive && (
                  <span className="ml-1.5 inline-block w-1.5 h-1.5 rounded-full bg-green-400 align-middle" title="Live Shopify catalogue" />
                )}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 px-5 py-5 max-w-md mx-auto w-full">
        {/* Level selector */}
        <div className="mb-6">
          <p
            className="text-xs font-semibold tracking-widest uppercase text-[var(--color-muted)] mb-3"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            Stack level
          </p>
          <LevelSelector current={stackLevel} onChange={handleLevelChange} />
        </div>

        {/* Core products */}
        <div key={animKey} className="animate-[fade-up_0.3s_ease_both]">
          {selectedProducts.length > 0 && (
            <div className="mb-6">
              <p
                className="text-xs font-semibold tracking-widest uppercase text-[var(--color-muted)] mb-3"
                style={{ fontFamily: 'var(--font-display)' }}
              >
                Your core stack
              </p>
              <div className="flex flex-col gap-3">
                {selectedProducts.map((product) => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    selected
                    onToggle={() => toggleProduct(product)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Available upgrades */}
          {availableUpgrades.length > 0 && (
            <div className="mb-6">
              <p
                className="text-xs font-semibold tracking-widest uppercase text-[var(--color-muted)] mb-3"
                style={{ fontFamily: 'var(--font-display)' }}
              >
                Recommended upgrades
              </p>
              <div className="flex flex-col gap-3">
                {availableUpgrades.map((product) => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    selected={false}
                    onToggle={() => toggleProduct(product)}
                    isUpgrade
                  />
                ))}
              </div>
            </div>
          )}

          {/* Excluded with reasons */}
          {recommended.excluded.length > 0 && (
            <div className="mb-6">
              <p
                className="text-xs font-semibold tracking-widest uppercase text-[var(--color-muted)] mb-3"
                style={{ fontFamily: 'var(--font-display)' }}
              >
                Not included
              </p>
              <div className="flex flex-col gap-2">
                {recommended.excluded.map(({ category, reason }) => (
                  <div
                    key={category}
                    className="flex items-start gap-3 px-4 py-3 rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)]"
                  >
                    <div className="w-1.5 h-1.5 rounded-full bg-[var(--color-muted)] mt-1.5 flex-shrink-0" />
                    <div>
                      <p className="text-xs font-semibold text-[var(--color-text-2)] capitalize">
                        {category}
                      </p>
                      <p className="text-xs text-[var(--color-muted)] mt-0.5">{reason}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Claim-safe disclaimer */}
        <p className="text-[10px] text-[var(--color-muted)] leading-relaxed mt-2 mb-24">
          Products are selected based on your stated goals and preferences. Results may vary.
          Not intended as medical advice. Consult a healthcare professional before starting any
          supplement routine.
        </p>
      </div>

      {/* Sticky basket CTA */}
      <div className="fixed bottom-0 left-0 right-0 px-5 pt-3 pb-8 bg-gradient-to-t from-[var(--color-bg)] via-[var(--color-bg)]/95 to-transparent">
        <div className="max-w-md mx-auto flex items-center gap-3">
          <div className="flex-1">
            <p className="text-xs text-[var(--color-muted)]">Your stack total</p>
            <p
              className="text-lg font-black text-[var(--color-accent)]"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              £{totalPrice}/mo
            </p>
          </div>
          <button
            className="flex-1 py-4 rounded-2xl text-sm font-bold tracking-wide text-[var(--color-bg)] bg-[var(--color-accent)] transition-all active:scale-95 disabled:opacity-50"
            disabled={selectedProducts.length === 0}
            onClick={() => alert('Shopify checkout coming soon')}
            style={{ fontFamily: 'var(--font-display)' }}
          >
            Add to basket →
          </button>
        </div>
      </div>
    </main>
  )
}
