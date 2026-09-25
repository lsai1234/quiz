'use client'

import { SHELF_LABEL } from '@/lib/consult/summary'
import type { ShelfItem } from '@/lib/consult/types'
import { Chip, Hint } from '../controls'
import type { SceneProps } from './registry'

/**
 * The shelf check (build C11).
 *
 * Chips for what they already take, so the stack engine can skip duplicates
 * and count existing caffeine. "Nothing yet" is an answer of its own and clears
 * the rest; picking anything clears "Nothing yet". The photo scan (U1) slots in
 * under the chips once it exists — it is deliberately not shown before then.
 */

export const SHELF: ShelfItem[] = [
  'multivitamin',
  'vitamin-d',
  'creatine',
  'protein',
  'omega-3',
  'pre-workout',
  'magnesium',
  'collagen',
]

export function toggleShelf(shelf: ShelfItem[] | null, item: ShelfItem): ShelfItem[] | null {
  const current = shelf ?? []
  const next = current.includes(item) ? current.filter((i) => i !== item) : [...current, item]
  // Untapping the last one goes back to unanswered, not to "nothing yet".
  return next.length ? next : null
}

export function ShelfCheck({ answers, onAnswer }: SceneProps) {
  const shelf = answers.shelf
  const nothing = shelf !== null && shelf.length === 0

  return (
    <div className="flex flex-col" style={{ gap: 'var(--amp-space-5)' }}>
      <div role="group" aria-label="What you already take" className="flex flex-wrap" style={{ gap: 'var(--amp-space-2)' }}>
        {SHELF.map((item) => (
          <Chip key={item} label={SHELF_LABEL[item]} selected={Boolean(shelf?.includes(item))} onToggle={() => onAnswer({ shelf: toggleShelf(shelf, item) })} />
        ))}
        <Chip label="Nothing yet" selected={nothing} onToggle={() => onAnswer({ shelf: nothing ? null : [] })} />
      </div>
      <div aria-live="polite">
        {shelf && shelf.length > 0 && <Hint>I won&apos;t double up on {shelf.length === 1 ? 'that' : 'these'}.</Hint>}
      </div>
    </div>
  )
}
