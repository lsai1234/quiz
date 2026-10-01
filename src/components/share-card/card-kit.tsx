import { FONT_DISPLAY, FONT_MONO } from '@/lib/share-card/fonts'
import { GRAIN_DATA_URI, GRAIN_TILE_PX } from '@/lib/share-card/grain'
import { SHARE_PALETTE as P } from '@/lib/share-card/palette'
import { artField } from '@/lib/share-card/art'
import { scrimLayers } from '@/lib/share-card/scrim'

/**
 * The pieces both card templates are set from.
 *
 * The story poster and the giveaway card are different compositions in the same
 * two faces, the same ink, the same photograph under the same scrim, the same
 * crop marks and the same grain. These are the parts that must not drift
 * between them, so they live once.
 */

export const display = (size: number, weight: 400 | 600 | 800, color: string, tracking = -0.022) => ({
  fontFamily: FONT_DISPLAY,
  fontSize: size,
  fontWeight: weight,
  letterSpacing: `${tracking}em`,
  color,
})

export const mono = (size: number, weight: 400 | 500 | 600, color: string, tracking: number) => ({
  fontFamily: FONT_MONO,
  fontSize: size,
  fontWeight: weight,
  letterSpacing: `${tracking}em`,
  color,
})

export function withAlpha(hex: string, alpha: number): string {
  const h = hex.replace('#', '')
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16))
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

/**
 * The width of a line of Big Shoulders, in ems, estimated.
 *
 * Satori has no measuring pass to borrow, and a table accurate to a few percent
 * is enough when the result is clamped anyway. `I`, `1` and the like are half
 * the width of everything else in a condensed face, which is most of the error
 * a flat average would make.
 */
const NARROW = new Set(['I', 'J', 'L', '1', 'İ', '.', ',', ':', ';', "'", '’', '!', '|', ' ', '-'])
const WIDE = new Set(['M', 'W', 'Q', '@', '&'])

export function widthEm(text: string): number {
  let em = 0
  for (const ch of text.toUpperCase()) {
    em += NARROW.has(ch) ? 0.24 : WIDE.has(ch) ? 0.58 : 0.46
  }
  return em
}

/** The bolt, at rail size. */
export function Bolt({ size, color }: { size: number; color: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M14 2 L6.5 13.4 H11 L9.5 22 L17.5 10.6 H13 Z" fill={color} />
    </svg>
  )
}

/** Grain, over everything. Last child, since Satori paints in tree order. */
export function Grain({ w, h }: { w: number; h: number }) {
  return (
    <div
      style={{
        display: 'flex',
        position: 'absolute',
        top: 0, left: 0, width: w, height: h,
        backgroundImage: `url(${GRAIN_DATA_URI})`,
        backgroundRepeat: 'repeat',
        backgroundSize: `${GRAIN_TILE_PX}px ${GRAIN_TILE_PX}px`,
        opacity: 0.07,
        mixBlendMode: 'overlay',
      }}
    />
  )
}

/**
 * The picture, when there is no picture.
 *
 * Layered gradients standing in for the photography that has not been shot. Each
 * layer is its own div because Satori takes one `background-image` per element
 * reliably and a comma-separated list less so. See `art.ts` for why this beats a
 * product render.
 */
function ArtField({ artKey, w, h }: { artKey: string | undefined; w: number; h: number }) {
  const field = artField(artKey as never)
  return (
    <div
      style={{
        display: 'flex',
        position: 'absolute',
        top: 0,
        left: 0,
        width: w,
        height: h,
        backgroundImage: field.base,
      }}
    >
      {field.layers.map((layer, i) => (
        <div
          key={i}
          style={{
            display: 'flex',
            position: 'absolute',
            top: 0,
            left: 0,
            width: w,
            height: h,
            backgroundImage: layer.image,
            opacity: layer.opacity ?? 1,
          }}
        />
      ))}
    </div>
  )
}

/**
 * The photograph, full bleed from the top edge, under its scrim.
 *
 * `art` is the resolved image — an upload, or null for the family's gradient
 * field. The scrim is four layers, each stating what it protects — the header
 * rail, the picture's exposure, the type side, the seam. They live in
 * `scrim.ts` because the Founders Hub upload slots draw the same gradients over
 * the same crop, and a preview that has typed its own copy of them is a preview
 * that quietly stops being one.
 *
 * One wrapper rather than a fragment: Satori lays a fragment out as a row
 * container instead of flattening it.
 */
export function Picture({ art, artKey, w, h, artH, railFloor }: {
  art: string | null
  artKey: string | undefined
  w: number
  h: number
  artH: number
  railFloor: number
}) {
  return (
    <div style={{ display: 'flex', position: 'absolute', top: 0, left: 0, width: w, height: h }}>
      {/* ── Art: full bleed, hard crop, no radius ─────────────────────────── */}
      {art ? (
        <div
          style={{
            display: 'flex',
            position: 'absolute',
            top: 0,
            left: 0,
            width: w,
            height: artH,
            overflow: 'hidden',
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={art}
            alt=""
            width={w}
            height={artH}
            style={{ objectFit: 'cover', objectPosition: 'center top' }}
          />
        </div>
      ) : (
        <ArtField artKey={artKey} w={w} h={artH} />
      )}
      {scrimLayers({ artH, railFloor }).map((layer, i) => (
        <div
          key={i}
          style={{
            display: 'flex',
            position: 'absolute',
            top: 0, left: 0, width: w, height: artH,
            backgroundImage: layer,
          }}
        />
      ))}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          top: artH - 2, left: 0, width: w, height: h - artH + 2,
          background: P.groundBase,
        }}
      />
    </div>
  )
}

/**
 * Crop marks: honest to the report conceit. Decoration, never type — they sit
 * 44px in from each corner, inside the story frame's safe bands, which is where
 * imagery and marks are allowed to go and type is not.
 */
export function CropMarks({ w, h, inset = 44, arm = 34, color = withAlpha(P.ink1, 0.34), weight = 1.5 }: {
  w: number
  h: number
  inset?: number
  arm?: number
  color?: string
  weight?: number
}) {
  return (
    <div style={{ display: 'flex', position: 'absolute', top: 0, left: 0, width: w, height: h }}>
      {[
        { top: inset, left: inset, borderTopWidth: weight, borderLeftWidth: weight },
        { top: inset, right: inset, borderTopWidth: weight, borderRightWidth: weight },
        { bottom: inset, left: inset, borderBottomWidth: weight, borderLeftWidth: weight },
        { bottom: inset, right: inset, borderBottomWidth: weight, borderRightWidth: weight },
      ].map((pos, i) => (
        <div
          key={i}
          style={{
            display: 'flex',
            position: 'absolute',
            width: arm,
            height: arm,
            borderStyle: 'solid',
            borderColor: color,
            borderTopWidth: 0, borderRightWidth: 0, borderBottomWidth: 0, borderLeftWidth: 0,
            ...pos,
          }}
        />
      ))}
    </div>
  )
}
