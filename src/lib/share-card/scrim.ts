import { SHARE_PALETTE as P } from './palette'

/**
 * The card's scrim — what keeps type readable over the picture.
 *
 * ── Why it is a module and not four divs in the renderer ────────────────────
 * Two places draw it: the card itself, and the Founders Hub upload slots, whose
 * whole claim is "this is what the card will look like rather than what the
 * photograph looks like". That claim is only true while the two are the same
 * gradients, and the second copy was a hand-typed string in a `style` prop.
 *
 * ── What it is protecting ───────────────────────────────────────────────────
 * One gradient used to do all of this, and its stops were cut against the
 * gradient stand-ins in `art.ts`: those are near-black by construction, keep
 * their left third dark on purpose, and fade to the ink in their own last
 * layer. A scrim that did almost nothing through the middle of the picture
 * looked fine over them.
 *
 * An uploaded photograph carries none of those guarantees. Measured over a
 * light frame, the band the headline sits in was passing about 98% of the
 * picture — near-white type on a ground of 198, which is a contrast ratio of
 * 1.6:1, and a stamp and a second headline line that were simply not there.
 *
 * So each layer now states what it protects, and none of them assumes anything
 * about the picture. `render.test.tsx` holds the result to a number: wherever
 * the raster has type, the ground behind it is dark enough to read on.
 */

/** What the stops need to know about the canvas they are being cut for. */
export interface ScrimGeometry {
  /** How far the picture bleeds down the card. */
  artH: number
  /** The foot of the header rail — see `railFloor` in the renderer. */
  railFloor: number
}

function withAlpha(hex: string, alpha: number): string {
  const h = hex.replace('#', '')
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16))
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

/**
 * A pixel distance, as a gradient stop.
 *
 * The vertical stops are all "this far down the picture", not "this fraction of
 * it" — the rail sits at a fixed y and the picture's height changes per format.
 * Written as a percentage because that is the stop unit both Satori and the
 * preview parse; the arithmetic is the same either way.
 */
const pct = (px: number, of: number) =>
  `${Math.max(0, Math.min(100, (px / of) * 100)).toFixed(2)}%`

/**
 * The four layers over the picture, in paint order — first is furthest back.
 *
 * Separate layers rather than one comma-separated `background-image`, because
 * Satori takes a single gradient per element reliably and a list less so. The
 * preview, which is a browser, may join them (reversed — CSS paints the first
 * in a list on top).
 *
 * These are the card-wide layers. The type block carries a fifth of its own,
 * drawn from inside it because only the block knows where its top edge is once
 * its contents have been laid out.
 */
export function scrimLayers(g: ScrimGeometry): string[] {
  return [
    // 1. The header rail. Held to the foot of the rail rather than to a fixed
    //    22% of the picture: on the story frames the rail sits at y=252 and the
    //    old stop had released by y=266, which is why the masthead was riding
    //    bare photograph.
    `linear-gradient(to bottom, ${withAlpha(P.groundBase, 0.7)} 0%, ${withAlpha(P.groundBase, 0.58)} ${pct(g.railFloor, g.artH)}, transparent ${pct(g.railFloor + 110, g.artH)})`,

    // 2. Exposure. A flat pull-down over the whole picture, so a frame shot
    //    brighter than the set cannot light up the crop marks and the outlined
    //    score — the two marks with nothing else behind them. Small enough that
    //    the picture is still a picture.
    `linear-gradient(to bottom, ${withAlpha(P.groundBase, 0.12)} 0%, ${withAlpha(P.groundBase, 0.12)} 100%)`,

    // 3. The type side. Every mark on this card is set from the left margin,
    //    and two of them — the outlined score and the "CHARGE INDEX" spine —
    //    sit in the picture with nothing else behind them. The stand-in fields
    //    keep their left third dark by construction for exactly this reason and
    //    the art brief asks photography to do the same; the card grades it
    //    anyway, because a brief is not a guarantee. The right side, where a
    //    frame's subject usually is and where nothing but the stamp is set,
    //    keeps the picture.
    //
    //    It does not make the accent clear AA at the spine's size — nothing
    //    short of blacking the picture out would, and the palette says as much
    //    about cyan on anything but the ground. It takes that label from
    //    unreadable to legible, which is the difference that matters.
    `linear-gradient(to right, ${withAlpha(P.groundBase, 0.78)} 0%, ${withAlpha(P.groundBase, 0.56)} 22%, ${withAlpha(P.groundBase, 0.3)} 42%, transparent 58%)`,

    // 4. The seam. Closes to the ink rather than to 88% of it: the last product
    //    row sits within a few pixels of where the picture ends, and a picture
    //    still 12% visible there is a picture behind the type — with a hard
    //    edge under it where the ground took over.
    `linear-gradient(to bottom, transparent 52%, ${withAlpha(P.groundBase, 0.55)} 78%, ${P.groundBase} 100%)`,
  ]
}

/**
 * How far above the type block its own ground starts to close.
 *
 * The block is bottom-anchored and its height is whatever its contents come to
 * — the entry card carries a prize and three steps the story card does not, and
 * its type starts some 270px higher — so nothing outside it knows where its top
 * edge lands. Which is why that layer is drawn from inside the block, and why
 * this is the one scrim number in pixels rather than a stop.
 *
 * The fade is long on purpose: over 300px a scrim reads as light falling off,
 * and over 100px it reads as a box somebody drew behind the text.
 */
export const TYPE_SCRIM_RISE = 300

/** The type block's own ground, as a `background-image`. */
export function typeScrim(): string {
  return `linear-gradient(to bottom, transparent 0px, ${withAlpha(P.groundBase, 0.62)} ${TYPE_SCRIM_RISE}px, ${withAlpha(P.groundBase, 0.82)} ${TYPE_SCRIM_RISE + 260}px)`
}

/** The geometry of the story frame, which is what the upload previews show. */
export const STORY_SCRIM: ScrimGeometry = { artH: 1210, railFloor: 315 }
