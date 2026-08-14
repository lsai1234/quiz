'use client'

import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { IconButton } from '@/components/ui/IconButton'
import { Icon } from '@/components/ui/Icon'
import { formatGBP } from '@/lib/stack-blueprint/pricing'
import { computeAddImpact, projectedEconomics } from '@/lib/recharge/mock'
import { SLOT_LABELS } from '@/lib/catalogue/types'
import type { CatalogueProduct, StackSlot } from '@/lib/catalogue/types'
import type { MemberSubscription } from '@/lib/recharge/types'

const ACCENT = '#00D4FF'

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
    <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-2)] p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-bold text-[var(--color-text)] leading-snug" style={{ fontFamily: 'var(--font-display)' }}>{p.title}</p>
        <span className="text-xs font-bold flex-shrink-0" style={{ color: ACCENT }}>+{formatGBP(impact.monthlyDelta)}/mo</span>
      </div>
      <p className="text-xs text-[var(--color-text-2)] mt-1 leading-relaxed line-clamp-2">{p.shortReason || p.description}</p>
      <p className="text-[11px] text-[var(--color-muted)] mt-1.5">
        {econ.discountPct > 0 && <><span className="line-through">{formatGBP(econ.listUnit)}</span> {formatGBP(econ.discountedUnit)} · save {econ.discountPct}% · </>}
        {econ.shipEveryMonths > 1 ? `ships every ${econ.shipEveryMonths} months, spread to ${formatGBP(econ.perMonth)}/mo` : 'ships every month'}
      </p>
      <button
        onClick={() => onAdd(p)}
        className="mt-3 w-full py-2.5 rounded-xl text-xs font-bold bg-[var(--color-accent)] text-[var(--color-bg)] active:scale-95 transition-all inline-flex items-center justify-center gap-1.5"
        style={{ fontFamily: 'var(--font-display)' }}
      >
        <Icon name="plus" size={14} />
        Add to every delivery
      </button>
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
  const [mounted, setMounted] = useState(false)

  useEffect(() => { setMounted(true) }, [])
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

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

  if (!mounted) return null

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
      style={{ background: 'rgba(0,0,0,0.72)' }}
    >
      <div className="w-full max-w-lg rounded-t-3xl overflow-hidden flex flex-col" style={{ background: 'var(--color-surface)', maxHeight: '90dvh' }}>
        <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
          <div className="w-10 h-1 rounded-full bg-[var(--color-border-2)]" />
        </div>

        <div className="px-5 pt-2 pb-4 flex items-start justify-between gap-3 flex-shrink-0 border-b border-[var(--color-border)]">
          <div>
            <p className="text-[10px] font-bold tracking-widest uppercase mb-0.5" style={{ color: ACCENT, fontFamily: 'var(--font-display)' }}>
              Add to your stack
            </p>
            <h3 className="text-lg font-black text-[var(--color-text)]" style={{ fontFamily: 'var(--font-display)' }}>What would you like to add?</h3>
          </div>
          <IconButton icon="x" label="Close" size="sm" filled onClick={onClose} className="mt-0.5" />
        </div>

        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-5">
          {focused.length > 0 && (
            <div>
              <p className="text-[10px] font-bold tracking-widest uppercase mb-2" style={{ color: ACCENT, fontFamily: 'var(--font-display)' }}>
                In place of what you lost
              </p>
              <div className="space-y-2">
                {focused.map((p) => (
                  <ProductCard key={p.id} product={p} subscription={subscription} catalogue={catalogue} onAdd={onAdd} />
                ))}
              </div>
            </div>
          )}
          {grouped.length === 0 && focused.length === 0 && (
            <p className="text-sm text-[var(--color-muted)] text-center py-10">Your stack already covers everything available to subscribe to.</p>
          )}
          {grouped.map(([slot, products]) => (
            <div key={slot}>
              <p className="text-[10px] font-bold tracking-widest uppercase text-[var(--color-muted)] mb-2" style={{ fontFamily: 'var(--font-display)' }}>
                {SLOT_LABELS[slot]}
              </p>
              <div className="space-y-2">
                {products.map((p) => (
                  <ProductCard key={p.id} product={p} subscription={subscription} catalogue={catalogue} onAdd={onAdd} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  )
}
