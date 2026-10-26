'use client'

import { useState } from 'react'
import { Badge, Button, ChargeScale } from '@/components/system'
import { formatGBP } from '@/lib/stack-blueprint/pricing'
import { dimensionForSlot } from '@/lib/feedback'
import { Icon } from '@/components/ui/Icon'
import { ProductTile } from '@/components/stack-review/ProductTile'
import { tint } from '@/lib/ui/tokens'
import { StatusBadge, toneColor } from './StatusBadge'
import { ProgressRing } from './ProgressRing'
import type { CatalogueProduct } from '@/lib/catalogue/types'
import type { MemberSubscriptionLine } from '@/lib/recharge/types'
import type { LineRecommendation, FeedbackDimension } from '@/lib/feedback'

/**
 * One product in the member's stack.
 *
 * This is the card a subscriber sees more than any other, and until now it was
 * the flattest thing in the app: a title, a price and two grey buttons, on the
 * same opaque grey as everything around it. The reveal that sold them the stack
 * showed each product as a photo with a set of bars saying what it supports; the
 * screen they live in afterwards showed a string.
 *
 * So it borrows the photo: `ProductTile` gives every line a visual anchor — the
 * real photo where the catalogue has one, a tile of the product's form where it
 * doesn't. Not the bars: "What it supports" scored each product against health
 * goals, which says what it does, and the reveal dropped them for that reason.
 */

interface Props {
  line: MemberSubscriptionLine
  recommendation: LineRecommendation
  /** The catalogue entry, for the photo. Absent is survivable. */
  product?: CatalogueProduct
  onChange: (lineId: string) => void
  onManage: (lineId: string) => void
  onMicroFeedback: (dimension: FeedbackDimension, rating: number) => void
}

function cadence(line: MemberSubscriptionLine): string {
  const qty = line.quantity > 1 ? `${line.quantity}× · ` : ''
  return line.deliveryIntervalMonths > 1 ? `${qty}every ${line.deliveryIntervalMonths} months` : `${qty}every month`
}

export function StackItemCard({
  line,
  recommendation: rec,
  product,
  onChange,
  onManage,
  onMicroFeedback,
}: Props) {
  const review = rec.phase === 'review'
  const dimension = dimensionForSlot(line.stackSlot)
  const canMicro = dimension != null && (rec.phase === 'working' || rec.phase === 'review' || rec.phase === 'check')
  const [tapped, setTapped] = useState<number | null>(null)

  function micro(rating: number) {
    if (!dimension) return
    setTapped(rating)
    onMicroFeedback(dimension, rating)
  }

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{
        background: 'var(--surface-1)',
        // The review state is a tinted hairline, not a heavy amber box. It needs
        // to be findable in a scroll, not to shout over the four cards that are
        // perfectly fine.
        border: `1px solid ${review ? tint('var(--tone-attention)', 40) : 'var(--edge)'}`,
      }}
    >
      <div className="p-4">
        {/* Wraps, because the status label is a sentence rather than a word:
            "Building long-term health · wk 0 of 6" beside a slot name is wider
            than a phone. `Badge` is `shrink-0` with `white-space: nowrap` — it
            will not give way — so without this the status pill ran out of the
            card and the card's rounded overflow sliced it off mid-word. */}
        <div className="flex flex-wrap items-start justify-between gap-2 mb-3">
          <Badge tone="accent">{line.slotTitle}</Badge>
          <StatusBadge label={rec.statusLabel} icon={rec.statusIcon} tone={rec.statusTone} />
        </div>

        <div className="flex items-start gap-3">
          <div className="relative shrink-0">
            <ProductTile
              imageUrl={product?.imageUrl}
              formats={product?.formats}
              title={line.productTitle}
              size={56}
            />
            {/* The ring rides the corner of the tile rather than taking a column
                of its own, so a building product and a settled one line up. */}
            {rec.progress && (
              <div className="absolute -bottom-1.5 -right-1.5">
                <ProgressRing pct={rec.progress.pct} size={26} stroke={2.5} color={toneColor('building')} />
              </div>
            )}
          </div>

          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-medium text-[var(--ink-1)] leading-snug" style={{ fontFamily: 'var(--font-display)' }}>
              {line.productTitle}
            </p>
            {line.variantTitle && <p className="text-xs text-[var(--ink-3)] mt-0.5">{line.variantTitle}</p>}
            <p className="text-xs text-[var(--ink-2)] mt-1">{cadence(line)}</p>
          </div>

          {/* Weight is rationed to the number. Everything else on this card is
              medium or semibold, so the price is the thing the eye lands on. */}
          <span className="text-sm font-black shrink-0" style={{ color: 'var(--accent)', fontFamily: 'var(--font-display)' }}>
            {formatGBP(line.pricePerDelivery)}
          </span>
        </div>

        <p className="text-xs leading-relaxed mt-3" style={{ color: 'var(--ink-2)' }}>
          {rec.reason}
        </p>

        {/* Inline micro check-in — only when the benefit can be felt */}
        {canMicro && (
          <div className="mt-3.5">
            {tapped == null ? (
              <div className="flex items-center gap-3">
                <span className="text-[11px] font-semibold text-[var(--ink-3)] shrink-0">Feeling it?</span>
                {/* Three segments, still worth 1 / 3 / 5 — the ratings the three
                    emoji faces sent, so no stored feedback gets rescaled. */}
                <ChargeScale
                  steps={3}
                  onChange={micro}
                  label={`How is ${line.productTitle} landing?`}
                  lowLabel="Not feeling it"
                  highLabel="Feeling great"
                  className="flex-1 min-w-0"
                />
              </div>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold" style={{ color: 'var(--tone-positive)' }}>
                <Icon name="check" size={13} />
                Thanks — logged
              </span>
            )}
          </div>
        )}

        <div className="flex gap-2 mt-4">
          {review ? (
            <Button variant="destructive" size="sm" icon="swap" onClick={() => onChange(line.id)} fullWidth>
              Find a better fit
            </Button>
          ) : (
            <Button variant="secondary" size="sm" icon="swap" onClick={() => onChange(line.id)} fullWidth>
              Swap
            </Button>
          )}
          <Button variant="secondary" size="sm" icon="sliders" onClick={() => onManage(line.id)} className="px-4">
            Manage
          </Button>
        </div>
      </div>

    </div>
  )
}
