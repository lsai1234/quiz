'use client'

import { useMemo, useState } from 'react'
import type { CatalogueProduct, StackSlot } from '@/lib/catalogue/types'
import type { ResolvedBasketLine } from '@/lib/basket/types'
import { slotCoverage, activeOverlaps, overlapSentence } from '@/lib/shop/stack-radar'

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
      <h3 className="text-[10px] font-bold tracking-[0.18em] uppercase mb-2" style={{ color: 'var(--color-muted)', fontFamily: 'var(--font-display)' }}>
        This basket covers
      </h3>

      <div className="flex flex-wrap gap-1.5">
        {covered.map((row) => (
          <span
            key={row.slot}
            className="px-2.5 py-1 rounded-full text-[11px] font-bold"
            style={{
              fontFamily: 'var(--font-display)',
              color: 'var(--color-accent)',
              background: 'color-mix(in srgb, var(--color-accent) 12%, transparent)',
              border: '1px solid color-mix(in srgb, var(--color-accent) 30%, transparent)',
            }}
          >
            {row.label}
          </span>
        ))}
      </div>

      {uncovered.length > 0 && (
        <>
          <p className="text-[11px] mt-3 mb-2" style={{ color: 'var(--color-muted)' }}>
            {/* Stated, not prescribed. */}
            Not in this basket — have a look if any of it is for you:
          </p>
          <div className="flex flex-wrap gap-1.5">
            {shown.map((row) => (
              <button
                key={row.slot}
                onClick={() => onBrowseSlot(row.slot)}
                className="px-2.5 py-1 rounded-full text-[11px] font-semibold active:scale-95 transition-transform"
                style={{
                  fontFamily: 'var(--font-display)',
                  color: 'var(--color-text-2)',
                  background: 'var(--color-surface-2)',
                  border: '1px solid var(--color-border-2)',
                }}
              >
                {row.label}
                <span className="ml-1" style={{ opacity: 0.6 }}> {row.available}</span>
              </button>
            ))}
            {hidden > 0 && (
              <button
                onClick={() => setShowAll(true)}
                className="px-2.5 py-1 rounded-full text-[11px] font-semibold active:scale-95 transition-transform"
                style={{ color: 'var(--color-muted)', fontFamily: 'var(--font-display)' }}
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
        <div className="mt-3 rounded-xl px-3 py-2.5" style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border-2)' }}>
          <p className="text-[11px] font-bold mb-1" style={{ color: 'var(--color-text)', fontFamily: 'var(--font-display)' }}>
            Worth knowing
          </p>
          {overlaps.map((overlap) => (
            <p key={overlap.key} className="text-[11px] leading-snug" style={{ color: 'var(--color-text-2)' }}>
              {overlapSentence(overlap)} You may only need one.
            </p>
          ))}
        </div>
      )}
    </section>
  )
}
