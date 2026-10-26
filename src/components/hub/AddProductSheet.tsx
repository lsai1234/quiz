'use client'

import { useMemo } from 'react'
import { Eyebrow } from './Eyebrow'
import { Button, EmptyState, Modal, ModalBody, ModalHeader } from '@/components/system'
import { ProductTile } from '@/components/stack-review/ProductTile'
import { productTypeLabel } from '@/lib/catalogue/product-type'
import { cardFacts } from '@/lib/results/card-facts'
import { formatPerServing } from '@/lib/shop/per-serving'
import { Icon } from '@/components/ui/Icon'
import { formatGBP } from '@/lib/stack-blueprint/pricing'
import { computeAddImpact, projectedEconomics } from '@/lib/recharge/mock'
import type { CatalogueProduct } from '@/lib/catalogue/types'
import type { MemberSubscription } from '@/lib/recharge/types'
import { shortNameOf } from '@/lib/catalogue/short-name'

/**
 * What can be said of a product without saying what it does: its type, the
 * servings in a pack and what one costs. Not its description or short reason,
 * which say what it is for.
 */
function factLine(p: CatalogueProduct): string {
  const facts = cardFacts({ product: p })
  return [
    productTypeLabel(p),
    facts.servings != null ? `${Math.max(1, Math.round(facts.servings))} servings` : null,
    facts.perServing != null ? `${formatPerServing(facts.perServing)} per serving` : null,
  ].filter(Boolean).join(' · ')
}

/** One addable product, with what it does to the monthly. */
function ProductCard({
  product: p, subscription, catalogue, onAdd,
}: {
  product: CatalogueProduct
  subscription: MemberSubscription
  catalogue: CatalogueProduct[]
  onAdd: (product: CatalogueProduct) => void
}) {
  const impact = computeAddImpact(subscription, p, catalogue)
  const econ = projectedEconomics(p)
  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--surface-1)', border: `1px solid var(--edge)` }}>
      <div className="p-4">
        <div className="flex items-start gap-3">
          {/* This sheet is asking a member to buy something. Selling it as a
              line of text, on the one screen in the app where the reveal deck
              would have shown a product, was leaving the argument unmade. */}
          <ProductTile imageUrl={p.imageUrl} formats={p.formats} title={p.title} size={52} />
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-medium text-[var(--ink-1)] leading-snug" style={{ fontFamily: 'var(--font-display)' }}>{shortNameOf(p)}</p>
              <span className="text-xs font-black shrink-0" style={{ color: 'var(--accent)', fontFamily: 'var(--font-display)' }}>+{formatGBP(impact.monthlyDelta)}/mo</span>
            </div>
            <p className="text-xs text-[var(--ink-2)] mt-1 leading-relaxed">{factLine(p)}</p>
          </div>
        </div>
        <p className="text-[11px] text-[var(--ink-3)] mt-2.5">
          {econ.discountPct > 0 && <><span className="line-through">{formatGBP(econ.listUnit)}</span> {formatGBP(econ.discountedUnit)} · save {econ.discountPct}% · </>}
          {econ.shipEveryMonths > 1 ? `ships every ${econ.shipEveryMonths} months, spread to ${formatGBP(econ.perMonth)}/mo` : 'ships every month'}
        </p>
        <Button variant="primary" size="sm" icon="plus" onClick={() => onAdd(p)} className="mt-3">
          Add to every delivery
        </Button>
      </div>
    </div>
  )
}

interface Props {
  subscription: MemberSubscription
  catalogue: CatalogueProduct[]
  onAdd: (product: CatalogueProduct) => void
  onClose: () => void
  /**
   * Swap group to surface first — set when a member arrives from a
   * "browse replacements" email after we removed something. Landing them on the
   * full A-to-Z of the catalogue would make them hunt for the category they
   * just lost, which is the opposite of the invitation the email made.
   */
  focusSwapGroup?: string | null
}

export function AddProductSheet({ subscription, catalogue, onAdd, onClose, focusSwapGroup }: Props) {

  const inStack = useMemo(() => new Set(subscription.lines.map((l) => l.productId)), [subscription.lines])

  // Products in the category the member came here for, if any.
  const focused = useMemo(
    () =>
      focusSwapGroup
        ? catalogue.filter(
            (p) => p.swapGroup === focusSwapGroup && p.subscriptionEligible && !p.isSubscriptionOnly && !inStack.has(p.id),
          )
        : [],
    [catalogue, focusSwapGroup, inStack],
  )
  const focusedIds = useMemo(() => new Set(focused.map((p) => p.id)), [focused])

  // Subscription-eligible products not already in the stack, grouped by what
  // they are. Not by slot: a slot heading ("Immune Support", "Sleep") above a
  // product says what it is for.
  const grouped = useMemo(() => {
    const candidates = catalogue.filter(
      (p) => p.subscriptionEligible && !p.isSubscriptionOnly && !inStack.has(p.id) && !focusedIds.has(p.id),
    )
    const map = new Map<string, CatalogueProduct[]>()
    for (const p of candidates) {
      const type = productTypeLabel(p)
      const arr = map.get(type) ?? []
      arr.push(p)
      map.set(type, arr)
    }
    for (const arr of map.values()) arr.sort((a, b) => b.recommendationPriority - a.recommendationPriority)
    return [...map.entries()]
  }, [catalogue, inStack, focusedIds])

  return (
    <Modal onClose={onClose} presentation="sheet">
      <ModalHeader eyebrow="Add to your stack" title="What would you like to add?" />

      <ModalBody className="space-y-5">
        {focused.length > 0 && (
          <div>
            <Eyebrow color="var(--accent)" className="mb-2">In place of what you lost</Eyebrow>
            <div className="space-y-2">
              {focused.map((p) => (
                <ProductCard key={p.id} product={p} subscription={subscription} catalogue={catalogue} onAdd={onAdd} />
              ))}
            </div>
          </div>
        )}
        {grouped.length === 0 && focused.length === 0 && (
          <EmptyState icon="check" title="Your stack is complete">
            You already subscribe to everything we offer on subscription. New products land here as they launch.
          </EmptyState>
        )}
        {grouped.map(([type, products]) => (
          <div key={type}>
            <Eyebrow className="mb-2">{type}</Eyebrow>
            <div className="space-y-2">
              {products.map((p) => (
                <ProductCard key={p.id} product={p} subscription={subscription} catalogue={catalogue} onAdd={onAdd} />
              ))}
            </div>
          </div>
        ))}
      </ModalBody>
    </Modal>
  )
}
