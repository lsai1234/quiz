'use client'

import type { DietaryTag } from '@/lib/catalogue/types'
import { DIETARY_LABEL } from '@/lib/product-facts'

const ACCENT = '#00D4FF'

interface Props {
  tags: DietaryTag[]
  active: DietaryTag[]
  onToggle: (tag: DietaryTag) => void
  onClear: () => void
}

/** Dietary filter chips. Toggling narrows every shelf; Clear resets. */
export function ShopFilterBar({ tags, active, onToggle, onClear }: Props) {
  if (tags.length === 0) return null

  return (
    <div className="flex gap-2 overflow-x-auto px-5 py-1 max-w-lg mx-auto scrollbar-hide" style={{ scrollbarWidth: 'none' }}>
      {tags.map((tag) => {
        const on = active.includes(tag)
        return (
          <button
            key={tag}
            onClick={() => onToggle(tag)}
            aria-pressed={on}
            className="flex-shrink-0 px-3.5 py-1.5 rounded-full text-xs font-bold tracking-wide transition-all active:scale-95"
            style={{
              fontFamily: 'var(--font-display)',
              color: on ? 'var(--color-bg)' : 'var(--color-text-2)',
              background: on ? ACCENT : 'var(--color-surface)',
              border: on ? '1px solid transparent' : '1px solid var(--color-border-2)',
            }}
          >
            {DIETARY_LABEL[tag]}
          </button>
        )
      })}
      {active.length > 0 && (
        <button
          onClick={onClear}
          className="flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold active:scale-95 transition-transform"
          style={{ color: 'var(--color-muted)' }}
        >
          Clear
        </button>
      )}
    </div>
  )
}
