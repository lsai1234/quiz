'use client'

import { useEffect, useState } from 'react'
import { QuizIcon } from '@/components/quiz/QuizIcon'
import { slotVisual } from '@/lib/catalogue/slot-visuals'
import { productImageSrc, productImageSrcSet, IMAGE_BACKGROUND } from '@/lib/images/product-image'

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
  /**
   * Inset the photo inside its plate, as a fraction of the tile.
   *
   * Supplier photography is cut-outs on white at wildly different framings —
   * one product fills its frame, the next floats in the middle of a 2:3 JPEG.
   * Rendered flush, a shelf of them has no common baseline and reads as a
   * collage. A consistent inset gives every product the same white margin, so
   * the cards look like one set of objects photographed the same way even when
   * the source images were not.
   */
  pad?: boolean
  className?: string
}

/**
 * The visual anchor for a product across Act 4 and the shop.
 *
 * Shows the real photo when the catalogue has one, otherwise a designed
 * fallback — a soft, slot-hued gradient tile with the slot's monoline glyph — so
 * an image-less catalogue still looks deliberate instead of broken.
 *
 * ── `object-contain`, on white, always ───────────────────────────────────────
 * `object-cover` was cropping real product photos: a 500g pouch shot in
 * portrait lost its top and bottom to a square tile. Cover is only safe when
 * the source is already square, and the source is whatever the brand sent.
 * Contain never crops, and the padding it leaves is white to match the ground
 * these photos are shot on — see `@/lib/images/product-image` for why the
 * pipeline pads the same colour.
 *
 * ── The fallback chain ───────────────────────────────────────────────────────
 * The photo is requested through `/api/product-image`, which declines anything
 * that is not in the catalogue. If it declines, or the supplier's own image
 * 404s, this falls back to the raw source and then to the designed tile. A
 * photo that renders unnormalised is a worse-looking card; a broken image is a
 * broken shop, and the first version of this failed silently into the second.
 */
export function ProductTile({ imageUrl, slot, title, size = 96, fill = false, pad = false, className }: Props) {
  const { glyph, hue } = slotVisual(slot)
  const normalised = productImageSrc(imageUrl, size)

  /** 0 = the pipeline, 1 = the supplier's own URL, 2 = give up and draw the tile. */
  const [attempt, setAttempt] = useState(0)
  useEffect(() => { setAttempt(0) }, [imageUrl])

  const raw = imageUrl ?? null
  const src = attempt === 0 ? normalised : attempt === 1 ? raw : null
  const srcSet = attempt === 0 ? productImageSrcSet(imageUrl, size) : null

  return (
    <div
      className={`rounded-xl overflow-hidden flex items-center justify-center ${fill ? 'w-full aspect-square' : 'flex-shrink-0'} ${className ?? ''}`}
      style={{
        width: fill ? undefined : size,
        height: fill ? undefined : size,
        background: src
          ? IMAGE_BACKGROUND
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
          className={`w-full h-full object-contain ${pad ? 'p-[9%]' : ''}`}
          loading="lazy"
          decoding="async"
          onError={() => setAttempt((a) => a + 1)}
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
