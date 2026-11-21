'use client'

import { useMemo, useState } from 'react'
import type { CatalogueProduct, StackSlot } from '@/lib/catalogue/types'
import type { ResolvedBasketLine } from '@/lib/basket/types'
import { slotCoverage, activeOverlaps, overlapSentence } from '@/lib/shop/stack-radar'
import { Icon } from '@/components/ui/Icon'

interface Props {
  resolved: ResolvedBasketLine[]
  products: CatalogueProduct[]
  /** Browse the shop filtered to a slot. Closes the drawer on the way. */
  onBrowseSlot: (slot: StackSlot) => void
}

/** Uncovered slots beyond this are folded away — the point is a reading, not a list. */
const VISIBLE_UNCOVERED = 4

/**
 * Stack Radar — the quiz's structural reading of a basket, in the drawer.
 *
 * In the drawer rather than as a floating ring on the shelf, which is what the
 * plan sketched: the bottom of a phone already carries the compare tray, the
 * basket bar and a suggestion, and a fourth persistent thing there would be one
 * too many. The basket is also where this reading is worth having — it is about
 * what you have, and it is the last look before paying.
 *
 * The overlap warning travels separately, as a nudge, because it is the one part
 * that matters BEFORE the drawer opens. See `basket-alchemy`.
 *
 * ── Covered slots are a map, not a prescription ──────────────────────────────
 * "Nothing for hydration" is a fact. "You need hydration" is a sales pitch, and
 * we know nothing here about who is shopping — the quiz is the thing that asks.
 * So an uncovered slot is stated neutrally and offered as somewhere to look, not
 * as something missing from their life.
 */
export function ShopStackRadar({ resolved, products, onBrowseSlot }: Props) {
  const [showAll, setShowAll] = useState(false)

  const coverage = useMemo(() => slotCoverage(resolved, products), [resolved, products])
  const overlaps = useMemo(() => activeOverlaps(resolved), [resolved])

  const covered = coverage.filter((row) => row.covered)
  const uncovered = coverage.filter((row) => !row.covered)
  if (covered.length === 0) return null

  const shown = showAll ? uncovered : uncovered.slice(0, VISIBLE_UNCOVERED)
  const hidden = uncovered.length - shown.length

  return (
    <section aria-label="What this basket covers">
      <h3 className="sf-label" style={{ margin: '0 0 var(--space-2)' }}>
        This basket covers
      </h3>

      <div className="flex flex-wrap gap-1.5">
        {covered.map((row) => (
          <span
            key={row.slot}
            className="inline-flex items-center gap-1.5 px-3 rounded-full text-[12.5px] font-medium"
            style={{ minHeight: 28, color: 'var(--accent)',
              background: 'rgba(0, 212, 255, 0.1)',
              boxShadow: 'inset 0 0 0 1px rgba(0, 212, 255, 0.28)' }}
          >
            <Icon name="check" size={12} />
            {row.label}
          </span>
        ))}
      </div>

      {uncovered.length > 0 && (
        <>
          <p className="sf-meta" style={{ margin: 'var(--space-3) 0 var(--space-2)' }}>
            {/* Stated, not prescribed. */}
            Not in this basket — have a look if any of it is for you:
          </p>
          <div className="flex flex-wrap gap-1.5">
            {shown.map((row) => (
              <button
                key={row.slot}
                type="button"
                onClick={() => onBrowseSlot(row.slot)}
                className="sf-chip"
                style={{ minHeight: 30, padding: '0 12px', fontSize: 12.5 }}
              >
                {row.label}
                <span className="sf-num" style={{ color: 'var(--text-dim)' }}>{row.available}</span>
              </button>
            ))}
            {hidden > 0 && (
              <button
                type="button"
                onClick={() => setShowAll(true)}
                className="sf-chip"
                style={{ minHeight: 30, padding: '0 12px', fontSize: 12.5, background: 'transparent', boxShadow: 'none' }}
              >
                +{hidden} more
              </button>
            )}
          </div>
        </>
      )}

      {/*
        The overlap, said plainly. Arithmetic on the labels and nothing else — no
        dose is called too much and nobody is told to stop, because those are
        claims and this is a shop. See `lib/shop/stack-radar.ts`.
      */}
      {overlaps.length > 0 && (
        <div className="mt-3 px-3.5 py-3" style={{ borderRadius: 14, background: 'var(--surface-mid)', boxShadow: 'inset 0 0 0 1px var(--line)' }}>
          <p className="text-[12.5px] font-medium mb-1" style={{ color: 'var(--text)' }}>
            Worth knowing
          </p>
          {overlaps.map((overlap) => (
            <p key={overlap.key} className="text-[12.5px] leading-snug" style={{ color: 'var(--text-dim)' }}>
              {overlapSentence(overlap)} You may only need one.
            </p>
          ))}
        </div>
      )}
    </section>
  )
}
