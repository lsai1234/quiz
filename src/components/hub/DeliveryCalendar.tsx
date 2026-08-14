'use client'

import { formatGBP } from '@/lib/stack-blueprint/pricing'
import { Eyebrow } from '@/components/ui/Eyebrow'
import { ProductTile } from '@/components/stack-review/ProductTile'
import { ACCENT, AMBER, GLASS, tint } from '@/lib/ui/tokens'
import type { CatalogueProduct } from '@/lib/catalogue/types'
import type { Delivery } from '@/lib/recharge/schedule'

interface Props {
  deliveries: Delivery[]
  /** The catalogue, for the box-contents tiles. Absent degrades to text. */
  catalogue?: CatalogueProduct[]
  onSelect: (delivery: Delivery) => void
}

function parts(iso: string) {
  const d = new Date(iso)
  return {
    weekday: d.toLocaleDateString('en-GB', { weekday: 'short' }).toUpperCase(),
    day: d.getDate(),
    month: d.toLocaleDateString('en-GB', { month: 'short' }).toUpperCase(),
  }
}

/**
 * The next six boxes, as a swipeable rail.
 *
 * Two changes worth naming. Each card now shows what is in the box as tiles
 * rather than a `·`-joined list of slot names — the same argument as the stack
 * card, on the screen where a member decides whether a box is worth keeping.
 * And the rail gets an edge fade, because a horizontal scroller that ends flush
 * at the viewport edge looks like a row that happens to be cut off rather than
 * one you can push.
 */
export function DeliveryCalendar({ deliveries, catalogue = [], onSelect }: Props) {
  const productFor = (id: string) => catalogue.find((p) => p.id === id)

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <Eyebrow>Delivery calendar</Eyebrow>
        <span className="text-[11px] text-[var(--color-muted)]">Tap a box to edit</span>
      </div>
      <p className="text-[11px] text-[var(--color-muted)] mb-2.5 leading-relaxed">
        Amounts show each box’s value — you’re billed one flat monthly amount, not per box.
      </p>

      {/* The fade is painted on a wrapper rather than the scroller, so it stays
          put while the content moves under it. */}
      <div className="relative -mx-5">
        <div
          className="flex gap-3 overflow-x-auto pb-2 px-5 scrollbar-hide"
          style={{ scrollSnapType: 'x mandatory', WebkitOverflowScrolling: 'touch' }}
        >
          {deliveries.map((d) => {
            const { weekday, day, month } = parts(d.date)
            const skipped = d.status === 'skipped'
            const tone = d.isNext ? ACCENT : skipped ? AMBER : 'var(--color-muted)'
            return (
              <button
                key={d.id}
                type="button"
                onClick={() => onSelect(d)}
                className="shrink-0 w-40 rounded-2xl p-3.5 text-left transition-all duration-200 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2"
                style={{
                  scrollSnapAlign: 'start',
                  background: GLASS.surface,
                  border: `1px solid ${d.isNext ? tint(ACCENT, 55) : skipped ? tint(AMBER, 40) : GLASS.hairline}`,
                  ...(d.isNext ? { boxShadow: `0 0 24px -10px ${ACCENT}` } : {}),
                  opacity: skipped ? 0.7 : 1,
                  ['--tw-ring-color' as string]: tint(ACCENT, 45),
                }}
              >
                <div className="flex items-center justify-between mb-2">
                  <Eyebrow color={tone} className="text-[9px]">
                    {d.isNext ? 'Next' : skipped ? 'Skipped' : month}
                  </Eyebrow>
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: tone }} />
                </div>

                <div className="flex items-baseline gap-1.5">
                  <span className="text-3xl font-black leading-none" style={{ color: 'var(--color-text)', fontFamily: 'var(--font-display)' }}>{day}</span>
                  <span className="text-xs font-bold text-[var(--color-text-2)]">{weekday}</span>
                </div>

                {skipped || d.items.length === 0 ? (
                  <p className="text-[11px] text-[var(--color-muted)] mt-2.5 leading-snug">
                    {skipped ? 'Tap to restore' : 'Nothing due'}
                  </p>
                ) : (
                  <>
                    <div className="flex items-center gap-1 mt-2.5">
                      {d.items.slice(0, 4).map((it, i) => (
                        <ProductTile
                          key={`${it.productId}-${i}`}
                          imageUrl={productFor(it.productId)?.imageUrl}
                          slot={productFor(it.productId)?.stackSlots[0]}
                          title={it.productTitle}
                          size={26}
                        />
                      ))}
                      {d.items.length > 4 && (
                        <span className="text-[10px] font-bold text-[var(--color-muted)] ml-0.5" style={{ fontFamily: 'var(--font-display)' }}>
                          +{d.items.length - 4}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center justify-between mt-2.5">
                      <span className="text-[10px] font-bold text-[var(--color-text-2)]">
                        {d.items.length} item{d.items.length === 1 ? '' : 's'}
                      </span>
                      <span className="text-[11px] font-black" style={{ color: ACCENT, fontFamily: 'var(--font-display)' }}>
                        {formatGBP(d.total)}
                      </span>
                    </div>
                  </>
                )}
              </button>
            )
          })}
        </div>

        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 right-0 w-10"
          style={{ background: 'linear-gradient(to right, transparent, var(--color-bg))' }}
        />
      </div>
    </div>
  )
}
