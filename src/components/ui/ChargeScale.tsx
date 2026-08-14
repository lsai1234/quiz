'use client'

import { useState } from 'react'
import { useReducedMotion } from '@/hooks/useReducedMotion'
import { ACCENT, EASE, GLASS, tint } from '@/lib/ui/tokens'

/**
 * "How is it landing?" — as a charge meter, not a row of faces.
 *
 * What this replaces: `😞 😕 😐 🙂 😄` in the hub's check-in, and `😞 😐 😄` on
 * every stack card. Emoji are somebody else's artwork — a different drawing on
 * every platform, unstyleable, and cartoonish beside a product that otherwise
 * looks like this one does.
 *
 * A charge meter is the obvious replacement rather than a cleverer one, because
 * charge is already the brand's entire metaphor: the quiz fills a battery as you
 * answer (`ChargeRail`), the reveal discharges it into the recommendation, and
 * `globals.css` carries `charge-shimmer`, `rail-surge` and `battery-hum` for it.
 * Rating a product by filling that same meter says "this is how charged you are"
 * in the language the member has already been taught.
 *
 * ── The scale ────────────────────────────────────────────────────────────────
 * Always 1–5 underneath, whatever is drawn. `steps={5}` offers every point;
 * `steps={3}` offers the ends and the middle — 1, 3, 5 — which is exactly what
 * the inline card check-in already sent. So `submitFeedback` and
 * `submitDimension` receive the same numbers they do today, and nothing
 * downstream of this component changes.
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
  /** What is being rated — used to build each segment's accessible name. */
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
        className="flex items-end gap-1.5"
        role="radiogroup"
        aria-label={label ?? 'Rating'}
        onMouseLeave={() => setHovered(null)}
      >
        {ratings.map((rating, i) => {
          const filled = i <= selectedIndex
          const leading = i === selectedIndex
          // Segments climb left to right, so the control reads as a level even
          // before anything is filled in.
          //
          // The height belongs to the BAR, not to the button. It used to be set
          // on the button alongside `min-h-11` — and a 44px minimum flattened
          // every step of a 26→46px climb, so the meter rendered as five
          // identical empty boxes with no emoji and nothing in their place. The
          // button is now a plain 44px tap target and the bar is drawn inside
          // it, bottom-aligned, at whatever height its step is worth.
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
              className={[
                'group relative flex-1 flex items-end h-11 rounded-lg',
                'transition-transform duration-200 active:scale-95',
                'focus-visible:outline-none focus-visible:ring-2',
              ].join(' ')}
              style={{ ['--tw-ring-color' as string]: tint(ACCENT, 45) }}
            >
              <span
                className="relative w-full rounded-lg overflow-hidden transition-all duration-200"
                style={{
                  height,
                  background: filled ? 'transparent' : GLASS.surface,
                  border: `1px solid ${filled ? tint(ACCENT, 55) : GLASS.hairline}`,
                }}
              >
                {filled && (
                  <span
                    className="absolute inset-0"
                    style={{
                      background: `linear-gradient(to top, ${tint(ACCENT, 55)}, ${ACCENT})`,
                      boxShadow: `0 0 10px -2px ${tint(ACCENT, 60)}`,
                      transition: reduced ? undefined : `opacity 200ms ${EASE}`,
                    }}
                  />
                )}
                {/* A pulse on the segment the level currently reaches — the same
                    cue the quiz's charge rail gives when an answer lands. */}
                {leading && !reduced && (
                  <span
                    className="absolute inset-0 rounded-lg"
                    style={{ background: ACCENT, animation: 'rail-surge 0.5s ease-out' }}
                  />
                )}
              </span>
            </button>
          )
        })}
      </div>

      <div className="flex justify-between mt-1.5 px-0.5">
        <span className="text-[10px] text-[var(--color-muted)]">{lowLabel}</span>
        <span className="text-[10px] text-[var(--color-muted)]">{highLabel}</span>
      </div>
    </div>
  )
}
