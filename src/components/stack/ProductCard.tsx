'use client'

import type { Product } from '@/lib/types'
import { getRole } from '@/lib/product-roles'

interface Props {
  product: Product
  selected: boolean
  onToggle: () => void
  isUpgrade?: boolean
}

export function ProductCard({ product, selected, onToggle, isUpgrade }: Props) {
  const role = getRole(product)
  return (
    <div
      className={`relative rounded-2xl border transition-all overflow-hidden ${
        selected
          ? 'border-[var(--color-accent)]/60 bg-[var(--color-surface-2)] shadow-[0_0_24px_-12px_var(--color-accent)]'
          : 'border-[var(--color-border)] bg-[var(--color-surface)]'
      }`}
    >
      <div className="p-4">
        <div className="flex gap-3">
          {/* Product image */}
          <div
            className="w-[72px] h-[72px] rounded-xl flex-shrink-0 flex items-center justify-center overflow-hidden bg-[var(--color-surface-2)] border border-[var(--color-border)]"
          >
            {product.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={product.image}
                alt={product.name}
                className="w-full h-full object-cover"
                loading="lazy"
              />
            ) : (
              <span
                className="text-xl font-black opacity-60"
                style={{ fontFamily: 'var(--font-display)', color: product.accentColor }}
              >
                {product.category.charAt(0)}
              </span>
            )}
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            {/* Category chip + badges row */}
            <div className="flex items-center gap-1.5 mb-1">
              <span
                className="px-2 py-0.5 rounded-full text-[9px] font-bold tracking-widest uppercase"
                style={{
                  fontFamily: 'var(--font-display)',
                  color: product.accentColor,
                  background: `color-mix(in srgb, ${product.accentColor} 12%, transparent)`,
                }}
              >
                {role.label}
              </span>
              {isUpgrade && (
                <span className="px-2 py-0.5 rounded-full text-[9px] font-semibold tracking-widest uppercase bg-[var(--color-surface-2)] border border-[var(--color-border)] text-[var(--color-muted)]">
                  Upgrade
                </span>
              )}
            </div>

            <div className="flex items-start justify-between gap-2">
              <p
                className="text-sm font-bold leading-snug line-clamp-2"
                style={{ fontFamily: 'var(--font-display)' }}
              >
                {product.name}
              </p>
              <p
                className="text-sm font-black text-[var(--color-accent)] whitespace-nowrap"
                style={{ fontFamily: 'var(--font-display)' }}
              >
                £{product.price.toFixed(2)}
              </p>
            </div>

            {/* Plain-English explainer — what this product actually does */}
            <p className="text-xs text-[var(--color-text-2)] mt-1 leading-relaxed">
              {role.benefit}
            </p>
          </div>
        </div>

        {/* Footer: flags + toggle */}
        <div className="flex items-center justify-between gap-3 mt-3">
          <div className="flex gap-1.5 text-[10px] text-[var(--color-muted)]">
            {product.stimulant && <span title="Contains stimulants">⚡</span>}
            {product.vegan && <span title="Vegan">🌱</span>}
          </div>
          <button
            onClick={onToggle}
            className={`px-4 py-2 rounded-xl text-xs font-bold tracking-wide transition-all active:scale-95 ${
              selected
                ? 'bg-transparent border border-[var(--color-border)] text-[var(--color-muted)]'
                : 'bg-[var(--color-accent)] text-[var(--color-bg)]'
            }`}
            style={{ fontFamily: 'var(--font-display)' }}
          >
            {selected ? '− Remove' : '+ Add to stack'}
          </button>
        </div>
      </div>
    </div>
  )
}
