'use client'

import { useMemo } from 'react'
import { Eyebrow } from './Eyebrow'
import { Button, EmptyState, Modal, ModalBody, ModalHeader } from '@/components/system'
import { ProductTile } from '@/components/stack-review/ProductTile'
import { StatBars } from '@/components/stack-review/StatBars'
import { productBars, selectShopAxes, type StatAxis } from '@/lib/stack-stats'
import { Icon } from '@/components/ui/Icon'
import { formatGBP } from '@/lib/stack-blueprint/pricing'
import { computeAddImpact, projectedEconomics } from '@/lib/recharge/mock'
import { SLOT_LABELS } from '@/lib/catalogue/types'
import type { CatalogueProduct, StackSlot } from '@/lib/catalogue/types'
import type { MemberSubscription } from '@/lib/recharge/types'

/** One addable product, with what it does to the monthly. */
function ProductCard({
  product: p, subscription, catalogue, axes, onAdd,
}: {
  product: CatalogueProduct
  subscription: MemberSubscription
  catalogue: CatalogueProduct[]
  /** Shared axes, so every card in the sheet compares on the same footing. */
  axes: StatAxis[]
  onAdd: (product: CatalogueProduct) => void
}) {
  const impact = computeAddImpact(subscription, p, catalogue)
  const econ = projectedEconomics(p)
  const bars = axes.length > 0 ? productBars(p, axes) : null
  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--surface-1)', border: `1px solid var(--edge)` }}>
      <div className="p-4">
        <div className="flex items-start gap-3">
          {/* This sheet is asking a member to buy something. Selling it as a
              line of text, on the one screen in the app where the reveal deck
              would have shown a product, was leaving the argument unmade. */}
          <ProductTile imageUrl={p.imageUrl} slot={p.stackSlots[0]} title={p.title} size={52} />
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-medium text-[var(--ink-1)] leading-snug" style={{ fontFamily: 'var(--font-display)' }}>{p.title}</p>
              <span className="text-xs font-black shrink-0" style={{ color: 'var(--accent)', fontFamily: 'var(--font-display)' }}>+{formatGBP(impact.monthlyDelta)}/mo</span>
            </div>
            <p className="text-xs text-[var(--ink-2)] mt-1 leading-relaxed line-clamp-2">{p.shortReason || p.description}</p>
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
      {bars && (
        <StatBars
          bars={bars}
          animate={false}
          label="What it supports"
          className="px-4 pt-3 pb-3.5"
          style={{ borderTop: `1px solid var(--edge)` }}
        />
      )}
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

  /**
   * Axes drawn from the member's existing stack, not from what's on offer — so
   * a candidate's bars answer "how does this compare to what I already have?"
   * rather than to the other things being sold alongside it.
   */
  const axes = useMemo(() => {
    const owned = subscription.lines.map((l) => catalogue.find((p) => p.id === l.productId)).filter((p): p is CatalogueProduct => !!p)
    return owned.length > 0 ? selectShopAxes(owned, 4) : []
  }, [subscription.lines, catalogue])

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

  // Subscription-eligible products not already in the stack, grouped by slot.
  const grouped = useMemo(() => {
    const candidates = catalogue.filter(
      (p) => p.subscriptionEligible && !p.isSubscriptionOnly && !inStack.has(p.id) && !focusedIds.has(p.id),
    )
    const map = new Map<StackSlot, CatalogueProduct[]>()
    for (const p of candidates) {
      const slot = p.stackSlots[0]
      const arr = map.get(slot) ?? []
      arr.push(p)
      map.set(slot, arr)
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
                <ProductCard key={p.id} product={p} subscription={subscription} catalogue={catalogue} axes={axes} onAdd={onAdd} />
              ))}
            </div>
          </div>
        )}
        {grouped.length === 0 && focused.length === 0 && (
          <EmptyState icon="check" title="Your stack is complete">
            You already subscribe to everything we offer on subscription. New products land here as they launch.
          </EmptyState>
        )}
        {grouped.map(([slot, products]) => (
          <div key={slot}>
            <Eyebrow className="mb-2">{SLOT_LABELS[slot]}</Eyebrow>
            <div className="space-y-2">
              {products.map((p) => (
                <ProductCard key={p.id} product={p} subscription={subscription} catalogue={catalogue} axes={axes} onAdd={onAdd} />
              ))}
            </div>
          </div>
        ))}
      </ModalBody>
    </Modal>
  )
}
