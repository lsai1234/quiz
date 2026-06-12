'use client'

import type { StackSlotEntry } from '@/lib/stack-blueprint'
import type { CatalogueProduct } from '@/lib/catalogue/types'

interface Props {
  slot: StackSlotEntry
  product: CatalogueProduct | undefined
  onChangeProduct?: (slotId: string) => void
  onChangeVariant?: (slotId: string, variantId: string) => void
  onRemove?: (slotId: string) => void
}

const ACCENT = '#00D4FF'

export function StackProductCard({ slot, product, onChangeProduct, onChangeVariant, onRemove }: Props) {
  const selectedVariant = product?.variants.find((v) => v.id === slot.selectedVariantId)
    ?? product?.variants.find((v) => v.available)
    ?? product?.variants[0]
  const price = selectedVariant?.price ?? product?.basePrice ?? 0

  return (
    <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden">
      <div className="p-4">
        {/* Header: slot chip + price */}
        <div className="flex items-start justify-between gap-2 mb-3">
          <span
            className="px-2.5 py-1 rounded-full text-[9px] font-bold tracking-widest uppercase"
            style={{
              color: ACCENT,
              background: `color-mix(in srgb, ${ACCENT} 12%, transparent)`,
              fontFamily: 'var(--font-display)',
            }}
          >
            {slot.title}
          </span>
          <span
            className="text-sm font-black text-[var(--color-accent)]"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            £{price.toFixed(2)}
          </span>
        </div>

        {/* Product body */}
        <div className="flex gap-3">
          {/* Image */}
          <div className="w-20 h-20 rounded-xl flex-shrink-0 overflow-hidden bg-[var(--color-surface-2)] border border-[var(--color-border)] flex items-center justify-center">
            {product?.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={product.imageUrl} alt={product.title} className="w-full h-full object-cover" loading="lazy" />
            ) : (
              <span
                className="text-2xl font-black opacity-50"
                style={{ fontFamily: 'var(--font-display)', color: ACCENT }}
              >
                {slot.title.charAt(0)}
              </span>
            )}
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <p
              className="text-sm font-bold leading-snug text-[var(--color-text)] line-clamp-2"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              {product?.title ?? 'Product unavailable'}
            </p>
            {selectedVariant && (
              <p className="text-xs text-[var(--color-muted)] mt-0.5">{selectedVariant.title}</p>
            )}
            <p className="text-xs text-[var(--color-text-2)] mt-1.5 leading-relaxed line-clamp-2">
              {slot.reason}
            </p>
          </div>
        </div>

        {/* Tags row */}
        <div className="flex flex-wrap gap-1.5 mt-3">
          <span className="px-2 py-0.5 rounded-full text-[9px] font-semibold border border-[var(--color-border)] text-[var(--color-muted)]">
            Recommended
          </span>
          {slot.required ? (
            <span className="px-2 py-0.5 rounded-full text-[9px] font-semibold border border-[var(--color-border)] text-[var(--color-muted)]">
              Core
            </span>
          ) : (
            <span className="px-2 py-0.5 rounded-full text-[9px] font-semibold border border-[var(--color-border)] text-[var(--color-muted)]">
              Optional
            </span>
          )}
          {product?.subscriptionEligible && (
            <span
              className="px-2 py-0.5 rounded-full text-[9px] font-semibold"
              style={{
                color: 'var(--color-accent)',
                background: 'color-mix(in srgb, var(--color-accent) 8%, transparent)',
              }}
            >
              Subscription eligible
            </span>
          )}
        </div>

        {/* Variant selector */}
        {product && product.variants.length > 1 && (
          <div className="mt-3">
            <select
              className="w-full text-xs rounded-lg px-3 py-2 border border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-text)] appearance-none"
              value={slot.selectedVariantId ?? selectedVariant?.id ?? ''}
              onChange={(e) => onChangeVariant?.(slot.slotId, e.target.value)}
            >
              {product.variants.filter((v) => v.available).map((v) => (
                <option key={v.id} value={v.id}>{v.title} — £{v.price.toFixed(2)}</option>
              ))}
            </select>
          </div>
        )}

        {/* Action buttons */}
        {(slot.canSwap || slot.canRemove) && (
          <div className="flex gap-2 mt-3">
            {slot.canSwap && (
              <button
                onClick={() => onChangeProduct?.(slot.slotId)}
                className="flex-1 py-2 rounded-xl text-xs font-bold border border-[var(--color-border)] text-[var(--color-muted)] active:scale-95 transition-all"
                style={{ fontFamily: 'var(--font-display)' }}
              >
                Change product
              </button>
            )}
            {slot.canRemove && (
              <button
                onClick={() => onRemove?.(slot.slotId)}
                className="py-2 px-3 rounded-xl text-xs font-semibold text-[var(--color-muted)] active:scale-95 transition-all hover:text-[var(--color-red)]"
                style={{ fontFamily: 'var(--font-display)' }}
              >
                Remove
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
