'use client'

import { QuizIcon } from '@/components/quiz/QuizIcon'
import { slotVisual } from '@/lib/catalogue/slot-visuals'
import { productImageSrc, productImageSrcSet } from '@/lib/images/product-image'

interface Props {
  /** Product photo. When null/absent, a designed slot-coloured tile is shown. */
  imageUrl?: string | null
  /** Slot type — drives the fallback glyph + hue. */
  slot?: string | null
  /** Product title, for the image alt text. */
  title?: string
  /** Square edge length in px. */
  size?: number
  /**
   * Fill the container instead of taking a fixed edge length, staying square.
   * `size` is still required in this mode — it is what the image pipeline is
   * asked for, and roughly what the tile renders at.
   */
  fill?: boolean
  className?: string
}

/**
 * The visual anchor for a product across Act 4. Shows the real photo when the
 * catalogue has one; otherwise renders a designed fallback — a soft, slot-hued
 * gradient tile with the slot's monoline glyph — so an image-less catalogue
 * still looks deliberate instead of broken.
 *
 * The photo goes through `/api/product-image`, which contains it inside a square
 * and flattens it onto this same surface colour — so `object-cover` here can
 * never crop a bottle, because by the time the bytes arrive they are already
 * square. See `@/lib/images/product-image` for why that happens at ingest rather
 * than in CSS.
 */
export function ProductTile({ imageUrl, slot, title, size = 96, fill = false, className }: Props) {
  const { glyph, hue } = slotVisual(slot)
  const src = productImageSrc(imageUrl, size)
  const srcSet = productImageSrcSet(imageUrl, size)

  return (
    <div
      className={`rounded-xl overflow-hidden flex items-center justify-center ${fill ? 'w-full aspect-square' : 'flex-shrink-0'} ${className ?? ''}`}
      style={{
        width: fill ? undefined : size,
        height: fill ? undefined : size,
        background: src
          ? 'var(--color-surface-2)'
          : `radial-gradient(circle at 32% 26%, color-mix(in srgb, ${hue} 26%, transparent), transparent 72%), var(--color-surface-2)`,
        border: src
          ? '1px solid var(--color-border)'
          : `1px solid color-mix(in srgb, ${hue} 24%, var(--color-border))`,
      }}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          srcSet={srcSet ?? undefined}
          alt={title ?? ''}
          width={size}
          height={size}
          className="w-full h-full object-cover"
          loading="lazy"
          decoding="async"
        />
      ) : (
        /* The glyph is sized against the tile it is drawn in, which in `fill`
           mode is the container and not `size` — `size` there is what the image
           pipeline is asked for (320px for a shelf card), and scaling a fallback
           glyph to 42% of THAT filled a 166px card with a 134px moon. */
        <span className={fill ? 'block w-[42%] [&_svg]:w-full [&_svg]:h-auto' : ''} style={{ color: hue, opacity: 0.92 }}>
          <QuizIcon name={glyph} size={Math.round(size * 0.42)} />
        </span>
      )}
    </div>
  )
}
