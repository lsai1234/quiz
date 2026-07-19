'use client'

import type { CatalogueProduct } from '@/lib/catalogue/types'
import type { StatAxis } from '@/lib/stack-stats'
import { ProductTile } from './ProductTile'

const ACCENT = '#00D4FF'

interface Props {
  boosters: CatalogueProduct[]
  axes: StatAxis[]
  onAdd: (product: CatalogueProduct) => void
}

function prettify(goal: string) {
  return goal.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

/** The user-facing "what this adds" chips — the shared axes it hits, else its own top goal. */
function deltas(product: CatalogueProduct, axes: StatAxis[]): string[] {
  const onAxis = axes.filter((a) => product.goals.includes(a.goal)).map((a) => a.label)
  if (onAxis.length > 0) return onAxis.slice(0, 2)
  return product.goals[0] ? [prettify(product.goals[0])] : []
}

/**
 * The final card in the stack deck: optional add-ons, each with a one-tap add
 * and the stat axes it would boost. Adding one inserts its own stat card into
 * the deck (and drops it from this list).
 */
export function UpgradesCard({ boosters, axes, onAdd }: Props) {
  return (
    <div
      className="flex flex-col rounded-2xl overflow-hidden h-full"
      style={{ background: 'var(--color-surface)', border: '1px dashed var(--color-border-2)' }}
    >
      <div className="p-4 pb-2">
        <p className="text-[9px] font-bold tracking-widest uppercase mb-1" style={{ color: ACCENT, fontFamily: 'var(--font-display)' }}>
          Optional add-ons
        </p>
        <h3 className="text-lg font-black leading-tight" style={{ color: 'var(--color-text)', fontFamily: 'var(--font-display)' }}>
          Complete your stack
        </h3>
      </div>

      {boosters.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center px-5 py-8 text-center">
          <span style={{ color: ACCENT }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 6 9 17l-5-5" />
            </svg>
          </span>
          <p className="text-sm font-bold mt-2" style={{ color: 'var(--color-text)', fontFamily: 'var(--font-display)' }}>
            You&rsquo;re all set
          </p>
          <p className="text-xs mt-1" style={{ color: 'var(--color-muted)' }}>
            Your stack already covers your goals.
          </p>
        </div>
      ) : (
        <div className="flex-1 flex flex-col gap-2 px-3 pb-3 pt-1 overflow-y-auto">
          {boosters.map((product) => {
            const firstVariant = product.variants.find((v) => v.available) ?? product.variants[0]
            const price = firstVariant?.price ?? product.basePrice
            const tags = deltas(product, axes)
            return (
              <div
                key={product.id}
                className="flex items-center gap-2.5 rounded-xl p-2"
                style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border)' }}
              >
                <ProductTile imageUrl={product.imageUrl} slot={product.stackSlots[0]} title={product.title} size={40} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold leading-snug truncate" style={{ color: 'var(--color-text)', fontFamily: 'var(--font-display)' }}>
                    {product.title}
                  </p>
                  <div className="flex flex-wrap gap-1 mt-0.5">
                    {tags.map((t) => (
                      <span
                        key={t}
                        className="text-[8px] font-bold px-1.5 py-0.5 rounded-full"
                        style={{ color: ACCENT, background: `color-mix(in srgb, ${ACCENT} 10%, transparent)`, fontFamily: 'var(--font-display)' }}
                      >
                        +{t}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1 flex-shrink-0">
                  <span className="text-xs font-black" style={{ color: 'var(--color-accent)', fontFamily: 'var(--font-display)' }}>
                    £{price.toFixed(2)}
                  </span>
                  <button
                    onClick={() => onAdd(product)}
                    className="text-[10px] font-bold px-2.5 py-1 rounded-full active:scale-90 transition-transform"
                    style={{ background: 'var(--color-accent)', color: 'var(--color-bg)', fontFamily: 'var(--font-display)' }}
                  >
                    + Add
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
