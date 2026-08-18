'use client'

import { useState } from 'react'
import { useReducedMotion } from '@/hooks/useReducedMotion'

/**
 * "How is it going?" as a level rather than a face.
 *
 * The sibling of `ChargeMeter` and the opposite job: the meter *shows* a
 * proportion, this one *asks* for a rating. Both draw the house's charge, which
 * is the point — the answer looks like the thing being answered about.
 *
 * It replaced five emoji faces, which were the loudest cheap thing in the hub.
 * The rating it emits is unchanged (1–5), so nothing downstream moved.
 *
 * ── Why the height belongs to the bar ───────────────────────────────────────
 * The segments climb left to right, so the control reads as a level before
 * anything is filled in. The climb has to be drawn on the bar and not on the
 * button: a 44px minimum tap target on the button flattens a 26→46px climb into
 * five identical boxes. So the button is a plain tap target and the bar is drawn
 * inside it, bottom-aligned, at whatever height its step is worth.
 *
 * ── Why a radiogroup ────────────────────────────────────────────────────────
 * It is one answer from a fixed set, which is what radios are. Each segment
 * announces "3 out of 5" rather than its own bar height, because the height is
 * a drawing of the value and not a second piece of information.
 */

const MAX = 5

export interface ChargeScaleProps {
  /** How many choices to offer. 5 for a full check-in, 3 for an inline one. */
  steps?: 3 | 5
  /** The current rating (1–5), if any. */
  value?: number | null
  onChange: (rating: number) => void
  /** Anchor labels under the ends of the scale. */
  lowLabel?: string
  highLabel?: string
  /** What is being rated — used to name the group. */
  label?: string
  className?: string
}

/** The 1–5 ratings a given step count maps onto. */
function ratingsFor(steps: 3 | 5): number[] {
  return steps === 3 ? [1, 3, 5] : [1, 2, 3, 4, 5]
}

export function ChargeScale({
  steps = 5,
  value = null,
  onChange,
  lowLabel = 'Not great',
  highLabel = 'Brilliant',
  label,
  className,
}: ChargeScaleProps) {
  const ratings = ratingsFor(steps)
  const reduced = useReducedMotion()
  // Which segment is under the pointer, so the meter previews the choice the way
  // a real gauge would rather than staying dead until committed.
  const [hovered, setHovered] = useState<number | null>(null)

  const shown = hovered ?? value
  const selectedIndex = shown == null ? -1 : ratings.indexOf(shown)

  return (
    <div className={className}>
      <div
        className="flex items-end"
        style={{ gap: 'var(--space-2)' }}
        role="radiogroup"
        aria-label={label ?? 'Rating'}
        onMouseLeave={() => setHovered(null)}
      >
        {ratings.map((rating, i) => {
          const filled = i <= selectedIndex
          const leading = i === selectedIndex
          const height = 26 + i * (steps === 3 ? 9 : 5)

          return (
            <button
              key={rating}
              type="button"
              role="radio"
              aria-checked={value === rating}
              aria-label={`${rating} out of ${MAX}`}
              onClick={() => onChange(rating)}
              onMouseEnter={() => setHovered(rating)}
              onFocus={() => setHovered(rating)}
              onBlur={() => setHovered(null)}
              className="system-control system-focus group relative flex-1 flex items-end"
              style={{ height: 'var(--control-md)', borderRadius: 'var(--radius-chip)' }}
            >
              <span
                className="relative w-full overflow-hidden"
                style={{
                  height,
                  borderRadius: 'var(--radius-chip)',
                  background: filled ? 'transparent' : 'var(--surface-1)',
                  border: `1px solid ${filled ? 'var(--accent-line)' : 'var(--edge)'}`,
                  transition: reduced
                    ? undefined
                    : 'height var(--duration-base) var(--ease-settle), background var(--duration-base) var(--ease-settle), border-color var(--duration-base) var(--ease-settle)',
                }}
              >
                {filled && (
                  <span
                    className="absolute inset-0"
                    style={{ background: 'var(--fill-accent)', boxShadow: 'var(--glow-accent)' }}
                  />
                )}
                {/* A pulse on the segment the level currently reaches — the same
                    cue the quiz's charge rail gives when an answer lands. */}
                {leading && !reduced && (
                  <span
                    className="absolute inset-0"
                    style={{
                      borderRadius: 'var(--radius-chip)',
                      background: 'var(--accent)',
                      animation: 'system-charge-surge var(--duration-slow) var(--ease-exit) both',
                    }}
                  />
                )}
              </span>
            </button>
          )
        })}
      </div>

      <div className="flex justify-between" style={{ marginTop: 'var(--space-2)' }}>
        <span style={{ fontSize: 'var(--text-micro)', color: 'var(--ink-3)' }}>{lowLabel}</span>
        <span style={{ fontSize: 'var(--text-micro)', color: 'var(--ink-3)' }}>{highLabel}</span>
      </div>
    </div>
  )
}
