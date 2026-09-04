'use client'

import { useEffect, useState, type CSSProperties } from 'react'
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
   * `size` is still what the image pipeline is asked for, and roughly what the
   * tile renders at.
   */
  fill?: boolean
  /**
   * Inset the product inside its frame, as a fraction of the tile.
   *
   * A cut-out trimmed to its own bounds fills the frame edge to edge, which
   * reads as cropped even though nothing has been cut — and leaves the add
   * control nowhere to sit that is not on top of the product. A 10% margin is
   * what makes it look photographed rather than jammed in.
   */
  inset?: boolean
  /**
   * A soft radial light behind the product.
   *
   * A cut-out on a flat dark card floats in a void — there is nothing for it to
   * sit on and it reads as a sticker. A very soft pool of light gives it a
   * ground. This is the one gradient in the storefront and it is doing a job
   * nothing else can: it is the difference between a product photographed on a
   * surface and a product pasted onto one.
   */
  spotlight?: boolean
  /** Layout only — corner radii, mostly. */
  style?: CSSProperties
  className?: string
}

/**
 * A product photo.
 *
 * The image arrives from `/api/product-image` already cut out of its white
 * ground and trimmed to the product itself, so this composites it directly onto
 * whatever surface the caller provides. There is no plate: the tile is
 * transparent and the card shows through.
 *
 * When the pipeline could not safely cut a photo it returns that photo on a
 * light tile of its own, baked into the pixels — so this component needs no
 * branch for it, and a shelf with one uncuttable product in it degrades to one
 * light card among dark ones rather than to something broken.
 *
 * When the catalogue has no photo at all, a designed fallback: a soft slot-hued
 * gradient with the slot's monoline glyph, so an image-less catalogue looks
 * deliberate instead of empty.
 */
export function ProductTile({
  imageUrl, slot, title, size = 96, fill = false, spotlight = false, inset = false, style, className,
}: Props) {
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
      className={`relative overflow-hidden flex items-center justify-center ${fill ? 'w-full aspect-square' : 'flex-shrink-0'} ${className ?? ''}`}
      style={{
        width: fill ? undefined : size,
        height: fill ? undefined : size,
        background: src
          ? undefined
          : `radial-gradient(circle at 32% 26%, color-mix(in srgb, ${hue} 26%, transparent), transparent 72%), var(--surface-hi, var(--color-surface-2))`,
        ...style,
      }}
    >
      {src && spotlight && (
        <span
          aria-hidden
          className="absolute inset-0 pointer-events-none"
          style={{
            background: 'radial-gradient(ellipse 62% 55% at 50% 46%, rgba(255,255,255,0.075), transparent 70%)',
          }}
        />
      )}

      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          srcSet={srcSet ?? undefined}
          alt={title ?? ''}
          width={size}
          height={size}
          className={`relative w-full h-full object-contain ${inset ? 'p-[10%]' : ''}`}
          loading="lazy"
          decoding="async"
          onError={() => setAttempt((a) => a + 1)}
        />
      ) : (
        /* The glyph is sized against the tile it is drawn in, which in `fill`
           mode is the container and not `size` — `size` there is what the image
           pipeline is asked for (320px for a shelf card), and scaling a fallback
           glyph to 42% of THAT filled a 173px card with a 134px moon. */
        <span className={fill ? 'block w-[42%] [&_svg]:w-full [&_svg]:h-auto' : ''} style={{ color: hue, opacity: 0.92 }}>
          <QuizIcon name={glyph} size={Math.round(size * 0.42)} />
        </span>
      )}
    </div>
  )
}
