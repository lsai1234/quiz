'use client'

import { useQuizStore } from '@/lib/store'
import { MOCK_BLUEPRINT } from '@/lib/stack-blueprint'
import { calculateStackPrice, calculateSubscriptionPrice } from '@/lib/stack-blueprint/helpers'
import { MOCK_CATALOGUE } from '@/lib/catalogue'
import type { CatalogueProduct } from '@/lib/catalogue/types'
import { StackHero } from './StackHero'
import { StackProductCard } from './StackProductCard'
import { StackPriceSummary } from './StackPriceSummary'

export function StackReviewPage() {
  const { stackBlueprint, catalogue } = useQuizStore()
  const blueprint = stackBlueprint ?? MOCK_BLUEPRINT
  const products: CatalogueProduct[] = catalogue.length > 0 ? (catalogue as unknown as CatalogueProduct[]) : MOCK_CATALOGUE

  const sortedSlots = [...blueprint.slots].sort((a, b) => a.displayOrder - b.displayOrder)
  const oneOffPrice = calculateStackPrice(blueprint, products)
  const subscriptionPrice = calculateSubscriptionPrice(blueprint, products)

  if (!blueprint) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <p className="text-[var(--color-muted)] text-sm">Building your stack…</p>
      </div>
    )
  }

  return (
    <div className="pb-10">
      <StackHero
        blueprint={blueprint}
        productCount={sortedSlots.length}
        totalPrice={oneOffPrice}
      />

      <div className="h-px bg-[var(--color-border)] mx-5" />

      {/* Product cards */}
      <div className="px-5 pt-7 max-w-lg mx-auto space-y-3">
        <p
          className="text-[10px] font-bold tracking-widest uppercase text-[var(--color-muted)] mb-4"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          Your personalised stack — {sortedSlots.length} products
        </p>
        {sortedSlots.map((slot) => {
          const product = products.find((p) => p.id === slot.selectedProductId)
          return (
            <StackProductCard
              key={slot.slotId}
              slot={slot}
              product={product}
            />
          )
        })}
      </div>

      {/* Price summary */}
      <div className="px-5 pt-6 max-w-lg mx-auto">
        <StackPriceSummary
          oneOffPrice={oneOffPrice}
          subscriptionPrice={subscriptionPrice}
          savingsSummary={blueprint.savingsSummary}
        />
      </div>
    </div>
  )
}
