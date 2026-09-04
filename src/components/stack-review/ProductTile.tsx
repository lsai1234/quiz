'use client'

import { useEffect, useState, type CSSProperties } from 'react'
import { QuizIcon } from '@/components/quiz/QuizIcon'
import { slotVisual } from '@/lib/catalogue/slot-visuals'
import { productImageSrc, productImageSrcSet, IMAGE_FALLBACK_BACKGROUND } from '@/lib/images/product-image'

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
  /**
   * Fade the photo in when it decodes.
   *
   * The frame is already laid out at its final size, so nothing moves — this is
   * only about the pop. A product appearing at full opacity the instant its
   * bytes land makes a shelf flicker into existence card by card; a 200ms fade
   * makes the same load read as the page settling.
   *
   * ── Why a ref callback and not just `onLoad` ────────────────────────────────
   * A cached image is already `complete` by the time React attaches the
   * handler, so `onLoad` never fires and the photo stays at opacity 0 forever.
   * That is invisible on a cold load and total on a warm one — every product in
   * the basket drawer was a blank chip, and every shelf would have gone empty on
   * a second visit. The ref checks `complete` at attach time; `onLoad` covers
   * the images still in flight.
   */
  const [loaded, setLoaded] = useState(false)
  useEffect(() => { setAttempt(0); setLoaded(false) }, [imageUrl])

  const raw = imageUrl ?? null
  const src = attempt === 0 ? normalised : attempt === 1 ? raw : null
  const srcSet = attempt === 0 ? productImageSrcSet(imageUrl, size) : null

  return (
    <div
      className={`relative overflow-hidden flex items-center justify-center ${fill ? 'w-full aspect-square' : 'flex-shrink-0'} ${className ?? ''}`}
      style={{
        width: fill ? undefined : size,
        height: fill ? undefined : size,
        /*
          A photo gets a plate UNLESS it has a spotlight behind it.

          Cut-outs are mostly dark tubs, and a dark tub on a dark drawer at 56px
          is invisible — which is exactly what happened to the basket line items
          the first time this shipped, twice: once with no plate at all and again
          with a dark one.

          So the plate is LIGHT, the same tile the pipeline falls back to. At
          card size the product gets the whole frame and a spotlight to sit on,
          and a bright rectangle there would be the loudest thing on the shelf.
          At thumbnail size there is no room for a spotlight, the product is
          small enough that its plate is a chip rather than a panel, and a light
          chip is what makes a dark tub legible.
        */
        background: src
          ? (spotlight ? undefined : IMAGE_FALLBACK_BACKGROUND)
          : `radial-gradient(circle at 32% 26%, color-mix(in srgb, ${hue} 26%, transparent), transparent 72%), var(--surface-hi, var(--color-surface-2))`,
        borderRadius: src && !spotlight ? 'var(--r-control)' : undefined,
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
          ref={(el) => { if (el?.complete) setLoaded(true) }}
          onLoad={() => setLoaded(true)}
          onError={() => setAttempt((a) => a + 1)}
          style={{ opacity: loaded ? 1 : 0, transition: 'opacity 200ms ease-out' }}
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
