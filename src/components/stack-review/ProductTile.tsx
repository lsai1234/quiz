'use client'

import { QuizIcon } from '@/components/quiz/QuizIcon'
import { slotVisual } from '@/lib/catalogue/slot-visuals'

interface Props {
  /** Product photo. When null/absent, a designed slot-coloured tile is shown. */
  imageUrl?: string | null
  /** Slot type — drives the fallback glyph + hue. */
  slot?: string | null
  /** Product title, for the image alt text. */
  title?: string
  /** Square edge length in px. */
  size?: number
  className?: string
}

/**
 * The visual anchor for a product across Act 4. Shows the real photo when the
 * catalogue has one; otherwise renders a designed fallback — a soft, slot-hued
 * gradient tile with the slot's monoline glyph — so an image-less catalogue
 * still looks deliberate instead of broken.
 */
export function ProductTile({ imageUrl, slot, title, size = 96, className }: Props) {
  const { glyph, hue } = slotVisual(slot)

  return (
    <div
      className={`rounded-xl flex-shrink-0 overflow-hidden flex items-center justify-center ${className ?? ''}`}
      style={{
        width: size,
        height: size,
        background: imageUrl
          ? 'var(--color-surface-2)'
          : `radial-gradient(circle at 32% 26%, color-mix(in srgb, ${hue} 26%, transparent), transparent 72%), var(--color-surface-2)`,
        border: imageUrl
          ? '1px solid var(--color-border)'
          : `1px solid color-mix(in srgb, ${hue} 24%, var(--color-border))`,
      }}
    >
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={imageUrl} alt={title ?? ''} className="w-full h-full object-cover" loading="lazy" />
      ) : (
        <span style={{ color: hue, opacity: 0.92 }}>
          <QuizIcon name={glyph} size={Math.round(size * 0.42)} />
        </span>
      )}
    </div>
  )
}
