'use client'

import type { Product } from '@/lib/types'

interface Props {
  product: Product
  selected: boolean
  onToggle: () => void
  isUpgrade?: boolean
}

export function ProductCard({ product, selected, onToggle, isUpgrade }: Props) {
  return (
    <div
      className={`relative rounded-2xl border transition-all ${
        selected
          ? 'border-[var(--color-accent)] bg-[var(--color-surface-2)]'
          : 'border-[var(--color-border)] bg-[var(--color-surface)]'
      }`}
    >
      {isUpgrade && (
        <div className="absolute top-3 right-3">
          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold tracking-wide bg-[var(--color-surface-2)] border border-[var(--color-border)] text-[var(--color-muted)]">
            UPGRADE
          </span>
        </div>
      )}

      <div className="p-4">
        {/* Colour accent line */}
        <div
          className="w-6 h-1 rounded-full mb-3"
          style={{ background: product.accentColor }}
        />

        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <p
              className="text-sm font-bold leading-tight"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              {product.name}
            </p>
            <p className="text-xs text-[var(--color-muted)] mt-0.5 capitalize">
              {product.subcategory}
            </p>
          </div>
          <p
            className="text-sm font-bold text-[var(--color-accent)] whitespace-nowrap"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            £{product.price}/mo
          </p>
        </div>

        <p className="text-xs text-[var(--color-text-2)] mt-2 leading-relaxed">
          {product.safeWording}
        </p>

        {/* Tags */}
        <div className="flex flex-wrap gap-1.5 mt-3">
          {product.stimulant && (
            <span className="px-2 py-0.5 rounded-full text-[10px] bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-muted)]">
              ⚡ Stimulant
            </span>
          )}
          {product.vegan && (
            <span className="px-2 py-0.5 rounded-full text-[10px] bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-muted)]">
              🌱 Vegan
            </span>
          )}
          {product.beginner && (
            <span className="px-2 py-0.5 rounded-full text-[10px] bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-muted)]">
              ✓ Beginner-friendly
            </span>
          )}
        </div>

        {/* Add/remove */}
        <button
          onClick={onToggle}
          className={`mt-4 w-full py-2.5 rounded-xl text-xs font-bold tracking-wide transition-all active:scale-95 ${
            selected
              ? 'bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-text-2)]'
              : 'bg-[var(--color-accent)] text-[var(--color-bg)]'
          }`}
          style={{ fontFamily: 'var(--font-display)' }}
        >
          {selected ? 'Remove from stack' : 'Add to stack'}
        </button>
      </div>
    </div>
  )
}
