'use client'

import { useEffect, useState, type CSSProperties } from 'react'
import { QuizIcon } from '@/components/quiz/QuizIcon'
import { slotVisual } from '@/lib/catalogue/slot-visuals'
import { productImageSrc, productImageSrcSet, IMAGE_PLATE } from '@/lib/images/product-image'

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
  /** Layout only — corner radii, mostly. */
  style?: CSSProperties
  className?: string
}

/**
 * A product photo.
 *
 * Every photo sits on the same white panel. The pipeline pads each image to a
 * white square at ingest and this frame is the same white, so there is no
 * combination of source aspect, keying outcome or cache state that produces a
 * dark gap round a product — which is the only thing that made the shelf look
 * unfinished.
 *
 * When the catalogue has no photo at all, a designed fallback: a soft slot-hued
 * gradient with the slot's monoline glyph, so an image-less catalogue looks
 * deliberate instead of empty.
 */
export function ProductTile({
  imageUrl, slot, title, size = 96, fill = false, inset = false, style, className,
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
          Rounded by default, at a radius proportional to the tile.

          Every photo in the app is a hard-cornered white square against a dark
          surface, which is the single sharpest edge on any screen it appears
          on — a 30px thumbnail in the reveal's order list reads as a sticker
          somebody pasted on rather than as part of the row. A proportional
          radius keeps a 30px chip and a 320px card looking like the same
          object at two sizes, where one fixed value makes the small one look
          square and the large one look like a lozenge.

          Only in fixed-size mode. In `fill` mode `size` is the width the image
          PIPELINE is asked for (320 for a shelf card), not the width the tile
          draws at — scaling a radius off it would put a 58px curve on the
          bottom corners of a product card whose top two are set to the card
          radius. Those callers set their own, which is right: a photo that
          meets the top of its card has to match the card, not a rule.
        */
        borderRadius: fill ? undefined : Math.max(6, Math.round(size * 0.18)),
        /*
          One white panel, every photo, every size.

          This is the belt to the pipeline's braces: the route already pads each
          image to a white square, and setting the frame to the same white means
          a photo that never reached the route — a cold CDN, a supplier timeout,
          a deploy that is behind — still lands on an identical panel instead of
          letterboxing into the dark card. There is no code path that produces a
          dark gap around a product.
        */
        background: src
          ? IMAGE_PLATE
          : `radial-gradient(circle at 32% 26%, color-mix(in srgb, ${hue} 26%, transparent), transparent 72%), var(--surface-hi, var(--color-surface-2))`,
        ...style,
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
