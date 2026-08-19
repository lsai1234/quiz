'use client'

import { formatGBP } from '@/lib/stack-blueprint/pricing'
import { Button, Card } from '@/components/system'
import { Eyebrow } from './Eyebrow'
import { ProductTile } from '@/components/stack-review/ProductTile'
import { tint } from '@/lib/ui/tokens'
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
        <span className="text-[11px] text-[var(--ink-3)]">Tap a box to edit</span>
      </div>
      <p className="text-[11px] text-[var(--ink-3)] mb-2.5 leading-relaxed">
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
            const tone = d.isNext ? 'var(--accent)' : skipped ? 'var(--tone-attention)' : 'var(--ink-3)'
            return (
              // `glow` on the next box only: it is the one card on this rail
              // that is the point of the rail. More than one and it stops
              // meaning anything.
              <Card
                key={d.id}
                padding="none"
                interactive
                tone={d.isNext ? 'accent' : skipped ? 'attention' : undefined}
                glow={d.isNext ? 'accent' : undefined}
                className="shrink-0 w-40"
              >
              <Button
                variant="ghost"
                fullWidth
                layout="stack"
                aria-label={`${d.isNext ? 'Next box, ' : ''}${weekday} ${day} ${month}${skipped ? ', skipped' : ''}`}
                onClick={() => onSelect(d)}
              >
                <span className="flex items-center justify-between mb-2">
                  <Eyebrow color={tone}>{d.isNext ? 'Next' : skipped ? 'Skipped' : month}</Eyebrow>
                </span>

                <span className="flex items-baseline gap-1.5">
                  <span style={{ fontSize: 'var(--text-hero)', fontFamily: 'var(--font-display)', lineHeight: 'var(--leading-tight)', color: 'var(--ink-1)' }}>
                    {day}
                  </span>
                  <span style={{ fontSize: 'var(--text-body-sm)', color: 'var(--ink-2)' }}>{weekday}</span>
                </span>

                {skipped || d.items.length === 0 ? (
                  <span
                    className="block"
                    style={{ fontSize: 'var(--text-meta)', fontWeight: 'var(--weight-body)', lineHeight: 'var(--leading-snug)', color: 'var(--ink-3)', marginTop: 'var(--space-3)' }}
                  >
                    {skipped ? 'Tap to restore' : 'Nothing due'}
                  </span>
                ) : (
                  <>
                    <span className="flex items-center gap-1 mt-2.5">
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
                        <span style={{ fontSize: 'var(--text-micro)', fontFamily: 'var(--font-display)', color: 'var(--ink-3)', marginLeft: 'var(--space-1)' }}>
                          +{d.items.length - 4}
                        </span>
                      )}
                    </span>
                    <span className="flex items-center justify-between mt-2.5">
                      <span style={{ fontSize: 'var(--text-micro)', color: 'var(--ink-2)' }}>
                        {d.items.length} item{d.items.length === 1 ? '' : 's'}
                      </span>
                      <span style={{ fontSize: 'var(--text-meta)', fontFamily: 'var(--font-display)', color: 'var(--accent)' }}>
                        {formatGBP(d.total)}
                      </span>
                    </span>
                  </>
                )}
              </Button>
              </Card>
            )
          })}
        </div>

        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 right-0 w-10"
          style={{ background: 'linear-gradient(to right, transparent, var(--ground-base))' }}
        />
      </div>
    </div>
  )
}
